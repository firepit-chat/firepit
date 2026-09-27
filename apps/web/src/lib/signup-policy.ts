// Signup policy + account approval state.
// Backed by the feature_flags collection (value: "open" | "approval" | "disabled")
// for the policy, and Appwrite user prefs (approvalStatus) for per-account state.
// SERVER-ONLY — uses the admin SDK.

import { ID, Query, Users } from "node-appwrite";
import { unstable_cache, revalidateTag } from "next/cache";

import { getServerClient } from "./appwrite-server";
import { getEnvConfig } from "./appwrite-core";
import { logger } from "./posthog-utils";

export type SignupPolicy = "open" | "approval" | "disabled";
export type ApprovalStatus = "approved" | "pending" | "rejected";

export const SIGNUP_POLICY_KEY = "signup_policy";
export const SIGNUP_POLICY_DESCRIPTION =
    "Signup policy: open, individual approval, or signups disabled";

const SIGNUP_POLICIES: SignupPolicy[] = ["open", "approval", "disabled"];
const DEFAULT_POLICY: SignupPolicy = "open";

export function isSignupPolicy(value: unknown): value is SignupPolicy {
    return (
        typeof value === "string" &&
        (SIGNUP_POLICIES as string[]).includes(value)
    );
}

export type PendingSignup = {
    userId: string;
    name: string;
    email: string;
    createdAt: string;
};

function normalizePrefs(prefs: unknown): Record<string, unknown> {
    return typeof prefs === "object" && prefs !== null
        ? (prefs as Record<string, unknown>)
        : {};
}

async function fetchSignupPolicy(): Promise<SignupPolicy> {
    try {
        const { databases } = getServerClient();
        const env = getEnvConfig();
        const response = await databases.listDocuments(
            env.databaseId,
            env.collections.featureFlags,
            [Query.equal("key", SIGNUP_POLICY_KEY), Query.limit(1)],
        );
        const doc = response.documents[0] as { value?: unknown } | undefined;
        if (doc && isSignupPolicy(doc.value)) {
            return doc.value;
        }
    } catch (error) {
        logger.error("Failed to read signup policy", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return DEFAULT_POLICY;
}

const getCachedSignupPolicy = unstable_cache(
    fetchSignupPolicy,
    ["signup-policy"],
    { revalidate: 60, tags: ["signup-policy"] },
);

/**
 * Returns the current instance signup policy.
 */
export async function getSignupPolicy(): Promise<SignupPolicy> {
    try {
        return await getCachedSignupPolicy();
    } catch {
        return DEFAULT_POLICY;
    }
}

/**
 * Sets the signup policy (admin only). The document is created on first
 * write if setup hasn't seeded it yet.
 */
export async function setSignupPolicy(
    policy: SignupPolicy,
    userId: string,
): Promise<boolean> {
    try {
        const { databases } = getServerClient();
        const env = getEnvConfig();
        const now = new Date().toISOString();
        const response = await databases.listDocuments(
            env.databaseId,
            env.collections.featureFlags,
            [Query.equal("key", SIGNUP_POLICY_KEY), Query.limit(1)],
        );

        if (response.documents.length === 0) {
            await databases.createDocument(
                env.databaseId,
                env.collections.featureFlags,
                ID.unique(),
                {
                    key: SIGNUP_POLICY_KEY,
                    value: policy,
                    enabled: true,
                    description: SIGNUP_POLICY_DESCRIPTION,
                    updatedAt: now,
                    updatedBy: userId,
                },
            );
        } else {
            await databases.updateDocument(
                env.databaseId,
                env.collections.featureFlags,
                response.documents[0].$id,
                {
                    value: policy,
                    updatedAt: now,
                    updatedBy: userId,
                },
            );
        }

        clearSignupPolicyCache();
        return true;
    } catch (error) {
        logger.error("Failed to set signup policy", {
            policy,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

export function clearSignupPolicyCache(): void {
    try {
        revalidateTag("signup-policy", "max");
    } catch (error) {
        logger.warn("Signup policy cache revalidation skipped", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Reads approval state from user prefs. Missing prefs means the account was
 * created before approval was required, so it is treated as approved.
 */
export function getApprovalStatusFromPrefs(prefs: unknown): ApprovalStatus {
    const status = normalizePrefs(prefs).approvalStatus;
    if (status === "pending") {return "pending";}
    if (status === "rejected") {return "rejected";}
    return "approved";
}

async function updateUserPrefs(
    userId: string,
    patch: Record<string, unknown>,
): Promise<void> {
    const { client } = getServerClient();
    const users = new Users(client);
    const user = await users.get(userId);
    await users.updatePrefs({
        userId,
        prefs: { ...normalizePrefs(user.prefs), ...patch },
    });
}

/**
 * Marks a freshly-registered account as pending admin approval.
 */
export async function markSignupPending(userId: string): Promise<void> {
    await updateUserPrefs(userId, { approvalStatus: "pending" });
}

/**
 * Marks a pending account as approved.
 */
export async function approveSignup(userId: string): Promise<void> {
    await updateUserPrefs(userId, { approvalStatus: "approved" });
}

/**
 * Lists all accounts awaiting admin approval.
 *
 * ponytail: prefs aren't queryable in Appwrite, so this scans all users and
 * filters in app code. Fine for light-enterprise instances; swap for a
 * dedicated approvals collection if user counts grow.
 */
export async function listPendingSignups(
    limit = 100,
): Promise<PendingSignup[]> {
    try {
        const { client } = getServerClient();
        const users = new Users(client);
        const pending: PendingSignup[] = [];
        let offset = 0;
        while (offset < limit) {
            const pageSize = Math.min(100, limit - offset);
            const page = await users.list({
                queries: [Query.limit(pageSize), Query.offset(offset)],
            });
            for (const user of page.users ?? []) {
                if (getApprovalStatusFromPrefs(user.prefs) === "pending") {
                    pending.push({
                        userId: user.$id,
                        name: user.name,
                        email: user.email,
                        createdAt: user.$createdAt ?? "",
                    });
                }
            }
            offset += page.users.length;
            if (page.users.length < pageSize) {break;}
        }
        return pending;
    } catch (error) {
        logger.error("Failed to list pending signups", {
            error: error instanceof Error ? error.message : String(error),
        });
        return [];
    }
}