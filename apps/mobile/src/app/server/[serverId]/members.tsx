import { router, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/avatar";
import { StatusIndicator } from "@/components/status-indicator";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { fetchViewerMembers, type ViewerMember } from "@/lib/firepit/servers";
import { useStatusSubscription } from "@/hooks/use-status-subscription";
import { partitionByPresence } from "@/lib/presence";

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
const rowKeyExtractor = (row: { id: string }) => row.id;

// Hoisted so the list's cells are not re-rendered whenever the parent is.
const MemberRow = memo(function MemberRow({
    member,
    status,
    customMessage,
    onPress,
}: {
    member: ViewerMember;
    status?: string;
    customMessage?: string;
    onPress: (userId: string) => void;
}) {
    return (
        <Pressable
            onPress={() => onPress(member.userId)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
            <Avatar
                uri={member.avatarUrl}
                size={28}
                initials={initialsFor(member)}
                frameUrl={member.avatarFrameUrl ?? undefined}
                frameInset={member.avatarFrameInsetPercent ?? 12}
            />
            <View style={styles.identity}>
                <View style={styles.nameRow}>
                    <ThemedText
                        type="small"
                        themeColor="foreground"
                        numberOfLines={1}
                        style={styles.name}
                    >
                        {displayLabelFor(member)}
                    </ThemedText>
                    {status ? (
                        <StatusIndicator status={status} size={8} />
                    ) : null}
                    {member.role ? (
                        <ThemedView
                            style={[
                                styles.roleChip,
                                { backgroundColor: `${member.role.color}1f` },
                            ]}
                        >
                            <ThemedText
                                type="small"
                                numberOfLines={1}
                                style={{ color: member.role.color }}
                            >
                                {member.role.name}
                            </ThemedText>
                        </ThemedView>
                    ) : null}
                </View>
                {/* Indented under the name so it reads as a status rather than
                    as a second label. */}
                {customMessage ? (
                    <ThemedText
                        type="small"
                        themeColor="mutedForeground"
                        numberOfLines={1}
                        style={styles.customStatus}
                    >
                        {customMessage}
                    </ThemedText>
                ) : null}
            </View>
        </Pressable>
    );
});

function MemberGroupHeader({ title, count }: { title: string; count: number }) {
    return (
        <ThemedText type="smallBold" themeColor="mutedForeground" style={styles.groupHeader}>
            {title} ({count})
        </ThemedText>
    );
}

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

    const memberIds = useMemo(
        () => members.map((member) => member.userId),
        [members],
    );
    const { statuses } = useStatusSubscription(
        instanceUrl,
        accessToken,
        memberIds,
    );

    // The server already returns members in role-precedence order, so
    // partitioning in place keeps that order inside each group instead of
    // re-sorting. Busy and Away count as online; only Offline does not.
    const { online, offline } = useMemo(
        () =>
            partitionByPresence(
                members,
                (member) => statuses[member.userId]?.status,
            ),
        [members, statuses],
    );

    // Flattened so the two groups share one virtualized list: a single
    // FlatList per group would nest virtualized lists.
    type Row =
        | { kind: "header"; id: string; title: string; count: number }
        | { kind: "member"; id: string; member: ViewerMember };

    const rows = useMemo<Row[]>(() => {
        const result: Row[] = [];
        if (online.length > 0) {
            result.push({
                kind: "header",
                id: "header-online",
                title: "Online",
                count: online.length,
            });
            for (const member of online) {
                result.push({ kind: "member", id: member.userId, member });
            }
        }
        if (offline.length > 0) {
            result.push({
                kind: "header",
                id: "header-offline",
                title: "Offline",
                count: offline.length,
            });
            for (const member of offline) {
                result.push({ kind: "member", id: member.userId, member });
            }
        }
        return result;
    }, [online, offline]);

    const openProfile = useCallback((userId: string) => {
        router.push(`/user/${userId}`);
    }, []);

    const renderRow = useCallback(
        ({ item }: { item: Row }) => {
            if (item.kind === "header") {
                return (
                    <MemberGroupHeader title={item.title} count={item.count} />
                );
            }
            const status = statuses[item.member.userId];
            return (
                <MemberRow
                    member={item.member}
                    status={status?.status}
                    customMessage={status?.customMessage?.trim() || undefined}
                    onPress={openProfile}
                />
            );
        },
        [openProfile, statuses],
    );

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

            {rows.length > 0 ? (
                <FlatList
                    data={rows}
                    keyExtractor={rowKeyExtractor}
                    contentContainerStyle={styles.list}
                    // Same tuning as the other lists in the app. Without this the
                    // FlatList default windowSize of 21 keeps ~21 screens of
                    // rows mounted, and the member list has no hard cap.
                    windowSize={5}
                    maxToRenderPerBatch={10}
                    initialNumToRender={10}
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
                    renderItem={renderRow}
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
    rowPressed: {
        opacity: 0.6,
    },
    identity: {
        flex: 1,
        gap: 1,
    },
    nameRow: {
        alignItems: "center",
        flexDirection: "row",
        gap: Spacing.two,
    },
    customStatus: {
        fontStyle: "italic",
        paddingLeft: 2,
    },
    groupHeader: {
        paddingHorizontal: Spacing.three,
        paddingTop: Spacing.three,
    },
    name: {
        flexShrink: 1,
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
