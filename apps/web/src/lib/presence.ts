import type { PresenceStatus } from "@/lib/types";

/**
 * Presence rules shared by every member list.
 *
 * The distinction that matters here is "is this person reachable right now",
 * not "what are they doing". Busy and Away are deliberate choices by someone
 * who is still present, so they count as online; only Offline does not. This
 * matches how the member list is grouped.
 */
export function isOnlineStatus(status: PresenceStatus | undefined): boolean {
    return status === "online" || status === "busy" || status === "away";
}

/**
 * Splits members into online and offline groups.
 *
 * `getStatus` returns a member's normalized presence, or undefined when we have
 * no status for them — which counts as offline, since an unknown user is not
 * known to be present.
 *
 * Both groups preserve the input order. Callers pass members already sorted by
 * role precedence, so partitioning in place is enough and avoids a re-sort: a
 * stable partition keeps each group's relative ordering intact.
 */
export function partitionByPresence<T>(
    members: readonly T[],
    getStatus: (member: T) => PresenceStatus | undefined,
): { online: T[]; offline: T[] } {
    const online: T[] = [];
    const offline: T[] = [];

    for (const member of members) {
        if (isOnlineStatus(getStatus(member))) {
            online.push(member);
        } else {
            offline.push(member);
        }
    }

    return { online, offline };
}