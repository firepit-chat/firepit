import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import {
    ChatBubbleMessage,
    type Reaction,
} from "@/components/chat-bubble-message";
import type { FileAttachment } from "@/components/file-attachment-display";
import { ThemedText } from "@/components/themed-text";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    createDMThreadReply,
    fetchDMThreadMessages,
    fetchChannelThreadMessages,
    createChannelThreadReply,
} from "@/lib/firepit";
import type { CustomEmoji } from "@/lib/firepit/types";
import { markAsThreadReply } from "@/lib/cache/ThreadCache";
import { markThreadRead } from "@/lib/firepit/thread-reads";
import { getProfilesBatch } from "@/lib/profile-cache";

/**
 * Appwrite returns `reactions` as a JSON string, not an array. The channel
 * message screen parses it before handing it to a bubble; the thread panel did
 * not, so a parent message that had any reactions passed a string into
 * `reactions.map(...)` and threw "undefined is not a function" the moment the
 * thread opened.
 */
function toArray<T>(value: unknown): T[] | undefined {
    if (Array.isArray(value)) return value as T[];
    if (typeof value === "string" && value.length > 0) {
        try {
            const parsed: unknown = JSON.parse(value);
            return Array.isArray(parsed) ? (parsed as T[]) : undefined;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

type LoadState = "idle" | "loading" | "ready" | "error";

type Props = {
    parentMessageId: string;
    instanceUrl: string;
    accessToken: string;
    customEmojis: CustomEmoji[];
    onClose: () => void;
    onReplySent?: () => void;
    /** The thread's true reply count. The list the panel was opened from holds a
     *  snapshot of the parent taken at load time, so a thread grown since then
     *  showed no reply counter on the parent row. This fires on open and again
     *  after every send. */
    onReplyCountChange?: (count: number) => void;
    type: "dm" | "channel";
    /** Channel id for a channel thread, conversation id for a DM thread. Read
     *  state is scoped to it — it is the channel, not the server. */
    contextId?: string | null;
    /** Tapping an image inside the thread opens it full-screen. */
    onOpenImageViewer?: (url: string) => void;
    /** Without this the panel hardcoded isMine=false, so the viewer's own
     *  replies rendered with their avatar beside them like anyone else's. */
    currentUserId?: string | null;
};

export function ThreadPanel({
    parentMessageId,
    instanceUrl,
    accessToken,
    customEmojis,
    onClose,
    onReplySent,
    onReplyCountChange,
    type,
    contextId,
    onOpenImageViewer,
    currentUserId,
}: Props) {
    const theme = useTheme();
    // Held in a ref rather than read straight from props: call sites pass a fresh
    // arrow every render, so putting it in `loadThread`'s deps rebuilt `loadThread`
    // every render and the load effect below refetched the thread forever.
    const onReplyCountChangeRef = useRef(onReplyCountChange);
    useEffect(() => {
        onReplyCountChangeRef.current = onReplyCountChange;
    });
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [parentMessage, setParentMessage] = useState<Record<
        string,
        unknown
    > | null>(null);
    const [replies, setReplies] = useState<Record<string, unknown>[]>([]);
    const [draft, setDraft] = useState("");
    const [sendState, setSendState] = useState<LoadState>("idle");
    const [sendError, setSendError] = useState<string | null>(null);
    const [composerHeight, setComposerHeight] = useState(40);

    const fetchThread =
        type === "channel" ? fetchChannelThreadMessages : fetchDMThreadMessages;
    const createReply =
        type === "channel" ? createChannelThreadReply : createDMThreadReply;

    const loadThread = useCallback(async () => {
        if (!parentMessageId) return;
        setLoadState("loading");
        try {
            const response = await fetchThread(
                instanceUrl,
                accessToken,
                parentMessageId,
            );
            const nextParent = (response.parentMessage ??
                response.message ??
                null) as Record<string, unknown> | null;
            const nextReplies = (response.replies ??
                response.items ??
                []) as Record<string, unknown>[];
            onReplyCountChangeRef.current?.(nextReplies.length);

            const authorIdOf = (msg: Record<string, unknown>) =>
                (msg.senderId as string | undefined) ??
                (msg.userId as string | undefined);

            const senderIds = new Set<string>();
            if (nextParent) {
                const id = authorIdOf(nextParent);
                if (id) senderIds.add(id);
            }
            for (const r of nextReplies) {
                const id = authorIdOf(r);
                if (id) senderIds.add(id);
            }
            if (senderIds.size > 0) {
                const profileMap = await getProfilesBatch(
                    instanceUrl,
                    accessToken,
                    Array.from(senderIds),
                );
                if (Object.keys(profileMap).length > 0) {
                    const enrich = (
                        msg: Record<string, unknown>,
                    ): Record<string, unknown> => {
                        const profile = profileMap[authorIdOf(msg) ?? ""];
                        if (!profile) return msg;
                        return {
                            ...msg,
                            userName: profile.displayName ?? msg.userName,
                            authorAvatarUrl:
                                profile.avatarUrl ?? msg.authorAvatarUrl,
                        };
                    };
                    setParentMessage(nextParent ? enrich(nextParent) : null);
                    // API order is oldest-first; the list is inverted and expects
                    // newest-first, so it has to be reversed or the newest reply floats
                    // to the top of the thread.
                    const enrichedReplies = nextReplies.map(enrich).reverse();
                    setReplies(enrichedReplies);
                    for (const r of enrichedReplies) {
                        if (r.$id) void markAsThreadReply(r.$id as string);
                    }
                    setLoadState("ready");
                    return;
                }
            }
            setParentMessage(nextParent);
            setReplies([...nextReplies].reverse());
            for (const r of nextReplies) {
                if (r.$id) void markAsThreadReply(r.$id as string);
            }
            setLoadState("ready");
        } catch {
            setLoadState("error");
        }
    }, [parentMessageId, instanceUrl, accessToken, fetchThread]);

    // `loadThread` also changes identity when the session token rotates, which
    // used to run this reset and wipe a reply the user was part-way through
    // typing. Only reset when the thread being shown actually changed; a token
    // refresh just refetches behind the existing transcript.
    const loadedThreadIdRef = useRef<string | null | undefined>(undefined);

    useEffect(() => {
        const isNewThread = loadedThreadIdRef.current !== parentMessageId;
        loadedThreadIdRef.current = parentMessageId;

        if (isNewThread) {
            setLoadState("idle");
            setParentMessage(null);
            setReplies([]);
            setDraft("");
            setSendState("idle");
            setSendError(null);
        }
        void loadThread();
    }, [loadThread, parentMessageId]);

    // Opening a thread is what marks it read. Best-effort: a failure only leaves
    // the thread showing as unread next time.
    useEffect(() => {
        if (loadState !== "ready" || !contextId) return;
        void markThreadRead(
            instanceUrl,
            accessToken,
            type === "channel" ? "channel" : "conversation",
            contextId,
            parentMessageId,
        ).catch(() => undefined);
    }, [accessToken, contextId, instanceUrl, loadState, parentMessageId, type]);

    const sendReply = useCallback(async () => {
        if (!parentMessageId || sendState === "loading") return;
        const text = draft.trim();
        if (!text) return;
        setSendState("loading");
        setSendError(null);
        try {
            await createReply(instanceUrl, accessToken, parentMessageId, {
                text,
            });
            setDraft("");
            setSendState("ready");
            onReplySent?.();
            await loadThread();
        } catch (err) {
            setSendState("error");
            setSendError(
                err instanceof Error ? err.message : "Unable to send reply",
            );
        }
    }, [
        parentMessageId,
        draft,
        sendState,
        instanceUrl,
        accessToken,
        loadThread,
        createReply,
        onReplySent,
    ]);

    /** Shared renderer: the thread API returns full Message objects, so replies
     *  carry everything the parent does. Passing imageUrl/attachments through is
     *  what makes an image post inside a thread look like the same post in the
     *  channel. */
    const renderBubble = useCallback(
        (item: Record<string, unknown>, index: number) => (
            <ChatBubbleMessage
                messageId={(item.$id as string) ?? String(index)}
                authorId={
                    (item.senderId as string) ?? (item.userId as string) ?? ""
                }
                authorName={
                    (item.userName as string) ??
                    (item.displayName as string) ??
                    (item.senderId as string) ??
                    "Unknown"
                }
                authorAvatarUrl={
                    typeof item.authorAvatarUrl === "string"
                        ? item.authorAvatarUrl
                        : null
                }
                authorAvatarFrameUrl={
                    typeof item.avatarFrameUrl === "string"
                        ? item.avatarFrameUrl
                        : undefined
                }
                authorAvatarFrameInsetPercent={
                    typeof item.avatarFrameInsetPercent === "number"
                        ? item.avatarFrameInsetPercent
                        : undefined
                }
                text={(item.text as string) ?? ""}
                createdAt={item.$createdAt as string}
                editedAt={item.editedAt as string | undefined}
                imageUrl={
                    typeof item.imageUrl === "string" ? item.imageUrl : null
                }
                attachments={toArray<FileAttachment>(item.attachments)}
                reactions={toArray<Reaction>(item.reactions)}
                isMine={Boolean(
                    currentUserId &&
                    ((item.senderId as string) ?? (item.userId as string)) ===
                        currentUserId,
                )}
                customEmojis={customEmojis}
                onOpenImageViewer={onOpenImageViewer}
            />
        ),
        [customEmojis, currentUserId, onOpenImageViewer],
    );

    const renderItem = useCallback(
        ({ item, index }: { item: Record<string, unknown>; index: number }) =>
            renderBubble(item, index),
        [renderBubble],
    );

    return (
        <View style={styles.container}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={BottomTabInset + 50}
            >
                {/* Header */}
                <View
                    style={[styles.header, { borderBottomColor: theme.border }]}
                >
                    <ThemedText type="smallBold" style={{ fontSize: 16 }}>
                        Thread &middot; {replies.length}{" "}
                        {replies.length === 1 ? "reply" : "replies"}
                    </ThemedText>
                    <Pressable onPress={onClose} hitSlop={8}>
                        <ThemedText
                            themeColor="mutedForeground"
                            style={{ fontSize: 18 }}
                        >
                            ✕
                        </ThemedText>
                    </Pressable>
                </View>

                {/* Messages */}
                <View style={styles.messageArea}>
                    {loadState === "loading" && replies.length === 0 ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator color={theme.primary} />
                        </View>
                    ) : loadState === "error" ? (
                        <ThemedText
                            themeColor="destructive"
                            style={styles.errorText}
                        >
                            Unable to load thread
                        </ThemedText>
                    ) : null}

                    {/* The parent sits above the replies, pinned in place. It used to be
              the first item of the inverted list, which put it at the bottom
              of the screen — the least important position for the message the
              whole thread is about. */}
                    {parentMessage ? (
                        <View
                            style={[
                                styles.parentBlock,
                                { borderBottomColor: theme.border },
                            ]}
                        >
                            <View style={styles.parentLabel}>
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                >
                                    Parent message
                                </ThemedText>
                            </View>
                            {renderBubble(parentMessage, -1)}
                        </View>
                    ) : null}

                    <FlatList
                        data={replies}
                        inverted
                        extraData={customEmojis}
                        keyExtractor={(item, idx) =>
                            (item.$id as string) ??
                            `${(item.$createdAt as string) ?? ""}-${idx}`
                        }
                        renderItem={renderItem}
                        windowSize={5}
                        maxToRenderPerBatch={10}
                        initialNumToRender={15}
                        removeClippedSubviews
                        contentContainerStyle={styles.messageList}
                        style={styles.flex}
                    />
                </View>

                {/* Composer */}
                <View
                    style={[
                        styles.composer,
                        {
                            borderTopColor: theme.border,
                            backgroundColor: theme.background,
                        },
                    ]}
                >
                    {sendError ? (
                        <ThemedText
                            themeColor="destructive"
                            style={styles.sendError}
                        >
                            {sendError}
                        </ThemedText>
                    ) : null}
                    <View style={styles.composerRow}>
                        <TextInput
                            multiline
                            placeholder="Reply to thread"
                            placeholderTextColor={theme.mutedForeground}
                            value={draft}
                            onChangeText={(t) => setDraft(t)}
                            editable={sendState !== "loading"}
                            onContentSizeChange={(e) =>
                                setComposerHeight(
                                    Math.min(
                                        120,
                                        Math.max(
                                            40,
                                            e.nativeEvent.contentSize.height,
                                        ),
                                    ),
                                )
                            }
                            style={[
                                styles.input,
                                {
                                    borderColor: theme.border,
                                    color: theme.foreground,
                                    height: composerHeight,
                                },
                            ]}
                        />
                        <Pressable
                            accessibilityRole="button"
                            onPress={sendReply}
                            disabled={!draft.trim() || sendState === "loading"}
                            style={({ pressed }) => [
                                styles.sendButton,
                                {
                                    backgroundColor: theme.primary,
                                    opacity: pressed || !draft.trim() ? 0.6 : 1,
                                },
                            ]}
                        >
                            <ThemedText
                                type="smallBold"
                                themeColor="primaryForeground"
                            >
                                {sendState === "loading" ? "…" : "Send"}
                            </ThemedText>
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    messageArea: {
        flex: 1,
    },
    loadingContainer: {
        padding: Spacing.four,
        alignItems: "center",
    },
    errorText: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    parentBlock: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        // Matches messageList, so the parent lines up with the replies below it
        // instead of running to the screen edges.
        paddingHorizontal: Spacing.two,
        paddingTop: Spacing.two,
        paddingBottom: Spacing.one,
    },
    parentLabel: {
        paddingBottom: Spacing.one,
    },
    messageList: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
    },
    composer: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        gap: Spacing.one,
    },
    composerRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: Spacing.one,
    },
    input: {
        flex: 1,
        minHeight: 40,
        maxHeight: 120,
        borderWidth: 1,
        borderRadius: 18,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    sendButton: {
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        alignSelf: "flex-end",
        minWidth: 60,
        alignItems: "center",
    },
    sendError: {
        paddingHorizontal: Spacing.one,
    },
});
