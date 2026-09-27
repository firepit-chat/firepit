import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    applyMessageAction,
    fetchChannels,
    fetchModerationMessages,
    type Channel,
    type MessageModerationAction,
    type ModerationMessageEntry,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

function formatTime(value?: string): string {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

export default function MessageModerationScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();
    const { serverId } = useLocalSearchParams<{ serverId?: string }>();

    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
    const [onlyRemoved, setOnlyRemoved] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [messages, setMessages] = useState<ModerationMessageEntry[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [actingId, setActingId] = useState<string | null>(null);

    const loadChannels = useCallback(async () => {
        if (!instanceUrl || !accessToken || !serverId) return;
        try {
            const res = await fetchChannels(instanceUrl, accessToken, serverId, 100);
            setChannels(res.channels ?? []);
        } catch {
            // Channel picker is optional; default to listing all channels.
        }
    }, [accessToken, instanceUrl, serverId]);

    const loadMessages = useCallback(async () => {
        if (!instanceUrl || !accessToken || !serverId) return;
        setLoadState("loading");
        setLoadError(null);
        try {
            const res = await fetchModerationMessages(instanceUrl, accessToken, serverId, {
                channelId: selectedChannelId ?? undefined,
                onlyRemoved,
                text: searchText.trim() || undefined,
                limit: 30,
            });
            setMessages(res.items ?? []);
            setNextCursor(res.nextCursor ?? null);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Unable to load moderation messages",
            );
        }
    }, [accessToken, instanceUrl, serverId, selectedChannelId, onlyRemoved, searchText]);

    useEffect(() => {
        void loadChannels();
    }, [loadChannels]);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    useRetryOnReconnect(loadState === "error", loadMessages);

    const loadMore = useCallback(async () => {
        if (!instanceUrl || !accessToken || !serverId || !nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await fetchModerationMessages(instanceUrl, accessToken, serverId, {
                channelId: selectedChannelId ?? undefined,
                onlyRemoved,
                text: searchText.trim() || undefined,
                limit: 30,
                cursorAfter: nextCursor,
            });
            setMessages((prev) => [...prev, ...(res.items ?? [])]);
            setNextCursor(res.nextCursor ?? null);
        } catch (error) {
            setLoadError(
                error instanceof Error ? error.message : "Failed to load more messages",
            );
        } finally {
            setLoadingMore(false);
        }
    }, [accessToken, instanceUrl, serverId, selectedChannelId, onlyRemoved, searchText, nextCursor, loadingMore]);

    const handleAction = useCallback(
        async (message: ModerationMessageEntry, action: MessageModerationAction) => {
            if (!instanceUrl || !accessToken || !message.$id) return;

            if (action === "hard-delete") {
                Alert.alert(
                    "Permanently delete?",
                    "This message can never be recovered.",
                    [
                        { text: "Cancel", style: "cancel" },
                        {
                            text: "Delete forever",
                            style: "destructive",
                            onPress: () => void runAction(message, action),
                        },
                    ],
                );
                return;
            }

            void runAction(message, action);
        },
        [accessToken, instanceUrl],
    );

    const runAction = async (
        message: ModerationMessageEntry,
        action: MessageModerationAction,
    ) => {
        if (!instanceUrl || !accessToken || !message.$id) return;
        setActingId(`${action}:${message.$id}`);
        setLoadError(null);
        try {
            await applyMessageAction(instanceUrl, accessToken, message.$id, action);
            if (action === "soft-delete") {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.$id === message.$id
                            ? { ...m, removedAt: new Date().toISOString() }
                            : m,
                    ),
                );
            } else if (action === "restore") {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.$id === message.$id ? { ...m, removedAt: undefined } : m,
                    ),
                );
            } else {
                setMessages((prev) => prev.filter((m) => m.$id !== message.$id));
            }
        } catch (error) {
            setLoadError(
                error instanceof Error ? error.message : "Action failed",
            );
        } finally {
            setActingId(null);
        }
    };

    const isRemoved = (message: ModerationMessageEntry) =>
        Boolean(
            message.removedAt ||
            (message as ModerationMessageEntry & { removed?: boolean }).removed,
        );

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
                <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
                    <ScrollView
                        style={{ width: "100%" }}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.shell}>
                            <View style={styles.header}>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => router.back()}
                                    style={styles.headerButton}
                                >
                                    <ThemedText type="smallBold">Back</ThemedText>
                                </Pressable>
                                <ThemedText type="smallBold">Message moderation</ThemedText>
                                <View style={styles.headerButton} />
                            </View>

                            <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                Review a server's messages. Remove, restore, or permanently
                                delete content.
                            </ThemedText>

                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.channelRow}
                                >
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={() => setSelectedChannelId(null)}
                                        style={[
                                            styles.channelChip,
                                            {
                                                borderColor:
                                                    selectedChannelId === null
                                                        ? theme.primary
                                                        : theme.border,
                                                backgroundColor:
                                                    selectedChannelId === null
                                                        ? theme.secondary
                                                        : theme.card,
                                            },
                                        ]}
                                    >
                                        <ThemedText type="smallBold">All channels</ThemedText>
                                    </Pressable>
                                    {channels.map((channel) => {
                                        const selected = selectedChannelId === channel.$id;
                                        return (
                                            <Pressable
                                                key={channel.$id}
                                                accessibilityRole="button"
                                                onPress={() => setSelectedChannelId(channel.$id ?? null)}
                                                style={[
                                                    styles.channelChip,
                                                    {
                                                        borderColor: selected ? theme.primary : theme.border,
                                                        backgroundColor: selected ? theme.secondary : theme.card,
                                                    },
                                                ]}
                                            >
                                                <ThemedText type="smallBold" numberOfLines={1}>
                                                    {channel.name ?? "channel"}
                                                </ThemedText>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>

                                <TextInput
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    placeholder="Search message text…"
                                    placeholderTextColor={theme.mutedForeground}
                                    value={searchText}
                                    onChangeText={setSearchText}
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: theme.card,
                                            borderColor: theme.input,
                                            color: theme.foreground,
                                        },
                                    ]}
                                />

                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => setOnlyRemoved((prev) => !prev)}
                                    style={[styles.removedToggle, { borderColor: onlyRemoved ? theme.primary : theme.border }]}
                                >
                                    <ThemedText type="smallBold">
                                        {onlyRemoved ? "✓ " : ""}Removed messages only
                                    </ThemedText>
                                </Pressable>
                            </ThemedView>

                            {loadState === "loading" ? (
                                <View style={styles.loadingRow}>
                                    <ActivityIndicator color={theme.primary} />
                                    <ThemedText themeColor="mutedForeground">
                                        Loading messages…
                                    </ThemedText>
                                </View>
                            ) : null}

                            {loadError ? (
                                <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                                    <ThemedText themeColor="danger">{loadError}</ThemedText>
                                </ThemedView>
                            ) : null}

                            {loadState === "ready" && messages.length === 0 ? (
                                <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                                    <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
                                        No messages match these filters.
                                    </ThemedText>
                                </ThemedView>
                            ) : null}

                            {messages.map((message) => {
                                const removed = isRemoved(message);
                                return (
                                    <ThemedView
                                        key={message.$id}
                                        type="card"
                                        style={[styles.card, { borderColor: theme.border }]}
                                    >
                                        <View style={styles.messageHeader}>
                                            <ThemedText type="smallBold" numberOfLines={1} style={styles.messageSender}>
                                                {message.senderDisplay ?? message.userName ?? message.userId ?? "Unknown"}
                                            </ThemedText>
                                            <ThemedText type="code" themeColor="mutedForeground" style={styles.messageTime}>
                                                {formatTime(message.removedAt ?? message.createdAt)}
                                            </ThemedText>
                                        </View>
                                        <ThemedText style={styles.messageBody}>
                                            {message.text?.trim() ? message.text : "(attachment or no text)"}
                                        </ThemedText>
                                        {removed ? (
                                            <ThemedText type="code" themeColor="warning" style={styles.removedLabel}>
                                                Removed
                                            </ThemedText>
                                        ) : null}
                                        <View style={styles.actionRow}>
                                            {!removed ? (
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={actingId !== null}
                                                    onPress={() => void handleAction(message, "soft-delete")}
                                                    style={({ pressed }) => [
                                                        styles.actionButton,
                                                        {
                                                            backgroundColor: theme.secondary,
                                                            opacity: pressed || actingId !== null ? 0.6 : 1,
                                                        },
                                                    ]}
                                                >
                                                    <ThemedText type="smallBold">
                                                        {actingId === `soft-delete:${message.$id}` ? "…" : "Remove"}
                                                    </ThemedText>
                                                </Pressable>
                                            ) : (
                                                <>
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        disabled={actingId !== null}
                                                        onPress={() => void handleAction(message, "restore")}
                                                        style={({ pressed }) => [
                                                            styles.actionButton,
                                                            {
                                                                backgroundColor: theme.secondary,
                                                                opacity: pressed || actingId !== null ? 0.6 : 1,
                                                            },
                                                        ]}
                                                    >
                                                        <ThemedText type="smallBold">
                                                            {actingId === `restore:${message.$id}` ? "…" : "Restore"}
                                                        </ThemedText>
                                                    </Pressable>
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        disabled={actingId !== null}
                                                        onPress={() => void handleAction(message, "hard-delete")}
                                                        style={({ pressed }) => [
                                                            styles.actionButton,
                                                            {
                                                                borderColor: theme.danger,
                                                                borderWidth: 1,
                                                                opacity: pressed || actingId !== null ? 0.6 : 1,
                                                            },
                                                        ]}
                                                    >
                                                        <ThemedText type="smallBold" themeColor="danger">
                                                            {actingId === `hard-delete:${message.$id}` ? "…" : "Delete"}
                                                        </ThemedText>
                                                    </Pressable>
                                                </>
                                            )}
                                        </View>
                                    </ThemedView>
                                );
                            })}

                            {nextCursor ? (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={loadingMore}
                                    onPress={() => void loadMore()}
                                    style={({ pressed }) => ({
                                        alignSelf: "center",
                                        borderRadius: 999,
                                        backgroundColor: theme.secondary,
                                        paddingHorizontal: Spacing.four,
                                        paddingVertical: Spacing.two,
                                        opacity: pressed || loadingMore ? 0.6 : 1,
                                    })}
                                >
                                    {loadingMore ? (
                                        <ActivityIndicator size="small" color={theme.foreground} />
                                    ) : (
                                        <ThemedText type="smallBold">Load more</ThemedText>
                                    )}
                                </Pressable>
                            ) : null}
                        </View>
                    </ScrollView>
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    safeArea: { flex: 1, paddingHorizontal: Spacing.two },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: Spacing.two,
    },
    headerButton: {
        paddingVertical: Spacing.one,
        paddingHorizontal: Spacing.two,
        minWidth: 60,
    },
    copy: { fontSize: 14, lineHeight: 20 },
    card: {
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
    },
    channelRow: {
        gap: Spacing.two,
        paddingVertical: Spacing.half,
    },
    channelChip: {
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.one,
        maxWidth: 220,
    },
    input: {
        borderRadius: 16,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderWidth: 1,
        fontSize: 16,
    },
    removedToggle: {
        alignSelf: "flex-start",
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.one,
    },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.two,
    },
    emptyText: {
        fontSize: 14,
        lineHeight: 20,
        paddingVertical: Spacing.four,
        textAlign: "center",
    },
    messageHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    messageSender: { flex: 1 },
    messageTime: { fontSize: 11 },
    messageBody: { fontSize: 14, lineHeight: 20 },
    removedLabel: { fontSize: 11 },
    actionRow: {
        flexDirection: "row",
        gap: Spacing.two,
        marginTop: Spacing.one,
    },
    actionButton: {
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.one,
    },
});