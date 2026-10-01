import { Query } from "node-appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { chunkValues, listPages } from "@/lib/appwrite-pagination";
import { logger } from "@/lib/posthog-utils";
import type { Role } from "@/lib/types";
import type { MemberPrimaryRole } from "@/lib/api/typed";

const env = getEnvConfig();
const databaseId = env.databaseId || "main";
const membershipsCollectionId = env.collections.memberships || "memberships";
const profilesCollectionId = env.collections.profiles || "profiles";
const roleAssignmentsCollectionId = "role_assignments";
const rolesCollectionId = env.collections.roles || "roles";
const bannedUsersCollectionId = env.collections.bannedUsers || "banned_users";
const mutedUsersCollectionId = env.collections.mutedUsers || "muted_users";
const QUERY_ARRAY_LIMIT = 100;
const PAGE_SIZE = 100;
const MAX_DOCS = 10_000;

/**
 * The role shape comes from the generated API types, so the spec stays the one
 * description of it. It used to be restated here and had already drifted once.
 */
export type { MemberPrimaryRole } from "@/lib/api/typed";

export type ServerMember = {
    userId: string;
    userName?: string;
    displayName?: string;
    avatarUrl?: string;
    roleIds: string[];
    isBanned: boolean;
    isMuted: boolean;
    /** Highest-ranked role, resolved server-side so clients never need the
     * full role list to render a member row. Null when the member has no roles
     * or only references roles that no longer exist. */
    primaryRole: MemberPrimaryRole | null;
};

export type ServerMemberListing = {
    members: ServerMember[];
    orphanCount: number;
    truncated: boolean;
};

async function listAllServerDocuments(serverId: string, collectionId: string) {
    const { databases } = getServerClient();

    const { documents, truncated } = await listPages({
        databases,
        databaseId,
        collectionId,
        baseQueries: [Query.equal("serverId", serverId)],
        pageSize: PAGE_SIZE,
        warningContext: `listAll:${collectionId}`,
        maxDocs: MAX_DOCS,
    });

    return { documents: documents as Array<Record<string, unknown>>, truncated };
}

/**
 * Lists a server's members with profiles, moderation flags, and each member's
 * highest-ranked role already resolved.
 *
 * The result is ordered by role rank (highest `position` first) and then by
 * display name, so a member rail can render it directly. Ordering lives here
 * rather than in the client because the role hierarchy is server state.
 *
 * Shared by the `manageRoles` admin endpoint and the read-only member viewer;
 * each projects the fields its callers are allowed to see.
 */
