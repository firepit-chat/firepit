import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
    ChannelReadsUnavailableError,
    getChannelReads,
    MAX_READS_ENTRIES,
    upsertChannelRead,
} from "@/lib/channel-read-store";
import { logger } from "@/lib/posthog-utils";

/**
 * Which channels the caller has read, and marking one as read.
 *
 * A channel with no entry has never been opened, and the caller falls back to
 * the channel's creation time — so everything since it existed counts as unread.
 */
// Appwrite serializes `$createdAt` with a `+00:00` offset but `$updatedAt` and
// custom datetime attributes with `Z`, so a strict `Z`-only regex rejected
// perfectly good timestamps. Accept anything Date.parse understands as an ISO
// datetime; the value is normalized to `Z` before it is stored.
const isoDateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function isValidTimestamp(value: unknown): value is string {
    return (
        typeof value === "string" &&
        isoDateTimePattern.test(value) &&
        !Number.isNaN(Date.parse(value))
    );
}

export async function GET(request: Request) {
    try {
        const user = await getServerSession();
        if (!user?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const serverId = new URL(request.url).searchParams.get("serverId");
        if (!serverId) {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }

        const reads = await getChannelReads({ serverId, userId: user.$id });
        return NextResponse.json({ reads, serverId });
    } catch (error) {
        logger.error("Error in GET /api/channel-reads", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to load channel read state" },
            { status: 500 },
        );
    }
}

export async function PUT(request: Request) {
    try {
        const user = await getServerSession();
        if (!user?.$id) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body: unknown = await request.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 },
            );
        }

        const { channelId, lastReadAt, serverId } = body as Record<
            string,
            unknown
        >;
        if (typeof channelId !== "string" || channelId.length === 0) {
            return NextResponse.json(
                { error: "channelId is required" },
                { status: 400 },
            );
        }
        if (typeof serverId !== "string" || serverId.length === 0) {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }
        if (!isValidTimestamp(lastReadAt)) {
            return NextResponse.json(
                { error: "lastReadAt must be an ISO timestamp" },
                { status: 400 },
            );
        }

        // A client clock ahead of the server would otherwise mark messages
        // unread that do not exist yet.
        const parsed = Date.parse(lastReadAt);
        const clamped = new Date(Math.min(parsed, Date.now())).toISOString();

        const reads = await upsertChannelRead({
            channelId,
            lastReadAt: clamped,
            serverId,
            userId: user.$id,
        });

        if (Object.keys(reads).length > MAX_READS_ENTRIES) {
            logger.warn("channel read map is at capacity", {
                serverId,
                entries: Object.keys(reads).length,
            });
        }

        return NextResponse.json({ reads, serverId });
    } catch (error) {
        if (error instanceof ChannelReadsUnavailableError) {
            // 503 + channelReadsAvailable:false tells the client to stop asking
            // for the rest of the session. A plain 500 here is retried by every
            // open chat tab and becomes a request storm.
            logger.error("Channel read state is not deployed", {
                error: error.message,
            });
            return NextResponse.json(
                {
                    channelReadsAvailable: false,
                    error: "Channel read state is unavailable",
                },
                { status: 503 },
            );
        }
        logger.error("Error in PUT /api/channel-reads", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            {
                channelReadsAvailable: true,
                error: "Failed to update channel read state",
            },
            { status: 500 },
        );
    }
}
