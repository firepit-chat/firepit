import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { getServerClient } from "@/lib/appwrite-server";
import { listServerMembers } from "@/lib/server-members";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger, returnForbidden } from "@/lib/posthog-utils";

const env = getEnvConfig();

type RouteContext = {
    params: Promise<{ serverId: string }>;
};

/**
 * Full member list for role management.
 *
 * Gated on `manageRoles` because it exposes every role id a member holds plus
 * their ban and mute state. The read-only member rail uses
 * `../viewer/members` instead, which only requires membership.
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

        if (!access.isMember || !access.permissions.manageRoles) {
            return returnForbidden();
        }

        const { members, orphanCount, truncated } =
            await listServerMembers(serverId);

        return NextResponse.json({
            members: members.map((member) => ({
                userId: member.userId,
                userName: member.userName,
                displayName: member.displayName,
                avatarUrl: member.avatarUrl,
                roleIds: member.roleIds,
                isBanned: member.isBanned,
                isMuted: member.isMuted,
            })),
            orphanCount,
            truncated,
        });
    } catch (error) {
        logger.error("Failed to list server members", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list server members" },
            { status: 500 },
        );
    }
}
