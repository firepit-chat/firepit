import { createHash } from "node:crypto";
import { Query } from "node-appwrite";

import { getAdminClient, isDocumentNotFoundError } from "@/lib/appwrite-admin";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { logger } from "@/lib/posthog-utils";
import { normalizeThreadReads } from "@/lib/thread-read-states";

/**
 * Per-channel read state, stored as one document per user per server holding a
 * channelId -> lastReadAt map. Read state lives here rather than on the channel
 * document because a channel is shared by every member while "read" is personal.
 *
 * There is deliberately no membership check, matching /api/thread-reads: the
 * document is keyed by userId and can only ever hold the caller's own read
 * state, so there is nothing to read that belongs to anyone else.
 */

/** `reads` is capped at ~65KB, matching the thread-reads ceiling. */
const MAX_READS_ENTRIES = 1000;

/**
 * The collection or its `reads` attribute is missing. This is a deployment
 * problem, not a request problem: callers must stop asking rather than retry,
 * because a client that retries a 400 against a broken collection is a
 * request storm.
 */
/**
 * Distinguishes "the collection is not deployed" from "that document does not
 * exist". Appwrite reports both as 404s, and the collection name in
 * `appwrite-core` always resolves to a default string, so this cannot be decided
 * from configuration alone.
 */
function isCollectionMissingError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const candidate = error as { type?: unknown; message?: unknown };
    const type = typeof candidate.type === "string" ? candidate.type : "";
    if (type === "collection_not_found" || type === "attribute_not_found") {
        return true;
    }
    const message =
        typeof candidate.message === "string" ? candidate.message : "";
    return /collection|attribute/i.test(message) && /not found/i.test(message);
}

export class ChannelReadsUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ChannelReadsUnavailableError";
    }
}

export function deriveChannelReadDocumentId(params: {
    serverId: string;
    userId: string;
}): string {
    return createHash("sha256")
        .update(`${params.serverId}_${params.userId}`)
        .digest("hex")
        .slice(0, 36);
}

/** Keeps whichever timestamp is later so a stale write cannot rewind progress. */
export function mergeChannelReadByMax(
    current: Record<string, string>,
    channelId: string,
    lastReadAt: string,
): Record<string, string> {
    const existing = current[channelId];
    if (existing && existing >= lastReadAt) {
        return current;
    }
    return { ...current, [channelId]: lastReadAt };
}

function isAlreadyExistsConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const candidate = error as { code?: unknown; message?: unknown };
    if (candidate.code === 409) {
        return true;
    }

    return typeof candidate.message === "string"
        ? candidate.message.toLowerCase().includes("already exists")
        : false;
}

/**
 * Read state is strictly cosmetic — it only decides whether an unread badge
 * shows. A broken collection must therefore never surface as a failed request:
 * callers get an empty map and the counters stay hidden. Throwing here is what
 * turned a deployment mistake into an endless client retry loop.
 */
export async function getChannelReads(params: {
    serverId: string;
    userId: string;
}): Promise<Record<string, string>> {
    try {
        const { databases } = getAdminClient();
        const env = getEnvConfig();
        if (!env.collections.channelReads) {
            return {};
        }

        const result = await databases.listDocuments(
            env.databaseId,
            env.collections.channelReads,
            [
                Query.equal("userId", params.userId),
                Query.equal("serverId", params.serverId),
                Query.limit(1),
            ],
        );
        const doc = result.documents[0];
        if (!doc) {
            return {};
        }

        return normalizeThreadReads(doc.reads);
    } catch (error) {
        logger.warn("Channel read state unavailable; treating as all unread", {
            serverId: params.serverId,
            error: error instanceof Error ? error.message : String(error),
        });
        return {};
    }
}

export async function upsertChannelRead(params: {
    channelId: string;
    lastReadAt: string;
    serverId: string;
    userId: string;
}): Promise<Record<string, string>> {
    const { databases } = getAdminClient();
    const env = getEnvConfig();
    if (!env.collections.channelReads) {
        throw new ChannelReadsUnavailableError(
            "Channel reads collection not configured",
        );
    }

    try {
        const docId = deriveChannelReadDocumentId(params);
        const payloadFor = (reads: Record<string, string>) => ({
            reads: JSON.stringify(reads),
            serverId: params.serverId,
            userId: params.userId,
        });

        const existing = await getChannelReads(params);
        const merged = mergeChannelReadByMax(
            existing,
            params.channelId,
            params.lastReadAt,
        );

        // Prefer updating the deterministic id; fall back to a lookup when the
        // document was created before the hash scheme, or lost a create race.
        try {
            const updated = await databases.updateDocument(
                env.databaseId,
                env.collections.channelReads,
                docId,
                payloadFor(merged),
            );
            return normalizeThreadReads(updated.reads);
        } catch (error) {
            if (!isDocumentNotFoundError(error)) {
                throw error;
            }
        }

        try {
            const created = await databases.createDocument(
                env.databaseId,
                env.collections.channelReads,
                docId,
                payloadFor(merged),
                perms.serverOwner(params.userId),
            );
            return normalizeThreadReads(created.reads);
        } catch (error) {
            if (!isAlreadyExistsConflict(error)) {
                throw error;
            }
            // Another request won the create race; merge into the document it made.
            const winner = await getChannelReads(params);
            const winnerMerged = mergeChannelReadByMax(
                winner,
                params.channelId,
                params.lastReadAt,
            );
            const updated = await databases.updateDocument(
                env.databaseId,
                env.collections.channelReads,
                docId,
                payloadFor(winnerMerged),
            );
            return normalizeThreadReads(updated.reads);
        }
    } catch (error) {
        // Anything that looks like a missing collection or attribute means the
        // feature is not deployed. Reporting it as such lets the client stop
        // asking, instead of retrying a permanently failing endpoint.
        if (isCollectionMissingError(error)) {
            throw new ChannelReadsUnavailableError(
                error instanceof Error
                    ? error.message
                    : "Channel reads collection missing",
            );
        }
        throw error;
    }
}

export { MAX_READS_ENTRIES };
