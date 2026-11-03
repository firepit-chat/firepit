import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import MentionAutocomplete, {
    type MentionableItem,
    type MentionableUser,
} from "@/components/mention-autocomplete";
import { authHeaders } from "@/lib/firepit/http";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import MessageWithMentions from "@/components/message-with-mentions";
import { EmptyState } from "@/components/empty-state";
import { Search } from "lucide-react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { searchMessages, type SearchMessageResult } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

type LoadState = "idle" | "loading" | "ready" | "error";

function resultContextLabel(result: SearchMessageResult) {
    if (result.type === "channel") {
        return (
            [result.serverId, result.channelId].filter(Boolean).join(" / ") ||
            "channel"
        );
    }

    return result.conversationId ?? "conversation";
}

export default function SearchScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken, state } = useFirepitBootstrap();
    const [query, setQuery] = useState("");
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<SearchMessageResult[]>([]);

    const signedIn = Boolean(state === "ready" && instanceUrl && accessToken);

    // `from:` accepts a display name, which can contain spaces, so pick the
    // partial out of the raw query instead of splitting on whitespace.
    const [fromPartial, fromMatch] = useMemo(() => {
        const m = /(?:^|\s)from:([^\s@]*)$/.exec(query);
        return m ? [m[1], m[0]] : [null, null];
    }, [query]);

    const [authorCandidates, setAuthorCandidates] = useState<MentionableUser[]>(
        [],
    );
    useEffect(() => {
        if (!signedIn || fromPartial === null || !instanceUrl || !accessToken) {
            setAuthorCandidates([]);
            return;
        }
        const controller = new AbortController();
        const handle = setTimeout(async () => {
            try {
                const res = await fetch(
                    `${instanceUrl}/api/users/search?q=${encodeURIComponent(fromPartial)}&limit=10`,
                    {
                        signal: controller.signal,
                        headers: authHeaders(accessToken),
                    },
                );
                if (!res.ok) return;
                const data = await res.json();
                const users: MentionableUser[] = Array.isArray(data?.users)
                    ? data.users
                    : [];
                setAuthorCandidates(users);
            } catch {
                // Aborted or offline; the filter still works if typed by hand.
            }
        }, 180);
        return () => {
            controller.abort();
            clearTimeout(handle);
        };
    }, [fromPartial, accessToken, instanceUrl, signedIn]);

    const handleAuthorSelect = useCallback(
        (item: MentionableItem | null) => {
            if (!item || item.type !== "user" || !fromMatch) return;
            setQuery(
                query.slice(0, query.length - fromMatch.length) +
                    `from:"${(item.displayName ?? "").replace(/"/g, "")}"`,
            );
        },
        [fromMatch, query],
    );

    const runSearch = useCallback(
        async (nextQuery: string) => {
            if (!instanceUrl || !accessToken) {
                return;
            }

            const trimmed = nextQuery.trim();
            if (trimmed.length < 2) {
                setResults([]);
                setLoadState("idle");
                setError(null);
                return;
            }

            setLoadState("loading");
            setError(null);

            try {
                const response = await searchMessages(
                    instanceUrl,
                    accessToken,
                    trimmed,
                );
                setResults(response.results ?? []);
                setLoadState("ready");
            } catch (searchError) {
                setLoadState("error");
                setError(
                    searchError instanceof Error
                        ? searchError.message
                        : "Unable to search messages",
                );
            }
        },
        [accessToken, instanceUrl],
    );

    const retrySearch = useCallback(() => {
        void runSearch(query);
    }, [query, runSearch]);

    useRetryOnReconnect(loadState === "error", retrySearch);

    const openResult = useCallback((result: SearchMessageResult) => {
        if (result.type === "channel" && result.serverId && result.channelId) {
            router.push({
                pathname: "/server/messages/[serverId]/[channelId]",
                params: {
                    serverId: result.serverId,
                    channelId: result.channelId,
                },
            });
            return;
        }
        if (result.type === "dm" && result.conversationId) {
            router.push(`/dm/${result.conversationId}` as never);
        }
    }, []);

    const renderItem = useCallback(
        ({ item }: { item: SearchMessageResult }) => (
            <SearchResultCard result={item} onPress={() => openResult(item)} />
        ),
        [openResult],
    );

    return (
        <AuthRouteGuard>
            <FlatList
                data={results}
                keyExtractor={(item, index) =>
                    item.message.$id ?? `${item.type}-${index}`
                }
                ListHeaderComponent={
                    <SafeAreaView style={styles.safeArea}>
                        <ThemedView style={styles.shell}>
                            <View style={styles.hero}>
                                <ThemedText type="code" themeColor="accent">
                                    Search
                                </ThemedText>
                                <ThemedText type="title">
                                    Message search
                                </ThemedText>
                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.copy}
                                >
                                    Search messages and jump straight into the
                                    right channel or conversation.
                                </ThemedText>
                                {fromPartial !== null &&
                                    authorCandidates.length > 0 && (
                                        <MentionAutocomplete
                                            users={authorCandidates}
                                            roles={[]}
                                            onSelect={handleAuthorSelect}
                                        />
                                    )}
                                <TextInput
                                    editable={signedIn}
                                    placeholder="Search messages, e.g. from:alex or has:image"
                                    placeholderTextColor={theme.mutedForeground}
                                    value={query}
                                    onChangeText={setQuery}
                                    onSubmitEditing={() =>
                                        void runSearch(query)
                                    }
                                    style={[
                                        styles.input,
                                        {
                                            borderColor: theme.border,
                                            color: theme.foreground,
                                        },
                                    ]}
                                />
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => void runSearch(query)}
                                    style={({ pressed }) => [
                                        styles.button,
                                        {
                                            backgroundColor: theme.primary,
                                            opacity: pressed ? 0.88 : 1,
                                        },
                                    ]}
                                >
                                    <ThemedText
                                        type="smallBold"
                                        themeColor="primaryForeground"
                                    >
                                        {loadState === "loading"
                                            ? "Searching…"
                                            : "Search"}
                                    </ThemedText>
                                </Pressable>
                                {error ? (
                                    <ThemedText themeColor="destructive">
                                        {error}
                                    </ThemedText>
                                ) : null}
                                {loadState === "ready" ? (
                                    <ThemedText themeColor="mutedForeground">
                                        {results.length} result
                                        {results.length === 1 ? "" : "s"}
                                    </ThemedText>
                                ) : null}
                            </View>
                        </ThemedView>
                    </SafeAreaView>
                }
                ListEmptyComponent={
                    loadState === "loading" ? (
                        <View style={styles.loadingWrap}>
                            <ActivityIndicator />
                        </View>
                    ) : (
                        <SafeAreaView style={styles.safeArea}>
                            <ThemedView style={styles.shell}>
                                <EmptyState
                                    icon={
                                        <Search
                                            size={20}
                                            color={theme.mutedForeground}
                                        />
                                    }
                                    title="Search messages"
                                    description="Enter at least two characters to search across your servers and conversations."
                                />
                            </ThemedView>
                        </SafeAreaView>
                    )
                }
                renderItem={renderItem}
                windowSize={5}
                maxToRenderPerBatch={10}
                initialNumToRender={10}
                removeClippedSubviews
                contentContainerStyle={styles.listContent}
                style={{ backgroundColor: theme.background, flex: 1 }}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
            />
        </AuthRouteGuard>
    );
}

