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
        typeof code === "number" ? String(code) : null,
        typeof type === "string" && type ? type : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? ` (Appwrite ${parts.join(" ")})` : "";
}
