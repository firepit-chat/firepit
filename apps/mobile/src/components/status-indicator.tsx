import { memo } from "react";
import { View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import type { UserStatus } from "@/hooks/use-status-subscription";

export type PresenceStatus = UserStatus["status"];

type StatusColors = {
    dot: string;
    label: string;
};

/**
 * One place that knows what each presence looks like.
 *
 * This replaces three separate copies of the same mapping — the DM header, the
 * profile screen and the profile sheet each had their own, two of them with
 * hardcoded hex values that could drift from the palette.
 */
const STATUS_PRESENTATION: Record<PresenceStatus, StatusColors> = {
    online: { dot: "#22c55e", label: "Online" },
    away: { dot: "#f59e0b", label: "Away" },
    busy: { dot: "#ef4444", label: "Do not disturb" },
    offline: { dot: "#6b7280", label: "Offline" },
};

export function statusColor(status?: string): StatusColors | null {
    if (!status) return null;
    const normalized = status.toLowerCase().replace(/[\s_-]/g, "");
    if (normalized === "online") return STATUS_PRESENTATION.online;
    if (normalized === "away" || normalized === "idle") {
        return STATUS_PRESENTATION.away;
    }
    if (normalized === "dnd" || normalized === "donotdisturb") {
        return STATUS_PRESENTATION.busy;
    }
    return STATUS_PRESENTATION.offline;
}

/**
 * Busy and Away are deliberate choices by someone who is still here, so only
 * Offline counts as offline. Shared with the member list's grouping.
 */
export function isOnlineStatus(status?: string): boolean {
    const normalized = status?.toLowerCase();
    return (
        normalized === "online" ||
        normalized === "busy" ||
        normalized === "away" ||
        normalized === "idle" ||
        normalized === "dnd" ||
        normalized === "donotdisturb"
    );
}

export const StatusIndicator = memo(function StatusIndicator({
    status,
    size = 8,
    showLabel = false,
}: {
    status?: string;
    size?: number;
    showLabel?: boolean;
}) {
    const info = statusColor(status);
    if (!info) return null;

    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View
                style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: info.dot,
                }}
            />
            {showLabel ? (
                <ThemedText themeColor="mutedForeground" type="code">
                    {info.label}
                </ThemedText>
            ) : null}
        </View>
    );
});