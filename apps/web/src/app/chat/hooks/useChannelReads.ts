"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { logger } from "@/lib/client-logger";

/**
 * Per-channel read state for the signed-in viewer.
 *
 * The server keeps a channelId -> lastReadAt map per user per server, so marking
 * a channel read and reading the whole map are both single requests no matter
 * how many channels the server has.
 */
const CHANNEL_READS_STALE_MS = 30_000;

export function getChannelReadsQueryKey(serverId: string) {
    return ["channel-reads", serverId] as const;
}

async function fetchChannelReads(
    serverId: string,
): Promise<Record<string, string>> {
    let response: Response;
    try {
        response = await fetch(
            `/api/channel-reads?serverId=${encodeURIComponent(serverId)}`,
            { credentials: "include" },
        );
    } catch {
        // Offline or aborted: an empty map just means the badges stay hidden.
        return {};
    }
    if (!response.ok) {
        return {};
    }
    const data: unknown = await response.json();
    const reads = (data as { reads?: unknown } | null)?.reads;
    return reads && typeof reads === "object" && !Array.isArray(reads)
        ? (reads as Record<string, string>)
        : {};
}

export function useChannelReads(serverId: string | null | undefined) {
    const queryClient = useQueryClient();

    // Circuit breaker. Two levels, because both failure modes are real:
    // `permanentlyDisabled` latches when the server reports read state is not
    // deployed (needs a redeploy to fix), and `failures` backs off briefly for
    // transient errors like a 429.
    const [permanentlyDisabled, setPermanentlyDisabled] = useState(false);
    const failuresRef = useRef(0);
    const retryAfterRef = useRef(0);

    const query = useQuery({
        enabled: Boolean(serverId) && !permanentlyDisabled,
        // No retry: read state only drives badges. A retry loop against a
        // half-created collection turns one bad deployment into sustained load.
        queryFn: () => fetchChannelReads(serverId as string),
        queryKey: getChannelReadsQueryKey(serverId as string),
        retry: false,
        staleTime: CHANNEL_READS_STALE_MS,
    });

    const mutation = useMutation({
        mutationFn: async (input: {
            channelId: string;
            lastReadAt: string;
        }) => {
            const response = await fetch("/api/channel-reads", {
                body: JSON.stringify({ ...input, serverId }),
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                method: "PUT",
            });

            if (!response.ok) {
                const unavailable =
                    response.status === 503 ||
                    (await response
                        .clone()
                        .json()
                        .then(
                            (b: { channelReadsAvailable?: boolean }) =>
                                b?.channelReadsAvailable === false,
                        )
                        .catch(() => false));
                if (unavailable) {
                    setPermanentlyDisabled(true);
                }
                throw new Error(
                    `Failed to mark channel read: ${response.status}`,
                );
            }
            return (await response.json()) as { reads: Record<string, string> };
        },
        onError: (error: Error) => {
            failuresRef.current += 1;
            // Exponential-ish backoff, capped, so a persistently failing endpoint
            // gets at most one attempt every 30s no matter how often the effect
            // re-runs.
            retryAfterRef.current =
                Date.now() + Math.min(30_000, 1_000 * 2 ** failuresRef.current);
            logger.warn("Failed to mark channel as read", {
                attempts: failuresRef.current,
                retryInMs: retryAfterRef.current - Date.now(),
            });
        },
        onSuccess: (data) => {
            failuresRef.current = 0;
            retryAfterRef.current = 0;
            if (serverId) {
                queryClient.setQueryData(
                    getChannelReadsQueryKey(serverId),
                    data.reads,
                );
            }
        },
    });

    // `mutation` is a fresh object every render, so depending on it made this
    // callback unstable, which re-ran the caller's effect on every render. Depend
    // on `mutate`, which react-query keeps stable.
    const { mutate } = mutation;

    const markChannelRead = useCallback(
        (channelId: string, lastReadAt: string) => {
            if (!serverId || !channelId || !lastReadAt) {
                return;
            }
            if (permanentlyDisabled) {
                return;
            }
            if (Date.now() < retryAfterRef.current) {
                return;
            }
            mutate({ channelId, lastReadAt });
        },
        [mutate, permanentlyDisabled, serverId],
    );

    const reads = useMemo<Record<string, string>>(
        () => query.data ?? {},
        [query.data],
    );

    return { markChannelRead, reads };
}
