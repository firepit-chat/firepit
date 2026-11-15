import { firepitRequest } from "@/lib/firepit/http";

/**
 * Per-thread read state, mirroring the web app's /api/thread-reads: the server
 * keeps a threadId -> lastReadAt map per user, scoped to the channel or DM the
 * thread lives in.
 *
 * Goes through firepitRequest rather than a bare fetch like the web's
 * thread-read-client, so the session token actually travels with the request —
 * a cookie-based client cannot authenticate a native app.
 */
export type ThreadReadContext = "channel" | "conversation";

export type ThreadReadMap = Record<string, string>;

export type ThreadReadsResponse = {
    contextId: string;
    contextKind: ThreadReadContext;
    reads: ThreadReadMap;
};

export async function fetchThreadReads(
    baseUrl: string,
    token: string,
    contextKind: ThreadReadContext,
    contextId: string,
) {
    const response = await firepitRequest<ThreadReadsResponse>({
        baseUrl,
        path: "/api/thread-reads",
        query: { contextId, contextKind },
        token,
    });
    return response.reads ?? {};
}

/** Best-effort: a failed mark only leaves the thread looking unread. */
export async function markThreadReads(
    baseUrl: string,
    token: string,
    contextKind: ThreadReadContext,
    contextId: string,
    reads: ThreadReadMap,
) {
    const response = await firepitRequest<ThreadReadsResponse>({
        baseUrl,
        path: "/api/thread-reads",
        method: "PATCH",
        body: { contextId, contextKind, reads },
        token,
    });
    return response.reads ?? {};
}

/** Marks a single thread read at `at` (defaults to now). */
export function markThreadRead(
    baseUrl: string,
    token: string,
    contextKind: ThreadReadContext,
    contextId: string,
    threadId: string,
    at: string = new Date().toISOString(),
) {
    return markThreadReads(baseUrl, token, contextKind, contextId, {
        [threadId]: at,
    });
}
