import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    View,
} from "react-native";
import { Users } from "lucide-react-native";

import { Avatar } from "@/components/ui/avatar";
import { StatusIndicator } from "@/components/status-indicator";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { fetchViewerMembers, type ViewerMember } from "@/lib/firepit/servers";
import { useStatusSubscription } from "@/hooks/use-status-subscription";
import { partitionByPresence } from "@/lib/presence";

type LoadState = "idle" | "loading" | "ready" | "error";

function displayLabelFor(member: ViewerMember): string {
    return member.displayName || member.username || "Unknown member";
}

// Hoisted so the list's cells are not re-rendered whenever the sheet is.
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
                initials={displayLabelFor(member)}
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
                        <ThemedText
                            type="code"
                            numberOfLines={1}
                            style={[styles.role, { color: member.role.color }]}
                        >
                            {member.role.name}
                        </ThemedText>
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
        <ThemedText
            type="smallBold"
            themeColor="mutedForeground"
            style={styles.groupHeader}
        >
            {title} ({count})
        </ThemedText>
    );
}

type Row =
    | { kind: "header"; id: string; title: string; count: number }
    | { kind: "member"; id: string; member: ViewerMember };

const rowKeyExtractor = (row: Row) => row.id;

type MembersSheetProps = {
    visible: boolean;
    onClose: () => void;
    serverId: string | null;
    /** Shown under the title so the list reads as belonging to the channel
     *  you opened it from. */
    channelName?: string | null;
    /** Member count the channel reports, used until the list resolves. */
    expectedCount?: number | null;
};

/**
 * Server member list as a sheet over the chat page.
 *
 * Members are server-scoped: the viewer endpoint is the only member list the
 * instance exposes, and it is what the web chat rail uses, so this matches it
 * rather than inventing a per-channel filter the API cannot answer.
 *
 * The server returns members ordered by role rank and then by name, so the
 * list partitions that order into online/offline rather than re-sorting:
 * a stable partition keeps role precedence inside each group.
 */
export function MembersSheet({
    visible,
    onClose,
    serverId,
    channelName,
    expectedCount,
}: MembersSheetProps) {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();

    const [members, setMembers] = useState<ViewerMember[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [truncated, setTruncated] = useState(false);

    useEffect(() => {
        if (!visible || !instanceUrl || !accessToken || !serverId) {
            return;
        }
        let cancelled = false;
        setLoadState("loading");
        setError(null);
        fetchViewerMembers(instanceUrl, accessToken, serverId)
            .then((data) => {
                if (cancelled) return;
                setMembers(Array.isArray(data.members) ? data.members : []);
                setTruncated(Boolean(data.truncated));
                setLoadState("ready");
            })
            .catch((cause: unknown) => {
                if (cancelled) return;
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "Failed to load members",
                );
                setLoadState("error");
            });
        return () => {
            cancelled = true;
        };
    }, [accessToken, instanceUrl, serverId, visible]);

    const memberIds = useMemo(
        () => members.map((member) => member.userId),
        [members],
    );
    const { statuses } = useStatusSubscription(
        instanceUrl,
        accessToken,
        memberIds,
    );

    // Busy and Away count as online; only Offline does not.
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

    const openProfile = useCallback(
        (userId: string) => {
            onClose();
            router.push(`/user/${userId}`);
        },
        [onClose],
    );

    const renderRow = useCallback(
        ({ item }: { item: Row }) => {
            if (item.kind === "header") {
                return (
                    <MemberGroupHeader
                        title={item.title}
                        count={item.count}
                    />
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

    const subtitle = channelName?.trim() || null;
    const headerCount =
        loadState === "ready"
            ? members.length
            : (expectedCount ?? null);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View
                style={[
                    styles.sheet,
                    {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                    },
                ]}
            >
                <View style={[styles.grabber, { backgroundColor: theme.border }]} />

                <View style={styles.headerRow}>
                    <Users size={16} color={theme.mutedForeground} />
                    <ThemedText type="smallBold">Members</ThemedText>
                    {headerCount !== null ? (
                        <ThemedText type="code" themeColor="mutedForeground">
                            {headerCount}
                        </ThemedText>
                    ) : null}
                    <View style={styles.headerSpacer} />
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Close members"
                        onPress={onClose}
                        hitSlop={8}
                    >
                        <ThemedText type="code" themeColor="mutedForeground">
                            Close
                        </ThemedText>
                    </Pressable>
                </View>

                {subtitle ? (
                    <ThemedText
                        type="code"
                        themeColor="mutedForeground"
                        numberOfLines={1}
                        style={styles.subtitle}
                    >
                        {subtitle}
                    </ThemedText>
                ) : null}

                {loadState === "loading" && members.length === 0 ? (
                    <View style={styles.centered}>
                        <ActivityIndicator color={theme.primary} />
                        <ThemedText themeColor="mutedForeground">
                            Loading members…
                        </ThemedText>
                    </View>
                ) : loadState === "error" ? (
                    <View style={styles.centered}>
                        <ThemedText themeColor="destructive">{error}</ThemedText>
                    </View>
                ) : rows.length === 0 ? (
                    <View style={styles.centered}>
                        <ThemedText themeColor="mutedForeground">
                            No members to show.
                        </ThemedText>
                    </View>
                ) : (
                    <FlatList
                        data={rows}
                        keyExtractor={rowKeyExtractor}
                        renderItem={renderRow}
                        windowSize={5}
                        maxToRenderPerBatch={10}
                        initialNumToRender={10}
                        contentContainerStyle={styles.listContent}
                        ListFooterComponent={
                            truncated ? (
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                    style={styles.footer}
                                >
                                    Large server — some members may be
                                    missing.
                                </ThemedText>
                            ) : null
                        }
                    />
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFill,
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "80%",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        paddingBottom: Spacing.three,
    },
    grabber: {
        alignSelf: "center",
        width: 36,
        height: 4,
        borderRadius: 2,
        marginTop: Spacing.two,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingTop: Spacing.three,
        paddingBottom: Spacing.one,
    },
    headerSpacer: {
        flex: 1,
    },
    subtitle: {
        paddingHorizontal: Spacing.three,
        paddingBottom: Spacing.two,
    },
    centered: {
        alignItems: "center",
        justifyContent: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.five,
        paddingHorizontal: Spacing.three,
    },
    listContent: {
        paddingHorizontal: Spacing.two,
        paddingBottom: Spacing.two,
    },
    groupHeader: {
        paddingHorizontal: Spacing.one,
        paddingTop: Spacing.three,
        paddingBottom: Spacing.one,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.one,
        paddingHorizontal: Spacing.one,
        borderRadius: 8,
    },
    rowPressed: {
        opacity: 0.6,
    },
    identity: {
        flex: 1,
        minWidth: 0,
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
    },
    name: {
        flexShrink: 1,
    },
    role: {
        flexShrink: 1,
        maxWidth: 120,
    },
    customStatus: {
        fontStyle: "italic",
        paddingLeft: 2,
    },
    footer: {
        paddingHorizontal: Spacing.one,
        paddingTop: Spacing.three,
    },
});
