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
 *
 * The SDK is loaded with a dynamic `import()`. `posthog-js` ships as a single
 * ~295 KB (~95 KB gzip) module with no internal splitting — autocapture,
 * session recording, surveys and feature flags are all inlined whether or not
 * the config below enables them. A static import put that on the critical path
 * of every route in the app, including ones that never record anything. Since
 * every method this app uses is a fire-and-forget side effect
 * (`capture`/`captureException`/`identify`/`reset`/`opt_*_capturing`) and
 * nothing reads a property off the instance, calls made before the chunk lands
 * can simply be queued and replayed in order. Nothing is dropped.
 */

/** The subset of the posthog-js surface this app actually calls. */
type PostHogMethods = {
    capture: (
        event: string,
        properties?: Record<string, unknown>,
        options?: Record<string, unknown>,
    ) => void;
    captureException: (
        error: Error,
        properties?: Record<string, unknown>,
    ) => void;
    identify: (
        id: string,
        properties?: Record<string, unknown>,
    ) => void;
    reset: () => void;
    opt_in_capturing: () => void;
    opt_out_capturing: () => void;
    init: (token: string, config: Record<string, unknown>) => void;
};

/** What call sites see: everything is a queued side effect. */
export type PostHogClient = Omit<PostHogMethods, "init">;

const DEFAULT_HOST = "https://us.i.posthog.com";

type QueuedCall = {
    args: unknown[];
    method: keyof PostHogMethods;
};

let initialized = false;
let sdk: PostHogMethods | null = null;
let queue: QueuedCall[] = [];
let loadPromise: Promise<void> | null = null;

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

function invoke(method: keyof PostHogMethods, args: unknown[]): void {
    const target = sdk as unknown as Record<string, unknown> | null;
    const fn = target?.[method];
    if (typeof fn === "function") {
        (fn as (...a: unknown[]) => void).apply(target, args);
    }
}

/**
 * Stand-in for the SDK that buffers calls until the real module loads.
 *
 * `then` is deliberately not a method: returning a callable proxy would make it
 * look thenable and get awaited by anything that touches it.
 */
export const posthog: PostHogClient = new Proxy({} as PostHogClient, {
    get(_target, prop: string) {
        if (typeof prop !== "string" || prop === "then") {
            return undefined;
        }
        return (...args: unknown[]) => {
            if (sdk) {
                invoke(prop as keyof PostHogMethods, args);
                return;
            }
            queue.push({ args, method: prop as keyof PostHogMethods });
        };
    },
});

async function loadPostHog(token: string): Promise<void> {
    const module = await import("posthog-js");
    const instance = (module.default ?? module) as unknown as PostHogMethods;

    instance.init(token, {
        api_host: (
            process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST
        ).replace(/\/$/, ""),
        cookieless_mode: "on_reject",
        // 2026-01-30 is the PostHog configuration snapshot version that
        // controls default settings; explicit options above override it.
        defaults: "2026-01-30",
        // Enable exception autocapture for PostHog Error Tracking.
        capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: false,
        },
        // Turn on debug in development mode
        debug: process.env.NODE_ENV === "development",
        autocapture: envFlag("NEXT_PUBLIC_POSTHOG_AUTOCAPTURE", false),
        capture_pageview: envFlag(
            "NEXT_PUBLIC_POSTHOG_CAPTURE_PAGEVIEW",
            true,
        ),
        capture_performance: false,
        disable_session_recording: !envFlag(
            "NEXT_PUBLIC_POSTHOG_SESSION_RECORDING",
            false,
        ),
        request_batching: envFlag(
            "NEXT_PUBLIC_POSTHOG_REQUEST_BATCHING",
            true,
        ),
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

    sdk = instance;
    // `client-logger.ts` reads `window.posthog`, which posthog-js does not set
    // on its own when bundled through npm rather than the CDN snippet. Until
    // now it gets the queueing proxy, which is what makes pre-load events work.
    (window as unknown as { posthog?: PostHogClient }).posthog = instance;

    const pending = queue;
    queue = [];
    for (const call of pending) {
        invoke(call.method, call.args);
    }
}

/**
 * Kicks off the SDK load. Safe to call repeatedly and during render; the module
 * is fetched at most once. Returns the load promise so tests (and anything that
 * genuinely needs the SDK live) can await it — production callers can ignore it.
 */
export function initPostHogClient(): Promise<void> {
    if (loadPromise || typeof window === "undefined") {
        return loadPromise ?? Promise.resolve();
    }

    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    if (!token) {
        // No credentials configured: leave the SDK unloaded so we neither fetch
        // ~95 KB gzip nor buffer events we can never send.
        return Promise.resolve();
    }

    initialized = true;

    // `client-logger` reaches the SDK through `window.posthog`; point it at the
    // queueing proxy right away so early actions are not dropped.
    (window as unknown as { posthog?: PostHogClient }).posthog ??= posthog;

    loadPromise = loadPostHog(token);
    return loadPromise;
}

/** Resolves once the SDK has loaded and any queued calls have been replayed. */
export function whenPostHogReady(): Promise<void> {
    return loadPromise ?? Promise.resolve();
}

/** Test-only reset for the module-level guards. */
export function __resetPostHogClientForTests(): void {
    initialized = false;
    sdk = null;
    queue = [];
    loadPromise = null;
}

export function __isPostHogClientInitialized(): boolean {
    return initialized;
}