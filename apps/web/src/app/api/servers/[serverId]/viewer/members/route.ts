import { NextResponse } from "next/server";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { getServerClient } from "@/lib/appwrite-server";
import { listServerMembers } from "@/lib/server-members";
import { logger, returnForbidden } from "@/lib/posthog-utils";

const env = getEnvConfig();

type RouteContext = {
    params: Promise<{ serverId: string }>;
};

/**
 * Read-only member list for the member rail.
 *
 * Deliberately separate from `../members`, which stays gated on `manageRoles`
 * because the role-management dialogs read role ids and moderation flags from
 * it. This endpoint only needs to know who is in the server, so it is gated on
 * membership alone and returns just what a member row renders: identity plus
 * the member's highest-ranked role, already resolved and sorted.
 */
export async function GET(_request: Request, context: RouteContext) {
    try {
        const { serverId } = await context.params;
        const { databases } = getServerClient();

        const session = await getServerSession();
        if (!session?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const access = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            session.$id,
        );

        if (!access.isMember) {
            return returnForbidden();
        }

        const { members, truncated } = await listServerMembers(serverId);

        return NextResponse.json({
            // Explicit nulls rather than omitted keys: `undefined` is dropped
            // by JSON.stringify, which would make the response shape depend on
            // which optional profile fields happen to be set.
            members: members.map((member) => ({
                userId: member.userId,
                username: member.userName ?? null,
                displayName: member.displayName ?? null,
                avatarUrl: member.avatarUrl ?? null,
                role: member.primaryRole,
            })),
            truncated,
        });
    } catch (error) {
        logger.error("Failed to list members for viewer", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list members" },
            { status: 500 },
        );
    }
}
