// Account-level operations (change email, deactivate, delete, verify) shared
// by the server actions (settings/actions.ts) and the Bearer-token API routes
// (/api/account/*) that the mobile app calls.

import { Account, Client, Users } from "node-appwrite";

import {
    invalidateSessionCacheForToken,
    type SessionUser,
} from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";
import {
    deleteAvatarFile,
    deleteProfileBackgroundFile,
    getOrCreateUserProfile,
    tombstoneUserProfile,
} from "@/lib/appwrite-profiles";
import { logger } from "@/lib/posthog-utils";

export const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getVerificationRedirectUrl(): string {
    const configuredBaseUrl =
        process.env.SERVER_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        "http://localhost:3000";

    const normalizedBaseUrl = configuredBaseUrl.replace(/\/$/, "");
    return `${normalizedBaseUrl}/api/auth/verify-email`;
}

export async function isEmailVerificationEnabled(): Promise<boolean> {
    try {
        return await getFeatureFlag(FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION);
    } catch {
        return false;
    }
}

/**
 * Creates a short-lived session from the current password to confirm the
 * caller really owns the account. The temp session is cleaned up by the
 * caller in a finally block.
 */
export async function verifyCurrentPassword(
    userId: string,
    password: string,
): Promise<{ account: Account; users: Users; sessionSecret: string } | null> {
    const env = getEnvConfig();
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!apiKey) {
        throw new Error("Server API key not configured");
    }

    const client = new Client()
        .setEndpoint(env.endpoint)
        .setProject(env.project)
        .setKey(apiKey);
    const account = new Account(client);
    const users = new Users(client);

    try {
        const session = await account.createEmailPasswordSession({
            email: (await users.get(userId)).email,
            password,
        });

        if (session.userId !== userId) {
            return null;
        }

        return { account, users, sessionSecret: session.secret ?? "" };
    } catch {
        return null;
    }
}

// Best-effort: delete the temp verification session if it still exists.
async function cleanupTempSession(users: Users, userId: string): Promise<void> {
    try {
        await users.deleteSession({ userId, sessionId: "current" });
    } catch {
        // Best-effort; the account/temp session may already be gone.
    }
}

export type AccountActionResult =
    | { success: true; message: string; verificationSent?: boolean }
    | { success: false; error: string };

/**
 * Changes the account email. Requires the current password; sends a
 * verification email when email verification is enabled.
 */
export async function changeAccountEmail(
    user: SessionUser,
    input: { email: string; password: string },
): Promise<AccountActionResult> {
    const newEmail = input.email.trim().toLowerCase();
    const password = input.password;

    if (!newEmail || !password) {
        return { success: false, error: "New email and password are required" };
    }

    if (!EMAIL_ADDRESS_PATTERN.test(newEmail)) {
        return { success: false, error: "Invalid email address" };
    }

    if (newEmail === user.email) {
        return { success: false, error: "That is already your email address" };
    }

    const verified = await verifyCurrentPassword(user.$id, password);
    if (!verified) {
        return { success: false, error: "Current password is incorrect" };
    }

    const env = getEnvConfig();
    try {
        await verified.users.updateEmail({
            userId: user.$id,
            email: newEmail,
        });

        let verificationSent = false;
        if (await isEmailVerificationEnabled()) {
            try {
                await verified.account.createVerification({
                    url: getVerificationRedirectUrl(),
                });
                verificationSent = true;
            } catch (verificationError) {
                logger.warn("Failed to send email-change verification", {
                    error:
                        verificationError instanceof Error
                            ? verificationError.message
                            : String(verificationError),
                });
            }
        }

        if (verified.sessionSecret) {
            invalidateSessionCacheForToken(
                env.endpoint,
                env.project,
                verified.sessionSecret,
            );
        }

        return {
            success: true,
            message: verificationSent
                ? "Email updated. Check your inbox for a verification link."
                : "Email updated.",
            verificationSent,
        };
    } catch (error) {
        logger.error("Email change failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            success: false,
            error: "Email change failed. That address may already be in use.",
        };
    } finally {
        await cleanupTempSession(verified.users, user.$id);
    }
}

