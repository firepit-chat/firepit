/**
 * Per-user telemetry consent for the server capture path.
 *
 * The browser SDK honours `profiles.telemetryEnabled`: a user who turns
 * telemetry off calls `opt_out_capturing()`, which suppresses their events.
 * The server path did not — `shouldSendToPostHog()` only checked that
 * credentials existed, so `ApiCall` metrics, forwarded application logs, and
 * server error reports were sent regardless of the account's preference. This
 * module closes that gap.
 *
 * Two deliberate limits, so the behaviour is not oversold:
 *
 *  - **Only events attributable to a person are filtered.** Telemetry with no
 *    resolvable user id keeps `distinctId: "server"` and is always sent; there
 *    is no person to honour consent for. Most `logger.*` calls do carry a user
 *    id, so in practice the bulk of per-user telemetry is covered.
 *  - **A missing profile means allowed**, matching the client, which treats an
 *    absent preference as enabled. Opting out has to be an explicit act.
 *
 * Reads go through `getUserProfile`, which is already cached in-process for 30s,
 * so the steady-state cost is a map lookup rather than a query per event.
 */

import { getUserProfile } from "@/lib/appwrite-profiles";

const CONSENT_TTL_MS = 60_000;
const CONSENT_CACHE_MAX = 1_000;

type CacheEntry = { allowed: boolean; ts: number };

const consentCache = new Map<string, CacheEntry>();

function evictIfNeeded() {
    if (consentCache.size <= CONSENT_CACHE_MAX) {
        return;
    }
    const now = Date.now();
    for (const [key, entry] of consentCache) {
        if (now - entry.ts > CONSENT_TTL_MS) {
            consentCache.delete(key);
        }
    }
    // Still oversized (all fresh): drop the oldest insertion, which Map
    // iterates in.
    if (consentCache.size > CONSENT_CACHE_MAX) {
        const oldest = consentCache.keys().next();
        if (!oldest.done) {
            consentCache.delete(oldest.value);
        }
    }
}

/**
 * Resolves whether telemetry may be recorded for a user. Defaults to allowed
 * when the profile is missing or unreadable, so a preference lookup failure
 * degrades to the previous behaviour instead of silently blinding analytics.
 */
export async function isTelemetryAllowedForUser(
    userId: string,
): Promise<boolean> {
    if (!userId) {
        return true;
    }

    const cached = consentCache.get(userId);
    if (cached && Date.now() - cached.ts < CONSENT_TTL_MS) {
        return cached.allowed;
    }

    let allowed = true;
    try {
        const profile = await getUserProfile(userId);
        if (typeof profile?.telemetryEnabled === "boolean") {
            allowed = profile.telemetryEnabled;
        }
    } catch {
        allowed = true;
    }

    consentCache.set(userId, { allowed, ts: Date.now() });
    evictIfNeeded();
    return allowed;
}

/**
 * Drops a cached decision so a preference change takes effect immediately
 * instead of after the TTL.
 */
export function invalidateTelemetryConsent(userId: string): void {
    consentCache.delete(userId);
}

/** Test-only reset. */
export function __resetTelemetryConsentCache(): void {
    consentCache.clear();
}
