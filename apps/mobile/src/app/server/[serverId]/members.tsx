import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { fetchViewerMembers, type ViewerMember } from "@/lib/firepit/servers";

type LoadState = "idle" | "loading" | "ready" | "error";

function initialsFor(member: ViewerMember): string {
    const label = member.displayName || member.username || "";
    const trimmed = label.trim();
    if (!trimmed) {
        return "?";
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function displayLabelFor(member: ViewerMember): string {
    return member.displayName || member.username || "Unknown member";
}

/**
 * Read-only server member list.
 *
 * The server returns members ordered by role rank and then by name, so this
 * renders the list as given rather than re-sorting it.
 */
export default function ServerMembersScreen() {
    const theme = useTheme();
    const { serverId } = useLocalSearchParams<{ serverId?: string }>();
    const { instanceUrl, accessToken } = useFirepitBootstrap();
    const normalizedServerId = Array.isArray(serverId) ? serverId[0] : serverId;

    const [members, setMembers] = useState<ViewerMember[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [truncated, setTruncated] = useState(false);

    const load = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedServerId) {
            return;
        }
        setLoadState("loading");
        setError(null);
        try {
            const data = await fetchViewerMembers(
                instanceUrl,
                accessToken,
                normalizedServerId,
            );
            setMembers(Array.isArray(data.members) ? data.members : []);
            setTruncated(Boolean(data.truncated));
            setLoadState("ready");
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : "Failed to load members",
            );
            setLoadState("error");
        }
    }, [accessToken, instanceUrl, normalizedServerId]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <SafeAreaView
            edges={["top", "left", "right"]}
            style={[styles.safeArea, { backgroundColor: theme.background }]}
        >
            <View style={styles.header}>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => router.back()}
                    style={styles.headerButton}
                >
                    <ThemedText type="smallBold" themeColor="foreground">
                        Back
                    </ThemedText>
                </Pressable>
                <ThemedText type="title" numberOfLines={1}>
                    Members
                </ThemedText>
            </View>

            {loadState === "loading" ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={theme.primary} />
                </View>
            ) : null}

            {loadState === "error" ? (
                <View style={styles.centered}>
                    <ThemedText type="small" themeColor="mutedForeground">
                        {error}
                    </ThemedText>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => void load()}
                        style={styles.retry}
                    >
                        <ThemedText type="smallBold" themeColor="primary">
                            Try again
                        </ThemedText>
                    </Pressable>
                </View>
            ) : null}

            {loadState === "ready" && members.length === 0 ? (
                <View style={styles.centered}>
                    <ThemedText type="small" themeColor="mutedForeground">
                        No members to show.
                    </ThemedText>
                </View>
            ) : null}

            {members.length > 0 ? (
                <FlatList
                    data={members}
                    keyExtractor={(member) => member.userId}
                    contentContainerStyle={styles.list}
                    ListFooterComponent={
                        truncated ? (
                            <ThemedText
                                type="small"
                                themeColor="mutedForeground"
                                style={styles.footer}
                            >
                                Large server — some members may be missing.
                            </ThemedText>
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <ThemedView
                            type="card"
                            style={styles.row}
                        >
                            <ThemedView
                                type="muted"
                                style={styles.avatar}
                            >
                                <ThemedText type="small" themeColor="foreground">
                                    {initialsFor(item)}
                                </ThemedText>
                            </ThemedView>
                            <ThemedText
                                type="small"
                                themeColor="foreground"
                                numberOfLines={1}
                                style={styles.name}
                            >
                                {displayLabelFor(item)}
                            </ThemedText>
                            {item.role ? (
                                <ThemedView
                                    style={[
                                        styles.roleChip,
                                        {
                                            backgroundColor: `${item.role.color}1f`,
                                        },
                                    ]}
                                >
                                    <ThemedText
                                        type="small"
                                        numberOfLines={1}
                                        style={{ color: item.role.color }}
                                    >
                                        {item.role.name}
                                    </ThemedText>
                                </ThemedView>
                            ) : null}
                        </ThemedView>
                    )}
                />
            ) : null}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    header: {
        alignItems: "center",
        flexDirection: "row",
        gap: Spacing.three,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.three,
    },
    headerButton: {
        paddingVertical: Spacing.one,
    },
    centered: {
        alignItems: "center",
        flex: 1,
        gap: Spacing.three,
        justifyContent: "center",
        padding: Spacing.four,
    },
    retry: {
        paddingVertical: Spacing.two,
    },
    list: {
        gap: Spacing.one,
        paddingHorizontal: Spacing.three,
        paddingBottom: Spacing.five,
    },
    row: {
        alignItems: "center",
        borderRadius: 10,
        flexDirection: "row",
        gap: Spacing.three,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    avatar: {
        alignItems: "center",
        borderRadius: 14,
        height: 28,
        justifyContent: "center",
        width: 28,
    },
    name: {
        flex: 1,
    },
    roleChip: {
        borderRadius: 999,
        maxWidth: 120,
        paddingHorizontal: Spacing.two,
        paddingVertical: 2,
    },
    footer: {
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
    },
});
