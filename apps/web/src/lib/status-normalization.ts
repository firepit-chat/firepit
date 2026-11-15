import type { UserStatus } from "./types";

export const ALLOWED_STATUSES = new Set<UserStatus["status"]>([
    "online",
    "away",
    "busy",
    "offline",
]);

/** No activity for this long reads as idle (away) rather than offline. */
export const STATUS_IDLE_THRESHOLD_MS = 5 * 60 * 1000;

/** No activity for this long reads as offline. */
export const STATUS_STALE_THRESHOLD_MS = 15 * 60 * 1000;

export function statusBatchCacheKey(userIds: string[]): string {
    const normalizedUserIds = [...new Set(userIds.filter(Boolean))].sort();
    return `api:status:batch:${normalizedUserIds.join("|")}`;
}

export type StatusLike = {
    $id?: unknown;
    userId?: unknown;
    status?: unknown;
    customMessage?: unknown;
    lastSeenAt?: unknown;
    expiresAt?: unknown;
    isManuallySet?: unknown;
    $updatedAt?: unknown;
};

/**
 * coerceTimestamp converts a candidate value to an ISO timestamp string when valid.
 *
 * @param {unknown} value - The input to coerce (for example a string, number, or Date-like value).
 * @returns {string | undefined} ISO 8601 timestamp string if coercion succeeds, otherwise undefined.
 */
function coerceTimestamp(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const time = Date.parse(value);
    if (Number.isNaN(time)) {
        return undefined;
    }

    return new Date(time).toISOString();
}

/**
 * normalizeStatus applies status defaults and expiry/staleness rules to StatusLike input.
 *
 * @param {StatusLike} input - Raw status document to normalize.
 * @param {number} now - Epoch milliseconds used for deterministic expiration checks.
 * @returns {{ normalized: UserStatus; isExpired: boolean; isStale: boolean; isIdle: boolean; shouldAutoOffline: boolean; }} Normalized status payload and computed lifecycle flags.
 */
export function normalizeStatus(input: StatusLike, now = Date.now()) {
    const lastSeenCandidate =
        coerceTimestamp(input.lastSeenAt) ?? coerceTimestamp(input.$updatedAt);
    const lastSeenAt = lastSeenCandidate ?? new Date(0).toISOString();
    const lastSeenTime = Date.parse(lastSeenAt);

    const expiresAt = coerceTimestamp(input.expiresAt);
    const expiresTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    const hasExpiresAt = Number.isFinite(expiresTime);

    const rawStatus =
        typeof input.status === "string" &&
        ALLOWED_STATUSES.has(input.status as UserStatus["status"])
            ? (input.status as UserStatus["status"])
            : "offline";

    const isExpired = hasExpiresAt && expiresTime <= now;
    const isStale =
        !Number.isFinite(lastSeenTime) ||
        now - lastSeenTime > STATUS_STALE_THRESHOLD_MS;

    const isManuallySet =
        input.isManuallySet !== undefined
            ? Boolean(input.isManuallySet)
            : undefined;

    const isIdle = now - lastSeenTime > STATUS_IDLE_THRESHOLD_MS;

    // A manual status is a deliberate choice and outlives inactivity, so
    // busy/away/offline stick indefinitely. "online" is the one exception: it is
    // what a user gets for free when they never picked anything, so honouring
    // it manually would pin them online forever and they would never decay.
    const manualSticky =
        Boolean(isManuallySet) && rawStatus !== "online" && !isExpired;

    let normalizedStatus: UserStatus["status"];
    if (isExpired || isStale) {
        normalizedStatus = manualSticky ? rawStatus : "offline";
    } else if (!manualSticky && isIdle && rawStatus === "online") {
        // Decay to idle first rather than straight to offline, so someone who
        // stepped away reads as idle instead of already gone.
        normalizedStatus = "away";
    } else {
        normalizedStatus = rawStatus;
    }

    const normalized: UserStatus = {
        $id: String(input.$id ?? ""),
        userId: String(input.userId ?? ""),
        status: normalizedStatus,
        customMessage: input.customMessage
            ? String(input.customMessage)
            : undefined,
        lastSeenAt,
        expiresAt,
        isManuallySet,
        $updatedAt: coerceTimestamp(input.$updatedAt),
    };

    return {
        normalized,
        isExpired,
        isStale,
        isIdle,
        // The stored status disagrees with what we report: either the document
        // should be rewritten, or the UI is showing a stale read.
        shouldAutoOffline:
            normalizedStatus === "offline" && rawStatus !== "offline",
    };
}
