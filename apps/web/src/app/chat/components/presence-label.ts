import type { PresenceStatus, UserStatus } from "@/lib/types";

/**
 * The secondary line under a name in the DM and friends lists.
 *
 * Prefers the custom status text a person chose, and otherwise spells out the
 * presence word. Previously the raw stored value was rendered directly, which
 * meant lowercase `online`/`offline` rather than a readable label, and a custom
 * status was never shown at all.
 */
export function presenceLabel(status: PresenceStatus): string {
    switch (status) {
        case "online":
            return "Online";
        case "away":
            return "Away";
        case "busy":
            return "Busy";
        default:
            return "Offline";
    }
}

export function presenceText(
    status: PresenceStatus | undefined,
    customMessage?: string,
): string {
    const label = presenceLabel(status ?? "offline");
    // A custom message with no text is not worth showing on its own.
    const trimmed = customMessage?.trim();
    return trimmed ? `${label} — ${trimmed}` : label;
}

/** Picks the best available presence record for a row. */
export function resolvePresence(
    live: UserStatus | undefined,
    fallbackStatus: PresenceStatus | undefined,
    fallbackMessage?: string,
): { customMessage?: string; status: PresenceStatus } {
    return {
        customMessage: live?.customMessage ?? fallbackMessage,
        status: live?.status ?? fallbackStatus ?? "offline",
    };
}