/**
 * Re-sends the verification email using the caller's active session.
 */
export async function resendAccountVerification(
    user: SessionUser,
    sessionToken: string | null,
): Promise<AccountActionResult> {
    const env = getEnvConfig();

    try {
        if (!sessionToken) {
            return {
                success: false,
                error: "No active session found. Sign in and try again.",
            };
        }

        if (!(await isEmailVerificationEnabled())) {
            return {
                success: false,
                error: "Email verification is not enabled on this instance.",
            };
        }

        const client = new Client()
            .setEndpoint(env.endpoint)
            .setProject(env.project);

        if (sessionToken.startsWith("eyJ")) {
            client.setJWT(sessionToken);
        } else {
            client.setSession(sessionToken);
        }

        await new Account(client).createVerification({
            url: getVerificationRedirectUrl(),
        });

        return {
            success: true,
            message: "Verification email sent. Check your inbox.",
            verificationSent: true,
        };
    } catch (error) {
        logger.error("Email verification resend failed", {
            userId: user.$id,
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            success: false,
            error: "Could not send the verification email. Try again in a moment.",
        };
    }
}

/**
 * Deactivates the account. Marked in Appwrite prefs so the login gate can
 * reactivate automatically on the next successful sign-in ("take a break").
 */
export async function deactivateAccount(
    user: SessionUser,
    password: string,
): Promise<AccountActionResult> {
    if (!password) {
        return { success: false, error: "Password is required" };
    }

    const verified = await verifyCurrentPassword(user.$id, password);
    if (!verified) {
        return { success: false, error: "Current password is incorrect" };
    }

    const env = getEnvConfig();
    try {
        await verified.users.updatePrefs({
            userId: user.$id,
            prefs: { disabled: true, disabledAt: new Date().toISOString() },
        });
        await verified.users.deleteSessions({ userId: user.$id });

        if (verified.sessionSecret) {
            invalidateSessionCacheForToken(
                env.endpoint,
                env.project,
                verified.sessionSecret,
            );
        }

        return {
            success: true,
            message:
                "Your account is deactivated. Sign back in anytime to reactivate it.",
        };
    } catch (error) {
        logger.error("Account deactivation failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, error: "Deactivation failed. Try again." };
    } finally {
        await cleanupTempSession(verified.users, user.$id);
    }
}

/**
 * Permanently deletes the account: wipes custom files (avatar, background),
 * hard-deletes the Appwrite user, and replaces the profile with a permanent
 * "Deleted User" tombstone so the userId can never be reused.
 */
export async function deleteAccount(
    user: SessionUser,
    password: string,
    sessionToken: string | null,
): Promise<AccountActionResult> {
    if (!password) {
        return { success: false, error: "Password is required" };
    }

    const verified = await verifyCurrentPassword(user.$id, password);
    if (!verified) {
        return { success: false, error: "Current password is incorrect" };
    }

    const env = getEnvConfig();
    const sessionSecret = sessionToken ?? verified.sessionSecret;

    try {
        const profile = await getOrCreateUserProfile(user.$id, user.name);

        if (profile.avatarFileId) {
            await deleteAvatarFile(profile.avatarFileId).catch(() => {});
        }
        if (profile.profileBackgroundImageFileId) {
            await deleteProfileBackgroundFile(
                profile.profileBackgroundImageFileId,
            ).catch(() => {});
        }

        await tombstoneUserProfile(profile, user.$id, user.email);

        await verified.users.delete({ userId: user.$id });

        if (sessionSecret) {
            invalidateSessionCacheForToken(
                env.endpoint,
                env.project,
                sessionSecret,
            );
        }

        return {
            success: true,
            message: "Your account has been deleted.",
        };
    } catch (error) {
        logger.error("Account deletion failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            success: false,
            error:
                "Account deletion failed. Try again or contact your administrator.",
        };
    } finally {
        await cleanupTempSession(verified.users, user.$id);
    }
}