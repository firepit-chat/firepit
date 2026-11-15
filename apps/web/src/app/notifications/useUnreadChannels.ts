"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { isChannelUnread } from "@/lib/channel-unread";
import type { Channel, Server } from "@/lib/types";

export type UnreadChannel = {
    channel: Channel;
    serverId: string;
};

const CHANNELS_LIMIT = 100;

async function fetchChannels(serverId: string): Promise<Channel[]> {
    const response = await fetch(
        `/api/channels?serverId=${encodeURIComponent(serverId)}&limit=${String(CHANNELS_LIMIT)}`,
        { credentials: "include" },
    );
    if (!response.ok) {
        return [];
    }

    const data: unknown = await response.json();
    const channels = (data as { channels?: unknown } | null)?.channels;
    return Array.isArray(channels) ? (channels as Channel[]) : [];
}

async function fetchReads(serverId: string): Promise<Record<string, string>> {
    // Read state is cosmetic, so any failure degrades to "nothing unread"
    // rather than an error state on a page that is mostly informational.
    try {
        const response = await fetch(
            `/api/channel-reads?serverId=${encodeURIComponent(serverId)}`,
            { credentials: "include" },
        );
        if (!response.ok) {
            return {};
        }
        const data: unknown = await response.json();
        const reads = (data as { reads?: unknown } | null)?.reads;
        return reads && typeof reads === "object" && !Array.isArray(reads)
            ? (reads as Record<string, string>)
            : {};
    } catch {
        return {};
    }
}

/**
 * Channels with unread messages across every server the viewer belongs to.
 *
 * The inbox deliberately holds only mentions, thread replies and DMs, so an
 * ordinary unread channel message never appears there. This surfaces the same
 * condition the sidebar dot uses (`isChannelUnread`) instead of writing an
 * inbox row per message, which would cost a write per member per message.
 *
 * Read state is stored per server, so one read request is made per server the
 * viewer belongs to.
 */
export function useUnreadChannels(
    servers: readonly Server[],
    { enabled = true }: { enabled?: boolean } = {},
) {
    const [readsByServer, setReadsByServer] = useState<
        Record<string, Record<string, string>>
    >({});

    // `servers` is a fresh array on most renders, so derive a stable id list
    // keyed on its contents to keep the effect below from re-running each time.
    const serverIdsKey = servers.map((server) => server.$id).join(",");
    const serverIds = useMemo(
        () => serverIdsKey.split(",").filter(Boolean),
        [serverIdsKey],
    );

    useEffect(() => {
        if (!enabled || serverIds.length === 0) {
            return;
        }

        let cancelled = false;

        void (async () => {
            const entries = await Promise.all(
                serverIds.map(
                    async (serverId) =>
                        [serverId, await fetchReads(serverId)] as const,
                ),
            );
            if (!cancelled) {
                setReadsByServer(Object.fromEntries(entries));
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled, serverIds]);

    const channelsQueries = useQueries({
        queries: serverIds.map((serverId) => ({
            enabled,
            queryFn: () => fetchChannels(serverId),
            queryKey: ["notifications-channels", serverId],
            staleTime: 30_000,
        })),
    });

    const loading = enabled && channelsQueries.some((query) => query.isPending);

    return {
        loading,
        unreadChannels: serverIds.flatMap((serverId, index) => {
            const reads = readsByServer[serverId];
            if (!reads) {
                return [];
            }

            const channels = channelsQueries[index]?.data ?? [];

            return channels.flatMap((channel) => {
                const lastReadAt = reads[channel.$id];
                if (
                    !isChannelUnread({
                        channelCreatedAt: channel.$createdAt,
                        lastMessageAt: channel.lastMessageAt,
                        lastReadAt,
                    })
                ) {
                    return [];
                }

                return [{ channel, serverId } satisfies UnreadChannel];
            });
        }),
    };
}
