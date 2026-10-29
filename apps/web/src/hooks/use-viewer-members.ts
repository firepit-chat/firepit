"use client";

import { useCallback, useEffect, useState } from "react";

export type ViewerMemberRole = {
    id: string;
    name: string;
    color: string;
    position: number;
};

export type ViewerMember = {
    userId: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    avatarFramePreset: string | null;
    avatarFrameUrl: string | null;
    avatarFrameInsetPercent: number | null;
    role: ViewerMemberRole | null;
};

type ViewerMembersResponse = {
    members: ViewerMember[];
    truncated?: boolean;
};

/**
 * Loads the read-only member list for the member rail.
 *
 * Uses the viewer endpoint, which only requires membership, so it works for
 * every member rather than only role managers. Returns an empty list on any
 * failure: the rail is supplementary, so a failed fetch should leave the rest
 * of the page intact.
 */
export function useViewerMembers(serverId: string | null | undefined) {
    const [members, setMembers] = useState<ViewerMember[]>([]);
    const [truncated, setTruncated] = useState(false);
    // Which server `members` belongs to, so a stale list from a previously
    // selected server is never presented as the current one.
    const [loadedServerId, setLoadedServerId] = useState<string | null>(null);

    const load = useCallback(
        async (signal: AbortSignal) => {
            if (!serverId) {
                setMembers([]);
                setLoadedServerId(null);
                return;
            }
            try {
                const response = await fetch(
                    `/api/servers/${serverId}/viewer/members`,
                    { signal },
                );
                if (!response.ok) {
                    setMembers([]);
                    setLoadedServerId(serverId);
                    return;
                }
                const data = (await response.json()) as ViewerMembersResponse;
                setMembers(Array.isArray(data.members) ? data.members : []);
                setTruncated(Boolean(data.truncated));
                setLoadedServerId(serverId);
            } catch (error) {
                if ((error as Error)?.name !== "AbortError") {
                    setMembers([]);
                    setLoadedServerId(serverId);
                }
            }
        },
        [serverId],
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    // Derived rather than tracked as its own state so it is correct on the very
    // first render, before any effect has run.
    //
    // `serverId` is null until the server list resolves, and `loadedServerId`
    // starts null too, so comparing them alone would report "settled, no
    // members" and flash "No members" on every load. A real server id has to
    // exist before that comparison means anything.
    const isCurrentServerLoaded =
        serverId !== null && loadedServerId === serverId;

    return {
        members,
        loading: !isCurrentServerLoaded,
        truncated,
        refresh: () => load(new AbortController().signal),
    };
}