export async function listServerMembers(
    serverId: string,
): Promise<ServerMemberListing> {
    const { databases } = getServerClient();

    const [membershipsResult, roleAssignmentsResult, rolesResult] =
        await Promise.all([
            listAllServerDocuments(serverId, membershipsCollectionId),
            listAllServerDocuments(serverId, roleAssignmentsCollectionId),
            listAllServerDocuments(serverId, rolesCollectionId),
        ]);

    const memberships = membershipsResult.documents;
    const roleAssignments = roleAssignmentsResult.documents;

    const roles = (rolesResult.documents as Array<Partial<Role>>).filter(
        (role): role is Partial<Role> & { $id: string } => Boolean(role?.$id),
    );

    const rolesById = new Map(roles.map((role) => [role.$id, role]));

    const membershipUserIds = memberships.map((membership) =>
        String(membership.userId),
    );
    const memberIdChunks = chunkValues(
        membershipUserIds,
        QUERY_ARRAY_LIMIT,
    );

    const [moderationChunkPages, profilePages] = await Promise.all([
        Promise.all(
            memberIdChunks.map((userIdChunk) =>
                Promise.all([
                    databases.listDocuments(
                        databaseId,
                        bannedUsersCollectionId,
                        [
                            Query.equal("serverId", serverId),
                            Query.equal("userId", userIdChunk),
                            Query.limit(userIdChunk.length),
                        ],
                    ),
                    databases.listDocuments(
                        databaseId,
                        mutedUsersCollectionId,
                        [
                            Query.equal("serverId", serverId),
                            Query.equal("userId", userIdChunk),
                            Query.limit(userIdChunk.length),
                        ],
                    ),
                ]),
            ),
        ),
        Promise.all(
            memberIdChunks.map((userIdChunk) =>
                databases.listDocuments(databaseId, profilesCollectionId, [
                    Query.equal("userId", userIdChunk),
                    Query.limit(userIdChunk.length),
                ]),
            ),
        ),
    ]);

    const bannedUserIds = new Set<string>();
    const mutedUserIds = new Set<string>();
    for (const [bannedPage, mutedPage] of moderationChunkPages) {
        for (const doc of bannedPage.documents as Array<
            Record<string, unknown>
        >) {
            bannedUserIds.add(String(doc.userId));
        }
        for (const doc of mutedPage.documents as Array<
            Record<string, unknown>
        >) {
            mutedUserIds.add(String(doc.userId));
        }
    }

    const roleMap = new Map<string, string[]>();
    for (const assignment of roleAssignments) {
        roleMap.set(String(assignment.userId), (assignment.roleIds as string[]) || []);
    }

    const profilesByUserId = new Map(
        (
            profilePages.flatMap(
                (page) => page.documents as Array<Record<string, unknown>>,
            )
        ).map((profile) => [String(profile.userId), profile]),
    );

    const members: ServerMember[] = [];
    const orphanUserIds: string[] = [];

    for (const membership of memberships) {
        const userId = String(membership.userId);
        const profile = profilesByUserId.get(userId);

        if (!profile) {
            orphanUserIds.push(userId);
            continue;
        }

        const roleIds = roleMap.get(userId) ?? [];
        // Pick the member's highest-ranked role, not the first one listed in
        // their assignment: roleIds order is not meaningful, `position` is.
        const primaryRole =
            roleIds
                .map((roleId) => rolesById.get(roleId))
                .filter((role): role is Partial<Role> & { $id: string } =>
                    Boolean(role),
                )
                .sort(
                    (left, right) =>
                        (right.position ?? 0) - (left.position ?? 0),
                )[0] ?? null;

        members.push({
            userId,
            // The stable account handle. `profiles` has no username field —
            // `userName` is a denormalized column on `messages` and is never
            // set here — so the Appwrite user ID is the handle. Federation's
            // profile endpoint requires a non-nullable `username`; using the
            // account ID satisfies that with no column and no uniqueness
            // problem, and a human-readable handle can be added later as an
            // additive change if one is ever wanted.
            userName: userId,
            displayName: profile.displayName as string | undefined,
            avatarUrl: profile.avatarUrl as string | undefined,
            roleIds,
            isBanned: bannedUserIds.has(userId),
            isMuted: mutedUserIds.has(userId),
            primaryRole: primaryRole
                ? {
                      id: primaryRole.$id,
                      name: primaryRole.name ?? "Unknown role",
                      color: primaryRole.color ?? "#8b8b8b",
                      position: primaryRole.position ?? 0,
                  }
                : null,
        });
    }

    if (orphanUserIds.length > 0) {
        logger.warn("Detected orphan memberships during member listing", {
            serverId,
            sampleUserIds: orphanUserIds.slice(0, 10),
        });
    }

    const truncated =
        membershipsResult.truncated ||
        roleAssignmentsResult.truncated ||
        rolesResult.truncated;

    if (truncated) {
        logger.warn("Member listing truncated", { serverId });
    }

    members.sort((left, right) => {
        // Members with no role sort below everyone who has one.
        const leftRank = left.primaryRole?.position ?? -1;
        const rightRank = right.primaryRole?.position ?? -1;
        if (leftRank !== rightRank) {
            return rightRank - leftRank;
        }
        const leftName = (
            left.displayName ||
            left.userName ||
            ""
        ).toLowerCase();
        const rightName = (
            right.displayName ||
            right.userName ||
            ""
        ).toLowerCase();
        if (leftName !== rightName) {
            return leftName.localeCompare(rightName);
        }
        return left.userId.localeCompare(right.userId);
    });

    return { members, orphanCount: orphanUserIds.length, truncated };
}
