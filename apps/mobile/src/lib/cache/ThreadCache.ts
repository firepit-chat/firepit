import * as SQLite from "expo-sqlite";
import { cacheManager } from "./CacheManager";
import type { TimelineMessage } from "@/lib/firepit";

let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;
let dbError = false;

function getDb(): Promise<SQLite.SQLiteDatabase | null> {
    if (dbError) return Promise.resolve(null);
    if (!dbPromise) {
        dbPromise = (async () => {
            try {
                const database = await SQLite.openDatabaseAsync(
                    "firepit_thread_cache.db",
                );
                await database.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS thread_replies (
            id TEXT PRIMARY KEY,
            parent_id TEXT NOT NULL,
            data TEXT NOT NULL,
            cached_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_thread_replies_parent ON thread_replies(parent_id);
          CREATE TABLE IF NOT EXISTS known_thread_replies (
            message_id TEXT PRIMARY KEY
          );
        `);
                const legacy = await database.getAllAsync<{ name: string }>(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'known_thread_parents'",
                );
                if (legacy.length > 0) {
                    await database.execAsync(`
            INSERT OR IGNORE INTO known_thread_replies (message_id)
              SELECT message_id FROM known_thread_parents;
            DROP TABLE known_thread_parents;
          `);
                }
                return database;
            } catch {
                dbError = true;
                console.warn(
                    "[ThreadCache] SQLite unavailable, thread caching disabled",
                );
                return null;
            }
        })();
    }
    return dbPromise;
}

/**
 * Get all known thread reply message IDs (for bulk filtering).
 */
export async function getKnownThreadReplyIds(): Promise<Set<string>> {
    if (!cacheManager.shouldCacheMessages()) return new Set();
    const database = await getDb();
    if (!database) return new Set();
    try {
        const rows = await database.getAllAsync<{ message_id: string }>(
            "SELECT message_id FROM known_thread_replies",
        );
        return new Set(rows.map((r) => r.message_id));
    } catch {
        return new Set();
    }
}

/**
 * Mark a message as a thread reply so it can be filtered from the main list.
 */
export async function markAsThreadReply(messageId: string): Promise<void> {
    if (!cacheManager.shouldCacheMessages()) return;
    const database = await getDb();
    if (!database) return;
    try {
        await database.runAsync(
            "INSERT OR IGNORE INTO known_thread_replies (message_id) VALUES (?)",
            messageId,
        );
    } catch {
        // ignore
    }
}

/**
 * Cache thread replies for a parent message.
 */
export async function cacheThreadReplies(
    parentId: string,
    replies: TimelineMessage[],
): Promise<void> {
    if (!cacheManager.shouldCacheMessages()) return;
    const database = await getDb();
    if (!database) return;
    const now = Date.now();
    const entries = replies
        .map((reply) => ({
            id: reply.$id ?? (reply as TimelineMessage & { id?: string }).id,
            reply,
        }))
        .filter((e): e is { id: string; reply: TimelineMessage } =>
            Boolean(e.id),
        );
    try {
        await database.withTransactionAsync(async () => {
            for (const { id, reply } of entries) {
                await database.runAsync(
                    "INSERT OR REPLACE INTO thread_replies (id, parent_id, data, cached_at) VALUES (?, ?, ?, ?)",
                    id,
                    parentId,
                    JSON.stringify(reply),
                    now,
                );
                // Also mark each reply as a known thread reply for filtering
                await database.runAsync(
                    "INSERT OR IGNORE INTO known_thread_replies (message_id) VALUES (?)",
                    id,
                );
            }
            // Prune replies deleted since the last fetch. This also runs for an
            // empty batch, which means every reply is gone: returning early on
            // length 0 left them cached, and the next cold open replayed replies
            // that no longer exist.
            if (entries.length > 0) {
                const placeholders = entries.map(() => "?").join(",");
                await database.runAsync(
                    `DELETE FROM thread_replies WHERE parent_id = ? AND id NOT IN (${placeholders})`,
                    parentId,
                    ...entries.map((e) => e.id),
                );
            } else {
                await database.runAsync(
                    "DELETE FROM thread_replies WHERE parent_id = ?",
                    parentId,
                );
            }
        });
    } catch {
        // ignore
    }
}

/**
 * Get cached thread replies for a parent message.
 */
export async function getCachedThreadReplies(
    parentId: string,
): Promise<TimelineMessage[]> {
    if (!cacheManager.shouldCacheMessages()) return [];
    const database = await getDb();
    if (!database) return [];
    try {
        const rows = await database.getAllAsync<{ data: string }>(
            "SELECT data FROM thread_replies WHERE parent_id = ?",
            parentId,
        );
        // Parse per row: one truncated blob used to throw out of `map`, and the
        // catch then discarded every row that had already parsed.
        return rows
            .map((row) => {
                try {
                    return JSON.parse(row.data) as TimelineMessage;
                } catch {
                    return null;
                }
            })
            .filter((m): m is TimelineMessage => m !== null);
    } catch {
        return [];
    }
}

/**
 * Clear all thread cache.
 */
export async function clearThreadCache(): Promise<void> {
    const database = await getDb();
    if (!database) return;
    try {
        await database.runAsync("DELETE FROM thread_replies");
        await database.runAsync("DELETE FROM known_thread_replies");
    } catch {
        // ignore
    }
}
