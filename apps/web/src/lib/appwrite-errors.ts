/**
 * Returns the Appwrite code and type of an error as a log message suffix,
 * for example " (Appwrite 402 team_read_only)". Returns "" when the error
 * carries neither.
 */
export function describeAppwriteError(error: unknown): string {
    if (!error || typeof error !== "object") {
        return "";
    }
    const { code, type } = error as { code?: unknown; type?: unknown };
    const parts = [
        typeof code === "number" && code,
        typeof type === "string" && type,
    ].filter(Boolean);
    return parts.length > 0 ? ` (Appwrite ${parts.join(" ")})` : "";
}
