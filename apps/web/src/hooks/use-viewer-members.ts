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
    const [loading, setLoading] = useState(false);
    const [truncated, setTruncated] = useState(false);

    const load = useCallback(async (signal: AbortSignal) => {
        if (!serverId) {
            setMembers([]);
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(
                `/api/servers/${serverId}/viewer/members`,
                { signal },
            );
            if (!response.ok) {
                setMembers([]);
                return;
            }
            const data = (await response.json()) as ViewerMembersResponse;
            setMembers(Array.isArray(data.members) ? data.members : []);
            setTruncated(Boolean(data.truncated));
        } catch (error) {
            if ((error as Error)?.name !== "AbortError") {
                setMembers([]);
            }
        } finally {
            setLoading(false);
        }
    }, [serverId]);

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    return { members, loading, truncated, refresh: () => load(new AbortController().signal) };
}
