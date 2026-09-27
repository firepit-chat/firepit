import { NextResponse } from "next/server";

import { listGlobalMessages } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerClient } from "@/lib/appwrite-server";
import { getProfilesByUserIds } from "@/lib/appwrite-profiles";
import { checkUserRoles, requireAuth } from "@/lib/auth-server";
import { clampLimit } from "@/lib/appwrite-reports";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { logger } from "@/lib/posthog-utils";

const PAGE_LIMIT = 30;

function shortId(value?: string) {
    if (!value) {
        return "";
    }
    return value.slice(0, 8);
}

/**
 * GET /api/servers/:serverId/moderation/messages
 *
 * Lists a server's messages for moderation (removed or removed+active).
 * Filters: ?channelId=&onlyRemoved=1&text=&limit=&cursorAfter=
 *
 * Access: global moderator/admin, or server owner / manage-messages holder.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ serverId: string }> },
) {
    try {
        const user = await requireAuth();
        const serverId = (await params).serverId;

        const env = getEnvConfig();
        const { databases } = getServerClient();
        const roles = await checkUserRoles(user.$id);

        let allowed = roles.isModerator || roles.isAdmin;
        if (!allowed) {
            allowed = await hasServerModerationAccess({
                userId: user.$id,
                serverId,
                databases,
                env,
            });
        }
        if (!allowed) {
            return NextResponse.json(
                { error: "Forbidden: Moderator access required" },
                { status: 403 },
            );
        }

        const { searchParams } = new URL(request.url);
        const channelId = searchParams.get("channelId")?.trim() || undefined;
        const onlyRemoved = searchParams.get("onlyRemoved") === "1";
        const textQuery = searchParams.get("text")?.trim() || undefined;
        const cursorAfter = searchParams.get("cursorAfter")?.trim() || undefined;
        const limit = clampLimit(searchParams.get("limit") ?? String(PAGE_LIMIT));

        const fetched = await listGlobalMessages({
            limit,
            cursorAfter,
            serverId,
            channelId,
            onlyRemoved,
            text: textQuery,
            includeRemoved: true,
        });

        const items = fetched.items;

        const userIds = new Set<string>();
        for (const message of items) {
            if (message.userId) userIds.add(message.userId);
            if (message.removedBy) userIds.add(message.removedBy);
        }

        const profiles = new Map<
            string,
            { displayName?: string; userName?: string }
        >();
        if (userIds.size > 0) {
            const profilesResult = await getProfilesByUserIds(
                Array.from(userIds),
            );
            for (const profile of profilesResult.values()) {
                profiles.set(profile.userId, {
                    displayName: profile.displayName,
                    userName: profile.userName,
                });
            }
        }

        const enrichedItems = items.map((message) => {
            const senderProfile = message.userId
                ? profiles.get(message.userId)
                : null;
            const removedByProfile = message.removedBy
                ? profiles.get(message.removedBy)
                : null;
            return {
                $id: message.$id,
                text: message.text,
                imageUrl: message.imageUrl,
                userId: message.userId,
                userName: message.userName,
                senderDisplay:
                    message.userName?.trim() ||
                    senderProfile?.displayName ||
                    senderProfile?.userName ||
                    shortId(message.userId),
                channelId: message.channelId,
                serverId: message.serverId,
                removedAt: message.removedAt,
                removedBy: message.removedBy,
                removedByDisplay: message.removedBy
                    ? (removedByProfile?.displayName ??
                      removedByProfile?.userName ??
                      shortId(message.removedBy))
                    : undefined,
                attachments: message.attachments,
            };
        });

        return NextResponse.json({
            items: enrichedItems,
            nextCursor: fetched.nextCursor,
        });
    } catch (error) {
        logger.error("Failed to list moderation messages", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list moderation messages" },
            { status: 500 },
        );
    }
}

type GateDeps = {
    userId: string;
    serverId: string;
    databases: ReturnType<typeof getServerClient>["databases"];
    env: ReturnType<typeof getEnvConfig>;
};

async function hasServerModerationAccess({
    userId,
    serverId,
    databases,
    env,
}: GateDeps): Promise<boolean> {
    try {
        const access = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            userId,
        );
        return (
            access.isServerOwner === true ||
            access.permissions.manageMessages === true
        );
    } catch {
        return false;
    }
}