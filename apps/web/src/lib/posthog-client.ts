/**
 * Client-side PostHog initialization.
 *
 * The server side is wired up in `instrumentation.ts`, and `posthog-node` is
 * created lazily in `posthog-utils`. The browser SDK was the gap: nothing ever
 * called `posthog.init()`, so every client call site — `identify`, `capture`,
 * `captureException`, `opt_in_capturing` — was queued against an SDK with no
 * `api_key` or `api_host` and silently dropped.
 *
 * Two consequences beyond the direct `posthog.*` call sites:
 *   - `client-logger.ts` reads `window.posthog`, which only exists once the SDK
 *     is initialized, so every `recordClientAction`/`recordClientError` call
 *     was a no-op too.
 *   - opt-in/opt-out state had nowhere to persist.
 *
 * Capture is on by default for anonymous visitors, so the pre-auth funnel is
 * recorded. Consent is still enforced per account: `auth-context` reads the
 * telemetry preference and calls `opt_out_capturing()` when it is off, and
 * `identify()` only runs when telemetry is enabled. The server path likewise
 * refuses to send without credentials.
 */

import posthog from "posthog-js";

const DEFAULT_HOST = "https://us.i.posthog.com";

let initialized = false;

/**
 * Reads a boolean-ish env var. `NEXT_PUBLIC_*` values are always strings, and
 * anything other than an explicit "true" is treated as off so a malformed value
 * fails closed rather than silently enabling session recording.
 */
function envFlag(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (raw === undefined || raw === "") {
        return fallback;
    }
    return raw === "true";
}

export function initPostHogClient(): void {
    if (initialized || typeof window === "undefined") {
        return;
    }

    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    if (!token) {
        // No credentials configured: leave the SDK uninitialized so it stays a
        // no-op rather than buffering events it can never send.
        return;
    }

    initialized = true;

    posthog.init(token, {
        api_host: (
            process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST
        ).replace(/\/$/, ""),
        autocapture: envFlag("NEXT_PUBLIC_POSTHOG_AUTOCAPTURE", false),
        capture_pageview: envFlag("NEXT_PUBLIC_POSTHOG_CAPTURE_PAGEVIEW", true),
        capture_performance: false,
        disable_session_recording: !envFlag(
            "NEXT_PUBLIC_POSTHOG_SESSION_RECORDING",
            false,
        ),
        request_batching: envFlag("NEXT_PUBLIC_POSTHOG_REQUEST_BATCHING", true),
        // Anonymous capture is ON by default: pre-auth page views and the
        // sign-in/registration/onboarding funnel are the events that most need
        // collecting, and they can only be collected before a user exists.
        //
        // This does not weaken consent. `auth-context` reads the account's
        // telemetry preference (defaulting to enabled) and calls
        // `opt_out_capturing()` for anyone who turned it off, which persists
        // and suppresses capture from then on — including anonymous capture, so
        // a prior opt-out is still honoured. `identify()` is separately gated
        // on telemetry being enabled, so an opted-out user is never attached to
        // their events.
        opt_out_capturing_by_default: false,
        persistence: "localStorage+cookie",
    });

    // `client-logger.ts` reads `window.posthog`, which posthog-js does not set
    // on its own when bundled through npm rather than the CDN snippet.
    (window as unknown as { posthog?: typeof posthog }).posthog = posthog;
}

/** Test-only reset for the module-level guard. */
export function __resetPostHogClientForTests(): void {
    initialized = false;
}

export function __isPostHogClientInitialized(): boolean {
    return initialized;
}
