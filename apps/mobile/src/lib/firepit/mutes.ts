import { firepitRequest } from "@/lib/firepit/http";

/**
 * Mirrors the web's `NotificationOverride`. `mutedUntil` is an ISO timestamp;
 * absent means muted forever. Unmuting *deletes* the override on the server, so
 * the presence of an entry is what marks something as muted.
 */
type NotificationOverride = {
    level?: string;
    mutedUntil?: string;
};

type OverrideMap = Record<string, NotificationOverride | undefined>;

type NotificationSettingsResponse = {
    serverOverrides?: OverrideMap;
    channelOverrides?: OverrideMap;
    conversationOverrides?: OverrideMap;
};

export type MuteOverrides = {
    servers: Set<string>;
    channels: Set<string>;
    conversations: Set<string>;
};

/**
 * Shared no-mute state. `applyMuteResult` always builds a new Set rather than
 * mutating, so a single instance is safe to hand out and keeps consumers from
 * re-rendering on every fetch.
 */
export const EMPTY_MUTES: MuteOverrides = {
    servers: new Set(),
    channels: new Set(),
    conversations: new Set(),
};

/**
 * Reduce an override map to the ids that are muted *right now*.
 *
 * Matches the server's own rule (`isMuteExpired` in
 * `apps/web/src/lib/notification-settings.ts`): no `mutedUntil` means muted
 * forever, an unparseable timestamp counts as expired so a mute cannot get
 * stuck on, and everything else is compared against the current time.
 */
export function mutedIdsFromOverrides(
    overrides: OverrideMap | undefined,
    now: number = Date.now(),
): Set<string> {
    const active = new Set<string>();
    if (!overrides || typeof overrides !== "object") return active;

    for (const [id, override] of Object.entries(overrides)) {
        if (!override || typeof override !== "object") continue;
        const { mutedUntil } = override;
        if (mutedUntil === undefined || mutedUntil === null) {
            active.add(id);
            continue;
        }
        const until = Date.parse(mutedUntil);
        if (Number.isNaN(until)) continue;
        if (until > now) active.add(id);
    }
    return active;
}

/**
 * Read every mute the user has set, in one request.
 *
 * `GET /api/notifications/settings` already returns the three override maps in
 * its settings payload, so this needs no new endpoint on the server.
 */
export async function fetchMuteOverrides(
    baseUrl: string,
    token: string,
): Promise<MuteOverrides> {
    try {
        const res = await firepitRequest<NotificationSettingsResponse>({
            baseUrl,
            path: "/api/notifications/settings",
            token,
        });
        return {
            servers: mutedIdsFromOverrides(res.serverOverrides),
            channels: mutedIdsFromOverrides(res.channelOverrides),
            conversations: mutedIdsFromOverrides(res.conversationOverrides),
        };
    } catch {
        // A failed read leaves the client showing no mutes, which is the state it
        // was in before. Toggling still works against the server.
        return EMPTY_MUTES;
    }
}

/**
 * Apply a mute toggle to a local set using the value the server echoed back,
 * so the client converges on the server's answer instead of assuming its own
 * idea of the current state was right.
 */
export function applyMuteResult(
    current: Set<string>,
    id: string,
    muted: boolean,
): Set<string> {
    const next = new Set(current);
    if (muted) {
        next.add(id);
    } else {
        next.delete(id);
    }
    return next;
}