function SearchResultCard({
    result,
    onPress,
}: {
    result: SearchMessageResult;
    onPress: () => void;
}) {
    const theme = useTheme();
    const message = result.message;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.resultWrap,
                { borderBottomColor: theme.border },
                pressed && styles.resultPressed,
            ]}
        >
            <View>
                <View style={styles.resultHeader}>
                    <ThemedText type="smallBold">
                        {message.userName ?? message.userId ?? "Unknown user"}
                    </ThemedText>
                    <ThemedText type="code" themeColor="mutedForeground">
                        {resultContextLabel(result)}
                    </ThemedText>
                </View>
                <MessageWithMentions text={message.text ?? ""} />
                <View style={styles.resultFooter}>
                    <ThemedText type="code" themeColor="mutedForeground">
                        {result.type === "channel"
                            ? "Open channel context"
                            : "Open conversation context"}
                    </ThemedText>
                    {message.$createdAt ? (
                        <ThemedText type="code" themeColor="mutedForeground">
                            {new Date(message.$createdAt).toLocaleString()}
                        </ThemedText>
                    ) : null}
                </View>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: BottomTabInset + Spacing.four,
    },
    safeArea: {
        paddingHorizontal: Spacing.three,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
    },
    hero: {
        gap: Spacing.two,
        paddingVertical: Spacing.three,
    },
    copy: {
        fontSize: 14,
        lineHeight: 20,
    },
    input: {
        borderWidth: 1,
        borderRadius: 16,
        minHeight: 52,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    button: {
        borderRadius: 999,
        alignSelf: "flex-start",
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    loadingWrap: {
        padding: Spacing.four,
        alignItems: "center",
    },
    // A list of results reads as one surface divided into rows. A card per
    // result put four borders on screen for every message and made a long
    // list look like a stack of unrelated boxes.
    resultWrap: {
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resultPressed: {
        opacity: 0.6,
    },
    resultHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
    resultFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: Spacing.two,
    },
});
