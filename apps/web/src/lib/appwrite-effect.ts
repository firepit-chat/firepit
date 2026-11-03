import "server-only";

import { Data, Effect, Schedule } from "effect";
import type { Cause } from "effect";

const RETRY_ATTEMPTS = 2;
const RETRY_BASE_DELAY = "150 millis";
const QUERY_TIMEOUT = "8 seconds";
const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_MESSAGE_FRAGMENTS = [
    "econnreset",
    "etimedout",
    "eai_again",
    "enotfound",
    "fetch failed",
    "socket hang up",
];

export class AppwriteCallError extends Data.TaggedError("AppwriteCallError")<{
    readonly cause: unknown;
    readonly operation: string;
    readonly transient: boolean;
}> {}

export function isTransientAppwriteError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = Number((error as { code?: unknown }).code);
    if (Number.isFinite(code) && code > 0) {
        return TRANSIENT_STATUS_CODES.has(code);
    }

    const message = (
        error instanceof Error ? error.message : String(error)
    ).toLowerCase();

    return TRANSIENT_MESSAGE_FRAGMENTS.some((fragment) =>
        message.includes(fragment),
    );
}

/**
 * Runs an Appwrite read with bounded retries and a timeout. Only wrap
 * idempotent calls: a retry re-sends the request, and the SDK does not accept
 * an AbortSignal, so a timeout stops waiting without cancelling the socket.
 */
export function appwriteQuery<A>(
    operation: string,
    run: () => Promise<A>,
): Effect.Effect<A, AppwriteCallError | Cause.TimeoutError> {
    return Effect.tryPromise({
        catch: (cause) =>
            new AppwriteCallError({
                cause,
                operation,
                transient: isTransientAppwriteError(cause),
            }),
        try: run,
    }).pipe(
        Effect.retry({
            schedule: Schedule.exponential(RETRY_BASE_DELAY).pipe(
                Schedule.jittered,
            ),
            times: RETRY_ATTEMPTS,
            while: (error) => error.transient,
        }),
        Effect.timeout(QUERY_TIMEOUT),
    );
}
