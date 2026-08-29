"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ID, Account, Client, Users } from "node-appwrite";
import {
    getSessionTokenFromCookie,
    invalidateSessionCacheForToken,
    requireAuth,
} from "@/lib/auth-server";
import {
    deleteAvatarFile,
    deleteProfileBackgroundFile,
    getOrCreateUserProfile,
    tombstoneUserProfile,
    updateProfileBackgroundImageState,
    updateUserProfile,
} from "@/lib/appwrite-profiles";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";
import { logger } from "@/lib/posthog-utils";
import {
    getEligibleFramesForUser,
    isUserEligibleForFrame,
    isValidPresetFrameId,
} from "@/lib/preset-frames";

const BACKGROUND_CHANGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const UNSAFE_GRADIENT_TOKEN_PATTERN = /(?:url\s*\(|data:|javascript:)/i;
const SAFE_GRADIENT_PATTERN =
    /^(linear-gradient|radial-gradient|conic-gradient)\([^;{}<>`\\]+\)$/i;

function canChangeBackground(profile: {
    profileBackgroundImageChangedAt?: string;
}): boolean {
    if (!profile.profileBackgroundImageChangedAt) {
        return true;
    }
    const lastChanged = new Date(
        profile.profileBackgroundImageChangedAt,
    ).getTime();
    const now = Date.now();
    return now - lastChanged >= BACKGROUND_CHANGE_COOLDOWN_MS;
}

function getRemainingCooldownMs(profile: {
    profileBackgroundImageChangedAt?: string;
}): number {
    if (!profile.profileBackgroundImageChangedAt) {
        return 0;
    }
    const lastChanged = new Date(
        profile.profileBackgroundImageChangedAt,
    ).getTime();
    const nextAllowed = lastChanged + BACKGROUND_CHANGE_COOLDOWN_MS;
    return Math.max(0, nextAllowed - Date.now());
}

function normalizeWebsiteInput(value: string | null): string | null {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
        return null;
    }

    const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

    try {
        const parsed = new URL(candidate);
        if (!["http:", "https:"].includes(parsed.protocol)) {
            return null;
        }

        return parsed.toString();
    } catch {
        return null;
    }
}

function normalizeBackgroundGradientInput(value: string | null): string | null {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
        return null;
    }

    if (UNSAFE_GRADIENT_TOKEN_PATTERN.test(trimmed)) {
        return null;
    }

    if (!SAFE_GRADIENT_PATTERN.test(trimmed)) {
        return null;
    }

    return trimmed;
}

/**
 * Update user profile server action
 */
export async function updateProfileAction(formData: FormData) {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    const displayName = formData.get("displayName") as string;
    const bio = formData.get("bio") as string;
    const pronouns = formData.get("pronouns") as string;
    const location = formData.get("location") as string;
    const website = formData.get("website") as string;
    const sanitizedWebsite = normalizeWebsiteInput(website);

    await updateUserProfile(profile.$id, {
        displayName: displayName || null,
        bio: bio || null,
        pronouns: pronouns || null,
        location: location || null,
        website: sanitizedWebsite,
    });

    revalidatePath("/settings");
}

/**
 * Upload avatar server action
 */
export async function uploadAvatarAction(formData: FormData) {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    const file = formData.get("avatar") as File;

    if (!file || file.size === 0) {
        throw new Error("No file provided");
    }

    if (file.size > 2 * 1024 * 1024) {
        throw new Error("File size must be less than 2MB");
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        throw new Error(
            "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
        );
    }

    const { storage } = getAdminClient();
    const env = getEnvConfig();
    const previousAvatarFileId = profile.avatarFileId;

    const uploadedFile = await storage.createFile(
        env.buckets.avatars,
        ID.unique(),
        file,
    );

    await updateUserProfile(profile.$id, {
        avatarFileId: uploadedFile.$id,
    });

    if (previousAvatarFileId && previousAvatarFileId !== uploadedFile.$id) {
        try {
            await deleteAvatarFile(previousAvatarFileId);
        } catch (error) {
            logger.warn("Failed to delete previous avatar file after upload", {
                error: error instanceof Error ? error.message : String(error),
                fileId: previousAvatarFileId,
                userId: user.$id,
            });
            // Non-fatal cleanup failure; keep the newly saved avatar assignment.
        }
    }

    revalidatePath("/settings");
    return { success: true, fileId: uploadedFile.$id };
}

/**
 * Remove avatar server action
 */
export async function removeAvatarAction() {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);
    const previousAvatarFileId = profile.avatarFileId;

    await updateUserProfile(profile.$id, {
        avatarFileId: null,
    });

    if (previousAvatarFileId) {
        try {
            await deleteAvatarFile(previousAvatarFileId);
        } catch (error) {
            logger.warn(
                "Failed to delete avatar file during removeAvatarAction",
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    fileId: previousAvatarFileId,
                    userId: user.$id,
                },
            );
            // Non-fatal cleanup failure; DB state is already updated.
        }
    }

    revalidatePath("/settings");
    return { success: true };
}

/**
 * Update profile background color server action
 */
export async function updateProfileBackgroundAction(formData: FormData) {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    const backgroundColor = formData.get("backgroundColor") as string;
    const rawBackgroundGradient = formData.get("backgroundGradient") as string;
    const backgroundGradient = normalizeBackgroundGradientInput(
        rawBackgroundGradient,
    );

    if (rawBackgroundGradient?.trim() && !backgroundGradient) {
        throw new Error("Invalid background gradient");
    }

    const existingBackgroundFileId = profile.profileBackgroundImageFileId;

    if (!backgroundColor && !backgroundGradient) {
        await updateUserProfile(profile.$id, {
            profileBackgroundImageFileId: null,
            profileBackgroundColor: null,
            profileBackgroundGradient: null,
        });
    } else if (backgroundGradient) {
        await updateUserProfile(profile.$id, {
            profileBackgroundImageFileId: null,
            profileBackgroundColor: null,
            profileBackgroundGradient: backgroundGradient,
        });
    } else {
        await updateUserProfile(profile.$id, {
            profileBackgroundImageFileId: null,
            profileBackgroundColor: backgroundColor,
            profileBackgroundGradient: null,
        });
    }

    if (existingBackgroundFileId) {
        try {
            await deleteProfileBackgroundFile(existingBackgroundFileId);
        } catch (error) {
            logger.warn(
                "Failed to delete previous profile background file after background update",
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    fileId: existingBackgroundFileId,
                    userId: user.$id,
                },
            );
            // Non-fatal cleanup failure; profile already points to non-image background.
        }
    }

    revalidatePath("/settings");
    return { success: true };
}

/**
 * Upload profile background image server action
 * Rate limited to once every 12 hours
 */
export async function uploadProfileBackgroundAction(formData: FormData) {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);

    if (!canChangeBackground(profile)) {
        const remainingMs = getRemainingCooldownMs(profile);
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
        throw new Error(
            `You can change your background again in ${remainingHours} hour${remainingHours === 1 ? "" : "s"}.`,
        );
    }

    const file = formData.get("background") as File;

    if (!file || file.size === 0) {
        throw new Error("No file provided");
    }

    if (file.size > 5 * 1024 * 1024) {
        throw new Error("File size must be less than 5MB");
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        throw new Error(
            "Invalid file type. Only JPEG, PNG, and WebP are allowed",
        );
    }

    const { storage } = getAdminClient();
    const env = getEnvConfig();
    const previousBackgroundFileId = profile.profileBackgroundImageFileId;

    const uploadedFile = await storage.createFile(
        env.buckets.profileBackgrounds,
        ID.unique(),
        file,
    );

    await updateProfileBackgroundImageState(profile.$id, {
        profileBackgroundImageFileId: uploadedFile.$id,
        profileBackgroundImageChangedAt: new Date().toISOString(),
        profileBackgroundColor: null,
        profileBackgroundGradient: null,
    });

    if (
        previousBackgroundFileId &&
        previousBackgroundFileId !== uploadedFile.$id
    ) {
        try {
            await deleteProfileBackgroundFile(previousBackgroundFileId);
        } catch (error) {
            logger.warn(
                "Failed to delete previous profile background file after upload",
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    fileId: previousBackgroundFileId,
                    userId: user.$id,
                },
            );
            // Non-fatal cleanup failure; keep the newly saved background assignment.
        }
    }

    revalidatePath("/settings");
    return { success: true, fileId: uploadedFile.$id };
}

/**
 * Remove profile background image server action
 */
export async function removeProfileBackgroundAction() {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);
    const previousBackgroundFileId = profile.profileBackgroundImageFileId;

    await updateUserProfile(profile.$id, {
        profileBackgroundImageFileId: null,
        profileBackgroundColor: null,
        profileBackgroundGradient: null,
    });

    if (previousBackgroundFileId) {
        try {
            await deleteProfileBackgroundFile(previousBackgroundFileId);
        } catch (error) {
            logger.warn(
                "Failed to delete profile background file during removeProfileBackgroundAction",
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    fileId: previousBackgroundFileId,
                    userId: user.$id,
                },
            );
            // Non-fatal cleanup failure; DB state is already updated.
        }
    }

    revalidatePath("/settings");
    return { success: true };
}

/**
 * Get background change cooldown status
 */
export async function getBackgroundCooldownAction() {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);
    const remainingMs = getRemainingCooldownMs(profile);

    if (remainingMs <= 0) {
        return { canChange: true, remainingMs: 0, remainingHours: 0 };
    }

    return {
        canChange: false,
        remainingMs,
        remainingHours: Math.ceil(remainingMs / (60 * 60 * 1000)),
    };
}

/**
 * Set avatar frame preset server action
 */
export async function setAvatarFramePresetAction(frameId: string | null) {
    const user = await requireAuth();
    const profile = await getOrCreateUserProfile(user.$id, user.name);
    const normalizedFrameId = frameId?.trim() ?? null;

    if (!normalizedFrameId) {
        await updateUserProfile(profile.$id, {
            avatarFramePreset: null,
        });
        revalidatePath("/settings");
        revalidatePath(`/profile/${user.$id}`);
        return { success: true };
    }

    if (!isValidPresetFrameId(normalizedFrameId)) {
        throw new Error("Invalid frame preset");
    }

    const accountCreatedAt = user.$createdAt ?? profile.$createdAt ?? null;
    if (!accountCreatedAt) {
        throw new Error("Missing account creation timestamp");
    }

    if (!isUserEligibleForFrame(accountCreatedAt, normalizedFrameId)) {
        throw new Error("You are not eligible for this frame");
    }

    await updateUserProfile(profile.$id, {
        avatarFramePreset: normalizedFrameId,
    });

    revalidatePath("/settings");
    revalidatePath(`/profile/${user.$id}`);
    return { success: true };
}

/**
 * Get available avatar frames for the current user
 */
export async function getAvailableFramesAction() {
    const user = await requireAuth();

    const profile = await getOrCreateUserProfile(user.$id, user.name);
    const accountCreatedAt = user.$createdAt ?? profile.$createdAt ?? null;

    const eligibleFrames = accountCreatedAt
        ? getEligibleFramesForUser(accountCreatedAt)
        : [];

    return {
        frames: eligibleFrames,
        currentPreset: profile.avatarFramePreset,
        eligibilityKnown: accountCreatedAt !== null,
    };
}

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getVerificationRedirectUrl(): string {
    const configuredBaseUrl =
        process.env.SERVER_URL?.trim() ||
        process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
        "http://localhost:3000";

    const normalizedBaseUrl = configuredBaseUrl.replace(/\/$/, "");
    return `${normalizedBaseUrl}/api/auth/verify-email`;
}

/**
 * Creates a short-lived session from the current password to confirm the
 * caller really owns the account. The temp session is always deleted in the
 * caller's finally block.
 */
async function verifyCurrentPassword(userId: string, password: string):
    Promise<{ account: Account; users: Users; sessionSecret: string } | null> {
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

async function isEmailVerificationEnabled(): Promise<boolean> {
    try {
        return await getFeatureFlag(FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION);
    } catch {
        return false;
    }
}

export type AccountActionResult =
    | { success: true; message: string; verificationSent?: boolean }
    | { success: false; error: string };

/**
 * Changes the account email. Requires the current password; after the change
 * a verification email is sent when email verification is enabled.
 */
export async function changeEmailAction(
    formData: FormData,
): Promise<AccountActionResult> {
    const user = await requireAuth();
    const newEmail = (formData.get("email") as string)?.trim().toLowerCase();
    const password = formData.get("password") as string;

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

        revalidatePath("/settings");

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
        try {
            await verified.users.deleteSession({
                userId: user.$id,
                sessionId: "current",
            });
        } catch {
            // Best-effort temp session cleanup.
        }
    }
}

/**
 * Re-sends the email-change verification link using the caller's active
 * session, so a settings user doesn't have to re-enter their password.
 */
export async function resendEmailVerificationAction(): Promise<AccountActionResult> {
    const user = await requireAuth();
    const env = getEnvConfig();
    const token = await getSessionTokenFromCookie();

    try {
        if (!token) {
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

        if (token.startsWith("eyJ")) {
            client.setJWT(token);
        } else {
            client.setSession(token);
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
export async function deactivateAccountAction(
    formData: FormData,
): Promise<AccountActionResult> {
    const user = await requireAuth();
    const password = formData.get("password") as string;

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

        const cookieStore = await cookies();
        cookieStore.delete(`a_session_${env.project}`);

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
    }
}

/**
 * Permanently deletes the account: wipes custom files (avatar, background),
 * hard-deletes the Appwrite user, and replaces the profile with a permanent
 * "Deleted User" tombstone so the userId can never be reused.
 */
export async function deleteAccountAction(
    formData: FormData,
): Promise<AccountActionResult> {
    const user = await requireAuth();
    const password = formData.get("password") as string;

    if (!password) {
        return { success: false, error: "Password is required" };
    }

    const verified = await verifyCurrentPassword(user.$id, password);
    if (!verified) {
        return { success: false, error: "Current password is incorrect" };
    }

    const env = getEnvConfig();
    const sessionSecret =
        (await getSessionTokenFromCookie()) ?? verified.sessionSecret;

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

        const cookieStore = await cookies();
        cookieStore.delete(`a_session_${env.project}`);

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
    }
}
