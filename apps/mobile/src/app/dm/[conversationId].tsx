import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    ActivityIndicator,
    AppState,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    ArrowLeft,
    Lock,
    EllipsisVertical,
    Pin,
    User,
} from "lucide-react-native";
import { Avatar } from "@/components/ui/avatar";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import ChatInput, {
    type ComposerAttachmentState,
} from "@/components/chat-input";
import { ChatBubbleMessage } from "@/components/chat-bubble-message";
import EmojiPickerSheet from "@/components/emoji-picker";
import { EmojiRenderer } from "@/components/emoji-renderer";
import { ImageViewer } from "@/components/image-viewer";
import { PollCreationModal } from "@/components/poll-creation-modal";
import { GifStickerPicker } from "@/components/gif-sticker-picker";
import { ThreadPanel } from "@/components/thread-panel";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { statusColor, isOnlineStatus } from "@/components/status-indicator";
import { BottomTabInset, Spacing, withAlpha } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useStatusSubscription } from "@/hooks/use-status-subscription";
import { useRealtimeMessages } from "@/hooks/use-realtime-messages";
import { useTypingIndicator } from "@/hooks/use-typing-indicator";
import { TypingIndicator } from "@/components/typing-indicator";
import {
    fetchConversationPins,
    fetchDirectMessageConversationById,
    fetchDirectMessageMessages,
    pinDirectMessage,
    sendDirectMessage,
    unpinDirectMessage,
    type DirectMessage,
    type DirectMessageConversation,
} from "@/lib/firepit";
import { cacheMessages, getCachedMessages } from "@/lib/cache/MessageCache";
import {
    getKnownThreadReplyIds,
    markAsThreadReply,
} from "@/lib/cache/ThreadCache";
import { toggleReaction } from "@/lib/reactions-client";
import { uploadFile, uploadImage } from "@/lib/firepit/uploads";
import { authHeaders } from "@/lib/firepit/http";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { extractAppwriteConfig } from "@/lib/firepit/bootstrap";
import {
    getAvatarUrl,
    getEmojiUrl,
    getMessageAvatarFileId,
} from "@/lib/avatars";
import { insertDayDividers, type DayRow } from "@/lib/chat-dates";
import { getProfilesBatch } from "@/lib/profile-cache";
import {
    getLastReadAt,
    setLastReadAt,
    countUnread,
} from "@/lib/channel-read-state";
import { buildPollCommand } from "@/lib/mention-utils";
import {
    ENCRYPTED_MESSAGE_PLACEHOLDER,
    decryptMessageTextIfNeeded,
    encryptDmText,
    ensurePublishedDmEncryptionKey,
    isDmEncryptionSupported,
} from "@/lib/firepit/dm-encryption";
import { UserProfileSheet } from "@/components/user-profile-sheet";

type LoadState = "idle" | "loading" | "ready" | "error";

type RouteParams = {
    conversationId?: string;
    messageId?: string;
};

function normalizeParam(value?: string | string[]) {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

function hasId<T extends { $id?: string }>(
    item: T,
): item is T & { $id: string } {
    return typeof item.$id === "string" && item.$id.length > 0;
}

function conversationTitle(conversation: DirectMessageConversation | null) {
    if (!conversation) {
        return "Conversation";
    }

    if (conversation.name?.trim()) {
        return conversation.name.trim();
    }

    if (conversation.isGroup) {
        return `Group chat${conversation.participantCount ? ` · ${conversation.participantCount}` : ""}`;
    }

    return (
        conversation.otherUser?.displayName?.trim() ||
        conversation.otherUser?.userId ||
        "Direct message"
    );
}

type DmUserStatus = { status: string };

function getStatusLabel(
    statuses: Record<string, DmUserStatus>,
    userId: string | null,
): string {
    if (!userId) return "";
    // Single source of truth for status wording, shared with the profile screen
    // and the member list.
    return statusColor(statuses[userId]?.status)?.label ?? "";
}

function getStatusColor(
    statuses: Record<string, DmUserStatus>,
    userId: string | null,
): "mutedForeground" | "successText" {
    if (!userId) return "mutedForeground";
    const s = statuses[userId];
    if (!s || !isOnlineStatus(s.status)) return "mutedForeground";
    if (s.status === "online") return "successText";
    return "mutedForeground";
}

const keyExtractor = (item: DayRow<DirectMessage>, index: number) =>
    item.kind === "divider" ? item.id : (item.item.$id ?? `message-${index}`);

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

// A build-level capability, so it is read once rather than per render.
const DM_ENCRYPTION_SUPPORTED = isDmEncryptionSupported();

// `reactions` may arrive as a JSON string from the realtime payload, same as
// the load path coerces it. Merge it back into shape so a live reaction tick
// renders instead of crashing the bubble.
function normalizeRealtimeMessage(
    payload: Record<string, unknown>,
): DirectMessage {
    const raw = payload.reactions;
    let reactions: DirectMessage["reactions"];
    if (typeof raw === "string") {
        try {
            reactions = JSON.parse(raw) as DirectMessage["reactions"];
        } catch {
            reactions = undefined;
        }
    } else if (Array.isArray(raw)) {
        reactions = raw as DirectMessage["reactions"];
    }
    return { ...(payload as DirectMessage), reactions };
}

export default function DirectMessageScreen() {
    const theme = useTheme();
    const { conversationId, messageId } = useLocalSearchParams<RouteParams>();
    const normalizedConversationId = normalizeParam(conversationId);
    const normalizedMessageId = normalizeParam(messageId);
    const {
        instanceUrl,
        accessToken,
        currentUser,
        state,
        instance,
        customEmojis,
        appwriteConfig,
    } = useFirepitBootstrap();
    const signedIn = Boolean(
        state === "ready" && instanceUrl && accessToken && currentUser,
    );

    const [conversationLoadState, setConversationLoadState] =
        useState<LoadState>("idle");
    const [conversationError, setConversationError] = useState<string | null>(
        null,
    );
    const [conversation, setConversation] =
        useState<DirectMessageConversation | null>(null);
    const [messagesLoadState, setMessagesLoadState] =
        useState<LoadState>("idle");
    const [messagesError, setMessagesError] = useState<string | null>(null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [sendState, setSendState] = useState<LoadState>("idle");
    const [sendError, setSendError] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
    const [editingMessage, setEditingMessage] = useState<DirectMessage | null>(
        null,
    );
    const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
    const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(
        null,
    );
    const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
    // Stable identity: ChatBubbleMessage is memoized and compares this prop, so a
    // fresh arrow on every render would defeat the memo on every row.
    const openImageViewer = useCallback(
        (url: string) => setViewerImageUrl(url),
        [],
    );
    const [composerAttachments, setComposerAttachments] =
        useState<ComposerAttachmentState>({ image: null, files: [] });
    const composerAttachmentsRef = useRef(composerAttachments);
    useEffect(() => {
        composerAttachmentsRef.current = composerAttachments;
    }, [composerAttachments]);
    const [pinnedMessages, setPinnedMessages] = useState<DirectMessage[]>([]);
    const [showPinnedPanel, setShowPinnedPanel] = useState(false);
    const [showConversationMenu, setShowConversationMenu] = useState(false);
    const [pinsLoading, setPinsLoading] = useState(false);
    const [activeThreadMessageId, setActiveThreadMessageId] = useState<
        string | null
    >(null);
    const [pollModalVisible, setPollModalVisible] = useState(false);
    const [gifStickerPickerVisible, setGifStickerPickerVisible] =
        useState(false);
    const [peerPublicKeyBase64, setPeerPublicKeyBase64] = useState<
        string | null
    >(null);
    const [dmEncryptionEnabled, setDmEncryptionEnabled] = useState(false);
    const listRef = useRef<FlatList<DayRow<DirectMessage>>>(null);
    const inputRef = useRef<TextInput>(null);
    const cancelledRef = useRef(false);
    const sendingRef = useRef(false);
    const [lastReadAt, setLastReadAtState] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const markDmReadRef = useRef<() => Promise<void>>(undefined);
    const [profileSheetUser, setProfileSheetUser] = useState<{
        userId: string;
        displayName?: string;
        avatarUrl?: string;
    } | null>(null);

    const currentUserId = currentUser?.$id ?? currentUser?.userId ?? null;
    const otherUserId = useMemo(() => {
        if (!conversation || conversation.isGroup) {
            return null;
        }

        return (
            conversation.participants?.find((id) => id !== currentUserId) ??
            null
        );
    }, [conversation, currentUserId]);

    // Status/presence subscription for DM participants
    const participantIds = useMemo(() => {
        if (!conversation) return [];
        return conversation.isGroup
            ? (conversation.participants ?? [])
            : otherUserId
              ? [otherUserId]
              : [];
    }, [conversation, otherUserId]);
    const { statuses: participantStatuses } = useStatusSubscription(
        instanceUrl ?? null,
        accessToken,
        participantIds,
    );

    // Typing indicators
    const { typingUsers: typingUsersList, handleTypingChange } =
        useTypingIndicator(
            instanceUrl ?? null,
            accessToken,
            currentUserId,
            normalizedConversationId,
            currentUser?.displayName ?? currentUser?.userName ?? null,
            appwriteConfig?.project,
            appwriteConfig?.endpoint ?? null,
        );

    const title = conversationTitle(conversation);
    const messageIndex = useMemo(() => {
        if (!normalizedMessageId) {
            return -1;
        }

        return messages.findIndex((item) => item.$id === normalizedMessageId);
    }, [messages, normalizedMessageId]);

    const loadConversation = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedConversationId) {
            return;
        }

        setConversationLoadState("loading");
        setConversationError(null);

        try {
            const response = await fetchDirectMessageConversationById(
                instanceUrl,
                accessToken,
                normalizedConversationId,
            );
            const nextConversation = response.conversation ?? null;
            if (cancelledRef.current) return;
            setConversation(nextConversation);
            setConversationLoadState("ready");
            if (!nextConversation) {
                setConversationError("Conversation not found");
            }
        } catch (loadError) {
            if (cancelledRef.current) return;
            setConversationLoadState("error");
            setConversationError(
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load conversation",
            );
        }
    }, [accessToken, instanceUrl, normalizedConversationId]);

    const loadMessages = useCallback(
        async (isRefresh = false) => {
            if (!instanceUrl || !accessToken || !normalizedConversationId) {
                return;
            }

            setMessagesLoadState("loading");
            setMessagesError(null);

            // Show cached messages instantly on first load only — skip on refreshes
            // to avoid flashing stale data before fresh messages arrive.
            if (!isRefresh) {
                const cached = await getCachedMessages(
                    normalizedConversationId,
                );
                if (cancelledRef.current) return;
                // Encrypted messages are cached *before* decryption — deliberately, so
                // plaintext E2EE content is never written to disk — which means they come
                // back with empty text. Rendering them fills the conversation with blank
                // bubbles until the fetch lands, so an encrypted cache is not worth
                // showing at all.
                if (cached.length > 0 && !cached.some((m) => m.isEncrypted)) {
                    const knownThreadReplyIds = await getKnownThreadReplyIds();
                    const filtered = cached.filter((m) => {
                        if (m.threadId) return false;
                        if (m.$id && knownThreadReplyIds.has(m.$id))
                            return false;
                        return true;
                    });
                    setMessages(filtered);
                }
            }

            try {
                const response = await fetchDirectMessageMessages(
                    instanceUrl,
                    accessToken,
                    normalizedConversationId,
                    10,
                );
                if (cancelledRef.current) return;

                const peerKey = response.dmEncryptionPeerPublicKey;
                if (peerKey) {
                    setPeerPublicKeyBase64(peerKey);
                }
                const isMutualEnabled = Boolean(
                    response.dmEncryptionMutualEnabled,
                );
                setDmEncryptionEnabled(isMutualEnabled);

                const appwriteCfg = extractAppwriteConfig(instance ?? {});

                const processMessages = async (
                    msgs: DirectMessage[],
                    peerPublicKey?: string,
                ) => {
                    const raw: DirectMessage[] = msgs.map((msg) => {
                        const avatarFileId = getMessageAvatarFileId(msg);
                        const avatarUrl = getAvatarUrl(
                            avatarFileId,
                            appwriteCfg,
                        );
                        if (typeof msg.reactions === "string") {
                            try {
                                msg.reactions = JSON.parse(msg.reactions);
                            } catch {
                                msg.reactions = [];
                            }
                        }
                        return { ...msg, authorAvatarUrl: avatarUrl };
                    });

                    const senderIds = new Set<string>();
                    for (const msg of raw) {
                        if (msg.senderId) senderIds.add(msg.senderId);
                    }
                    if (senderIds.size > 0) {
                        const profileMap = await getProfilesBatch(
                            instanceUrl,
                            accessToken,
                            Array.from(senderIds),
                        );
                        for (const msg of raw) {
                            if (msg.senderId && profileMap[msg.senderId]) {
                                msg.senderDisplayName =
                                    profileMap[msg.senderId].displayName;
                                if (profileMap[msg.senderId].avatarUrl) {
                                    msg.authorAvatarUrl =
                                        profileMap[msg.senderId].avatarUrl;
                                }
                                if (profileMap[msg.senderId].avatarFrameUrl) {
                                    msg.avatarFrameUrl =
                                        profileMap[msg.senderId].avatarFrameUrl;
                                }
                                if (
                                    typeof profileMap[msg.senderId]
                                        .avatarFrameInsetPercent === "number"
                                ) {
                                    msg.avatarFrameInsetPercent =
                                        profileMap[
                                            msg.senderId
                                        ].avatarFrameInsetPercent;
                                }
                            }
                        }
                    }

                    let display: DirectMessage[] = raw;
                    if (
                        currentUserId &&
                        (peerPublicKey || raw.some((m) => m.isEncrypted))
                    ) {
                        const decrypted = await Promise.all(
                            raw.map((msg) =>
                                decryptMessageTextIfNeeded({
                                    message: msg,
                                    peerPublicKeyBase64: peerPublicKey,
                                    userId: currentUserId,
                                    conversationId: normalizedConversationId,
                                }),
                            ),
                        );
                        display = raw.map((msg, i) => ({
                            ...msg,
                            text: decrypted[i].text,
                        }));
                    }

                    const knownThreadReplyIds = await getKnownThreadReplyIds();
                    const filtered: DirectMessage[] = display.filter((m) => {
                        if (!hasId(m)) return false;
                        if (m.threadId) {
                            void markAsThreadReply(m.$id);
                            return false;
                        }
                        if (knownThreadReplyIds.has(m.$id)) return false;
                        return true;
                    });

                    return { enriched: raw, filtered };
                };

                const { enriched: initialEnriched, filtered: initialFiltered } =
                    await processMessages(response.items ?? [], peerKey);

                // Batch all fetches before updating state to avoid flicker
                let allEnriched = initialEnriched;
                let allFiltered = initialFiltered;

                const lastMsg = initialEnriched[initialEnriched.length - 1];
                if (lastMsg?.$id && (response.items ?? []).length >= 10) {
                    const remainingRes = await fetchDirectMessageMessages(
                        instanceUrl,
                        accessToken,
                        normalizedConversationId,
                        100,
                        lastMsg.$id as string,
                    );
                    if (cancelledRef.current) return;

                    const {
                        enriched: remainingEnriched,
                        filtered: remainingFiltered,
                    } = await processMessages(
                        remainingRes.items ?? [],
                        peerKey,
                    );
                    allEnriched = [...allEnriched, ...remainingEnriched];
                    allFiltered = [...allFiltered, ...remainingFiltered];
                }

                setMessages(allFiltered);
                setMessagesLoadState("ready");
                void cacheMessages(
                    normalizedConversationId,
                    allEnriched.filter(hasId),
                );
            } catch (loadError) {
                if (cancelledRef.current) return;
                setMessagesLoadState("error");
                setMessagesError(
                    loadError instanceof Error
                        ? loadError.message
                        : "Unable to load messages",
                );
            }
        },
        [
            accessToken,
            currentUserId,
            instance,
            instanceUrl,
            normalizedConversationId,
        ],
    );

    const pinsSeqRef = useRef(0);

    const fetchPins = useCallback(async () => {
        if (!instanceUrl || !accessToken || !normalizedConversationId) return;
        const seq = ++pinsSeqRef.current;
        setPinsLoading(true);
        try {
            const res = await fetchConversationPins(
                instanceUrl,
                accessToken,
                normalizedConversationId,
            );
            if (seq !== pinsSeqRef.current) return;
            const msgs = res.pins ?? [];
            // Enrich with sender display names
            const senderIds = new Set<string>();
            for (const m of msgs) {
                if (m.senderId) senderIds.add(m.senderId);
            }
            if (senderIds.size > 0) {
                const profileMap = await getProfilesBatch(
                    instanceUrl,
                    accessToken,
                    Array.from(senderIds),
                );
                for (const m of msgs) {
                    if (m.senderId && profileMap[m.senderId]) {
                        m.senderDisplayName =
                            profileMap[m.senderId].displayName;
                    }
                }
            }
            // Encrypted rows are stored with an empty `text`, so a pinned E2EE
            // message would render as a blank line in the pin list.
            let display = msgs;
            if (currentUserId && msgs.some((m) => m.isEncrypted)) {
                display = await Promise.all(
                    msgs.map((m) =>
                        decryptMessageTextIfNeeded({
                            message: m,
                            peerPublicKeyBase64,
                            userId: currentUserId,
                            conversationId: normalizedConversationId,
                        }),
                    ),
                );
            }
            if (seq !== pinsSeqRef.current) return;
            setPinnedMessages(display);
        } catch (e) {
            console.error("[dm:fetchPins] Failed to fetch pinned messages", e);
        }
        if (seq === pinsSeqRef.current) setPinsLoading(false);
    }, [
        instanceUrl,
        accessToken,
        normalizedConversationId,
        currentUserId,
        peerPublicKeyBase64,
    ]);

    useEffect(() => {
        if (showPinnedPanel) void fetchPins();
    }, [showPinnedPanel, fetchPins]);

    useEffect(() => {
        return () => {
            cancelledRef.current = true;
        };
    }, []);

    useEffect(() => {
        void loadConversation();
    }, [loadConversation]);

    useRetryOnReconnect(conversationLoadState === "error", loadConversation);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    useRetryOnReconnect(
        messagesLoadState === "error",
        () => void loadMessages(),
    );

    // Jump-to-unread: load last-read timestamp, calculate unread, mark as read
    useEffect(() => {
        setLastReadAtState(null);
        setUnreadCount(0);
    }, [normalizedConversationId]);

    useEffect(() => {
        if (!normalizedConversationId) return;
        let cancelled = false;
        getLastReadAt(normalizedConversationId).then((ts) => {
            if (!cancelled) setLastReadAtState(ts);
        });
        return () => {
            cancelled = true;
        };
    }, [normalizedConversationId]);

    useEffect(() => {
        if (messagesLoadState !== "ready" || !messages.length) return;
        setUnreadCount(countUnread(messages, lastReadAt));
    }, [messages, lastReadAt, messagesLoadState]);

    const markDmRead = useCallback(async () => {
        if (!normalizedConversationId || !messages.length) return;
        const newest = messages[0]?.$createdAt;
        if (!newest) return;
        await setLastReadAt(normalizedConversationId, newest);
        setLastReadAtState(newest);
        setUnreadCount(0);
    }, [normalizedConversationId, messages]);

    // Messages have variable height, so getItemLayout is impossible here; without
    // it VirtualizedList throws when asked to scroll to an index it has not
    // measured. Jump-to-message is reachable from the inbox and from search.
    const handleScrollToIndexFailed = useCallback(
        (info: { averageItemLength: number; index: number }) => {
            listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
            });
        },
        [],
    );

    useEffect(() => {
        markDmReadRef.current = markDmRead;
    });

    useEffect(() => {
        if (messageIndex >= 0 && listRef.current) {
            requestAnimationFrame(() => {
                listRef.current?.scrollToIndex({
                    index: messageIndex,
                    animated: false,
                    viewPosition: 0.5,
                });
            });
        }
    }, [messageIndex]);

    // Realtime message subscription
    useRealtimeMessages({
        instance,
        accessToken,
        collectionId: "direct_messages",
        filterField: "conversationId",
        filterValue: normalizedConversationId,
        onMessageEvent: (payload, events) => {
            void (async () => {
                const raw = normalizeRealtimeMessage(payload);
                const id = raw.$id;
                if (!id) return;

                // Encrypted rows arrive with `text` cleared by the server. Decrypt
                // before touching state, otherwise a new message has no content to
                // detect and is dropped, and an update overwrites the bubble with "".
                const incoming =
                    raw.isEncrypted && currentUserId
                        ? await decryptMessageTextIfNeeded({
                              message: raw,
                              peerPublicKeyBase64,
                              userId: currentUserId,
                              conversationId: normalizedConversationId,
                          })
                        : raw;

                setMessages((prev) => {
                    const existing = prev.findIndex((m) => m.$id === id);
                    const next = prev.slice();
                    // Merge rather than replace so the enrichment added at load time
                    // (avatar, sender name) survives an edit or reaction.
                    if (existing !== -1) {
                        const merged = { ...next[existing], ...incoming };
                        // A failed decrypt yields the placeholder; don't replace text that
                        // was already shown successfully.
                        if (
                            incoming.isEncrypted &&
                            (!incoming.text ||
                                incoming.text === ENCRYPTED_MESSAGE_PLACEHOLDER)
                        ) {
                            merged.text = next[existing].text;
                        }
                        next[existing] = merged;
                        return next;
                    }
                    // Only a create is a new row. An update or reaction for a message
                    // outside the loaded window has nothing to patch, and inserting it
                    // would duplicate history at the top of the list.
                    if (!events.some((event) => event.endsWith(".create")))
                        return prev;

                    // Newest-first, matching loadMessages.
                    next.unshift({
                        ...incoming,
                        authorAvatarUrl: getAvatarUrl(
                            getMessageAvatarFileId(incoming),
                            extractAppwriteConfig(instance ?? {}),
                        ),
                    });
                    return next;
                });
            })();
        },
    });

    // Fallback: refresh messages when app returns to foreground
    useEffect(() => {
        if (!normalizedConversationId) return;

        const subscription = AppState.addEventListener(
            "change",
            (nextAppState) => {
                if (nextAppState === "active") void loadMessages(true);
            },
        );

        return () => subscription.remove();
    }, [normalizedConversationId, loadMessages]);

    // Same reason as the channel view: the strict regex truncates a mention to
    // `[a-zA-Z0-9_]+`, so "@August's test account" would resolve to "August".
    const knownDisplayNames = useMemo(() => {
        const names = messages
            .map((m) => m.senderDisplayName)
            .filter((n): n is string => Boolean(n));
        return [...new Set(names)];
    }, [messages]);

    const sendMessage = useCallback(async () => {
        if (
            !instanceUrl ||
            !accessToken ||
            !normalizedConversationId ||
            sendingRef.current
        ) {
            return;
        }

        const text = draft.trim();
        const ca = composerAttachmentsRef.current;
        const hasImage = Boolean(ca.image);
        const hasFiles = ca.files.length > 0;
        if (!text && !hasImage && !hasFiles) {
            return;
        }
        sendingRef.current = true;

        // Never fall through to a plaintext send when this conversation is supposed
        // to be encrypted: the server rejects it anyway, and the raw 400 is a worse
        // explanation than this.
        if (
            text &&
            dmEncryptionEnabled &&
            (!peerPublicKeyBase64 || !currentUserId)
        ) {
            sendingRef.current = false;
            setSendState("error");
            setSendError(
                "Encryption is enabled for this conversation, but the recipient's encryption key is unavailable. The message was not sent.",
            );
            return;
        }

        // Render the message right away; uploads + encryption can take a moment and
        // the user should not be staring at a cleared composer wondering if it sent.
        // An edit rewrites the existing row, so it gets no placeholder — inserting
        // one would show the new text twice until the reload reconciles.
        const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticMessage: DirectMessage = {
            $id: optimisticId,
            senderId: currentUserId ?? undefined,
            senderDisplayName:
                currentUser?.displayName ?? currentUser?.userName ?? undefined,
            text: text || undefined,
            conversationId: normalizedConversationId,
            imageUrl: ca.image?.uri ?? null,
            attachments: ca.files.map((f) => ({
                fileName: f.name,
                fileSize: f.size ?? undefined,
                fileType: f.mimeType ?? undefined,
                fileUrl: f.remoteAttachment?.fileUrl ?? f.uri,
            })),
            replyToId: replyingTo?.$id ?? null,
            $createdAt: new Date().toISOString(),
            local: true,
        };
        if (!editingMessage) {
            // Newest-first, and the list is `inverted`, so the newest row goes at the
            // front to sit at the visual bottom.
            setMessages((prev) =>
                prev.some((m) => m.$id === optimisticId)
                    ? prev
                    : [optimisticMessage, ...prev],
            );
        }

        // Handle edit mode
        if (editingMessage) {
            setSendState("loading");
            setSendError(null);
            try {
                const res = await fetch(
                    `${instanceUrl}/api/direct-messages?id=${encodeURIComponent(editingMessage.$id ?? "")}`,
                    {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json",
                            ...authHeaders(accessToken),
                        },
                        body: JSON.stringify({ text }),
                    },
                );
                if (!res.ok) throw new Error(`Edit failed (${res.status})`);
                if (cancelledRef.current) return;
                setEditingMessage(null);
                setDraft("");
                setSendState("ready");
                await loadMessages(true);
            } catch (editError) {
                setSendState("error");
                setSendError(
                    editError instanceof Error
                        ? editError.message
                        : "Unable to edit message",
                );
            } finally {
                sendingRef.current = false;
            }
            return;
        }

        setSendState("loading");
        setSendError(null);

        try {
            const localFiles = ca.files.filter((f) => !f.remoteAttachment);
            const remoteAttachments = ca.files
                .filter((f) => f.remoteAttachment)
                .map((f) => f.remoteAttachment!);

            const [imageUpload, fileUploads] = await Promise.all([
                ca.image
                    ? uploadImage(instanceUrl, accessToken, ca.image)
                    : Promise.resolve(null),
                Promise.all(
                    localFiles.map((f) =>
                        uploadFile(instanceUrl, accessToken, f),
                    ),
                ),
            ]);

            let encryptedPayload:
                | {
                      encryptedText: string;
                      encryptionNonce: string;
                      encryptionSenderPublicKey: string;
                      encryptionVersion: string;
                  }
                | undefined;
            let messageText = text || undefined;

            if (
                text &&
                peerPublicKeyBase64 &&
                currentUserId &&
                dmEncryptionEnabled
            ) {
                const keyPair = await ensurePublishedDmEncryptionKey(
                    instanceUrl,
                    accessToken,
                    currentUserId,
                );
                encryptedPayload = await encryptDmText({
                    recipientPublicKeyBase64: peerPublicKeyBase64,
                    senderKeyPair: keyPair,
                    text,
                    // Must match the web client, which binds the conversation id into
                    // the AEAD additional data.
                    context: normalizedConversationId,
                });
                messageText = undefined;
            }

            const sendResult = await sendDirectMessage(
                instanceUrl,
                accessToken,
                {
                    conversationId: normalizedConversationId,
                    senderId: currentUserId ?? undefined,
                    receiverId: otherUserId ?? undefined,
                    text: messageText,
                    isEncrypted: encryptedPayload ? true : undefined,
                    encryptedText: encryptedPayload?.encryptedText,
                    encryptionNonce: encryptedPayload?.encryptionNonce,
                    encryptionVersion: encryptedPayload?.encryptionVersion,
                    encryptionSenderPublicKey:
                        encryptedPayload?.encryptionSenderPublicKey,
                    imageFileId: imageUpload?.fileId,
                    imageUrl: imageUpload?.fileUrl,
                    attachments: [...(fileUploads ?? []), ...remoteAttachments],
                    replyToId: replyingTo?.$id,
                },
            );
            if (cancelledRef.current) return;
            setDraft("");
            setReplyingTo(null);
            setComposerAttachments({ image: null, files: [] });
            setSendState("ready");

            // Replace the placeholder with the real row (attachments, mention ids,
            // encryption flags) before the reload reconciles anything else.
            const sentMsg = sendResult?.message;
            setMessages((prev) => {
                if (sentMsg?.$id) {
                    return prev.map((m) =>
                        m.$id === optimisticId
                            ? {
                                  ...sentMsg,
                                  // Encrypted rows come back with an empty
                                  // `text`, so keep the plaintext already
                                  // rendered until the reload decrypts it.
                                  text: sentMsg.text || text,
                                  local: undefined,
                              }
                            : m,
                    );
                }
                return prev.filter((m) => m.$id !== optimisticId);
            });

            await loadMessages(true);
        } catch (sendError) {
            setMessages((prev) => prev.filter((m) => m.$id !== optimisticId));
            setSendState("error");
            setSendError(
                sendError instanceof Error
                    ? sendError.message
                    : "Unable to send message",
            );
        } finally {
            sendingRef.current = false;
        }
    }, [
        accessToken,
        currentUser?.displayName,
        currentUser?.userName,
        currentUserId,
        dmEncryptionEnabled,
        draft,
        editingMessage,
        instanceUrl,
        loadMessages,
        normalizedConversationId,
        otherUserId,
        peerPublicKeyBase64,
        replyingTo,
    ]);

    const handlePollSubmit = useCallback(
        (question: string, options: string[]) => {
            const built = buildPollCommand(question, options);
            if (!built.ok) {
                setSendError(built.error);
                return;
            }
            const command = built.command;
            (async () => {
                if (!instanceUrl || !accessToken || !normalizedConversationId)
                    return;
                try {
                    await sendDirectMessage(instanceUrl, accessToken, {
                        conversationId: normalizedConversationId,
                        senderId: currentUserId ?? undefined,
                        receiverId: otherUserId ?? undefined,
                        text: command,
                    });
                    setDraft("");
                    await loadMessages(true);
                } catch (e) {
                    setSendError(
                        e instanceof Error ? e.message : "Failed to send poll",
                    );
                }
            })();
        },
        [
            instanceUrl,
            accessToken,
            normalizedConversationId,
            currentUserId,
            otherUserId,
            loadMessages,
        ],
    );

    // Build a map of messages for reply lookup
    const messagesById = useMemo(() => {
        const map = new Map<string, DirectMessage>();
        for (const m of messages) {
            if (m.$id) map.set(m.$id, m);
        }
        return map;
    }, [messages]);

    const mappedEmojis = useMemo(
        () =>
            customEmojis?.map((ce) => ({
                ...ce,
                url: ce.url.startsWith("http")
                    ? ce.url
                    : `${instanceUrl}${ce.url}`,
            })) ?? [],
        [customEmojis, instanceUrl],
    );

    /**
     * Message list interleaved with day dividers. `messages` is newest-first
     * because the FlatList is inverted — see insertDayDividers.
     */
    const messageRows = useMemo(
        () => insertDayDividers(messages, (m, i) => `m:${m.$id ?? i}`),
        [messages],
    );

    const renderItem = useCallback(
        ({ item: row }: { item: DayRow<DirectMessage> }) => {
            if (row.kind === "divider") {
                return (
                    <View style={styles.dayDivider}>
                        <View
                            style={[
                                styles.dayDividerRule,
                                { backgroundColor: theme.border },
                            ]}
                        />
                        <ThemedText
                            type="code"
                            themeColor="mutedForeground"
                            style={styles.dayDividerLabel}
                        >
                            {row.label}
                        </ThemedText>
                        <View
                            style={[
                                styles.dayDividerRule,
                                { backgroundColor: theme.border },
                            ]}
                        />
                    </View>
                );
            }
            const item = row.item;
            const isMine = Boolean(
                currentUserId &&
                item.senderId &&
                item.senderId === currentUserId,
            );
            const senderLabel =
                item.senderDisplayName ?? item.senderId ?? "Unknown sender";
            const avatarUrl =
                typeof item.authorAvatarUrl === "string"
                    ? item.authorAvatarUrl
                    : null;
            const reactions = Array.isArray(item.reactions)
                ? (
                      item.reactions as {
                          emoji: string;
                          userIds?: string[];
                          count: number;
                          reactedByMe?: boolean;
                      }[]
                  ).map((r) => ({
                      emoji: r.emoji,
                      count: r.count ?? r.userIds?.length ?? 0,
                      reactedByMe:
                          r.userIds?.includes(currentUserId ?? "") ?? false,
                  }))
                : [];
            const imgUrl =
                typeof item.imageUrl === "string" ? item.imageUrl : null;
            const replyToId = item.replyToId;
            const replyToMsg = replyToId ? messagesById.get(replyToId) : null;

            return (
                <ChatBubbleMessage
                    messageId={item.$id ?? ""}
                    authorId={item.senderId ?? ""}
                    authorName={senderLabel}
                    authorAvatarUrl={avatarUrl}
                    authorAvatarFrameUrl={item.avatarFrameUrl}
                    authorAvatarFrameInsetPercent={item.avatarFrameInsetPercent}
                    authorPronouns={item.pronouns}
                    text={item.text ?? ""}
                    createdAt={item.$createdAt}
                    editedAt={item.editedAt}
                    removedAt={item.removedAt}
                    removedBy={item.removedBy}
                    isPinned={item.isPinned === true}
                    isMine={isMine}
                    currentUserId={currentUserId ?? undefined}
                    canManageMessages={true}
                    authToken={accessToken}
                    imageUrl={imgUrl}
                    replyTo={
                        replyToMsg
                            ? {
                                  authorLabel:
                                      replyToMsg.senderDisplayName ??
                                      replyToMsg.senderId ??
                                      "User",
                                  text: replyToMsg.text ?? "",
                              }
                            : null
                    }
                    reactions={reactions}
                    attachments={item.attachments}
                    mentions={item.mentions}
                    knownNames={knownDisplayNames}
                    poll={item.poll ?? null}
                    customEmojis={mappedEmojis}
                    onToggleReaction={async (emoji, isAdding) => {
                        if (!instanceUrl || !accessToken) return;
                        try {
                            const msgId = item.$id;
                            if (!msgId) return;
                            await toggleReaction(
                                String(msgId),
                                emoji,
                                isAdding,
                                true,
                                instanceUrl,
                                accessToken,
                            );
                            setMessages((prev) =>
                                prev.map((m) => {
                                    if (
                                        m.$id !== msgId ||
                                        !Array.isArray(m.reactions)
                                    )
                                        return m;
                                    const existing = m.reactions.find(
                                        (r) => r.emoji === emoji,
                                    );
                                    if (isAdding) {
                                        if (existing) {
                                            return {
                                                ...m,
                                                reactions: m.reactions.map(
                                                    (r) =>
                                                        r.emoji === emoji
                                                            ? {
                                                                  ...r,
                                                                  count:
                                                                      r.count +
                                                                      1,
                                                                  reactedByMe: true,
                                                              }
                                                            : r,
                                                ),
                                            };
                                        }
                                        return {
                                            ...m,
                                            reactions: [
                                                ...m.reactions,
                                                {
                                                    emoji,
                                                    userIds: [
                                                        currentUserId ?? "",
                                                    ],
                                                    count: 1,
                                                    reactedByMe: true,
                                                },
                                            ],
                                        };
                                    }
                                    if (!existing) return m;
                                    const updated = m.reactions
                                        .map((r) =>
                                            r.emoji === emoji
                                                ? {
                                                      ...r,
                                                      count: Math.max(
                                                          0,
                                                          r.count - 1,
                                                      ),
                                                      reactedByMe: false,
                                                  }
                                                : r,
                                        )
                                        .filter((r) => r.count > 0);
                                    return { ...m, reactions: updated };
                                }),
                            );
                        } catch {
                            // ignore
                        }
                    }}
                    onTogglePin={async () => {
                        if (!instanceUrl || !accessToken) return;
                        try {
                            const msgId = item.$id;
                            if (!msgId) return;
                            if (item.isPinned) {
                                await unpinDirectMessage(
                                    instanceUrl,
                                    accessToken,
                                    msgId,
                                );
                            } else {
                                await pinDirectMessage(
                                    instanceUrl,
                                    accessToken,
                                    msgId,
                                );
                            }
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.$id === msgId
                                        ? { ...m, isPinned: !m.isPinned }
                                        : m,
                                ),
                            );
                        } catch (e) {
                            console.error(
                                "[dm:togglePin] Failed to pin/unpin message",
                                e,
                            );
                        }
                    }}
                    onOpenImageViewer={openImageViewer}
                    onOpenProfile={() => {
                        if (item.senderId && item.senderId !== currentUserId) {
                            setProfileSheetUser({
                                userId: item.senderId,
                                displayName:
                                    senderLabel !== item.senderId
                                        ? senderLabel
                                        : undefined,
                                avatarUrl: avatarUrl ?? undefined,
                            });
                        }
                    }}
                    onShowEmojiPicker={() => {
                        setEmojiPickerMsgId(item.$id ?? null);
                        setEmojiPickerVisible(true);
                    }}
                    onStartReply={() => {
                        setReplyingTo(item);
                        setEditingMessage(null);
                    }}
                    onStartEdit={
                        item.isEncrypted
                            ? undefined
                            : () => {
                                  setEditingMessage(item);
                                  setReplyingTo(null);
                                  setDraft(item.text ?? "");
                              }
                    }
                    onDelete={async () => {
                        try {
                            const msgId = item.$id;
                            if (!msgId || !instanceUrl || !accessToken) return;
                            const res = await fetch(
                                `${instanceUrl}/api/direct-messages?id=${encodeURIComponent(msgId)}`,
                                {
                                    method: "DELETE",
                                    headers: authHeaders(accessToken),
                                },
                            );
                            if (!res.ok)
                                throw new Error(
                                    `Delete failed (${res.status})`,
                                );
                            setMessages((prev) =>
                                prev.filter((m) => m.$id !== msgId),
                            );
                        } catch (e) {
                            console.error(
                                "[dm:deleteMessage] Failed to delete message",
                                e,
                            );
                        }
                    }}
                    onOpenThread={
                        item.isEncrypted
                            ? undefined
                            : () => {
                                  const msgId = item.$id;
                                  if (!msgId || !instanceUrl || !accessToken)
                                      return;
                                  setActiveThreadMessageId(msgId);
                              }
                    }
                    threadReplyCount={item.threadMessageCount ?? null}
                />
            );
        },
        [
            theme.border,
            knownDisplayNames,
            openImageViewer,
            currentUserId,
            mappedEmojis,
            messagesById,
            instanceUrl,
            accessToken,
            router,
            setMessages,
            setEmojiPickerMsgId,
            setEmojiPickerVisible,
            setReplyingTo,
            setEditingMessage,
            setDraft,
            setActiveThreadMessageId,
            setProfileSheetUser,
        ],
    );

    // Composer emoji shape. Was built inline in the JSX, so every parent render
    // produced a new array, which invalidated ChatInput's emojiItems memo and
    // re-ran a scan over the whole standard-emoji table.
    const composerEmojis = useMemo(
        () =>
            mappedEmojis.map((ce) => ({
                shortcode: ce.name,
                customUrl: ce.url,
            })),
        [mappedEmojis],
    );

    return (
        <AuthRouteGuard>
            <KeyboardAvoidingView
                style={[styles.root, { backgroundColor: theme.background }]}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={
                    Platform.OS === "ios" ? BottomTabInset + 50 : 0
                }
            >
                {/* Backdrop decorations - behind everything */}
                <View
                    pointerEvents="none"
                    style={[
                        styles.backdropOrbTop,
                        { backgroundColor: "rgba(217, 121, 43, 0.08)" },
                    ]}
                />
                <View
                    pointerEvents="none"
                    style={[
                        styles.backdropOrbBottom,
                        { backgroundColor: "rgba(78, 138, 134, 0.06)" },
                    ]}
                />

                <SafeAreaView
                    style={styles.safeArea}
                    edges={["top", "left", "right"]}
                >
                    {/* Thin header bar */}
                    <View
                        style={[
                            styles.header,
                            { borderBottomColor: theme.border },
                        ]}
                    >
                        <View style={styles.headerLeft}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => router.back()}
                                style={styles.backButton}
                            >
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: Spacing.one,
                                    }}
                                >
                                    <ArrowLeft
                                        size={18}
                                        color={theme.foreground}
                                    />
                                    <ThemedText type="smallBold">
                                        Back
                                    </ThemedText>
                                </View>
                            </Pressable>
                        </View>
                        <View style={styles.headerCenter}>
                            <View style={styles.dmTitleRow}>
                                <Avatar
                                    uri={conversation?.otherUser?.avatarUrl}
                                    size={24}
                                    initials={
                                        conversation?.otherUser?.displayName
                                    }
                                />
                                <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                                    <ThemedText
                                        type="smallBold"
                                        numberOfLines={1}
                                        style={styles.dmTitle}
                                    >
                                        {title}
                                    </ThemedText>
                                    {conversation?.isGroup ? (
                                        <ThemedText
                                            type="code"
                                            themeColor="mutedForeground"
                                            numberOfLines={1}
                                        >
                                            {conversation.participantCount ??
                                                conversation.participants
                                                    ?.length ??
                                                0}{" "}
                                            members
                                        </ThemedText>
                                    ) : conversation?.otherUser?.userId ? (
                                        typingUsersList.length > 0 ? (
                                            <TypingIndicator
                                                names={typingUsersList.map(
                                                    (u) =>
                                                        u.userName ?? u.userId,
                                                )}
                                            />
                                        ) : (
                                            <ThemedText
                                                type="code"
                                                themeColor={getStatusColor(
                                                    participantStatuses,
                                                    otherUserId,
                                                )}
                                                numberOfLines={1}
                                            >
                                                {getStatusLabel(
                                                    participantStatuses,
                                                    otherUserId,
                                                )}
                                            </ThemedText>
                                        )
                                    ) : null}
                                </View>
                            </View>
                        </View>
                        <View style={styles.headerRight}>
                            {dmEncryptionEnabled ? (
                                <View
                                    style={[
                                        styles.headerIconButton,
                                        {
                                            backgroundColor: theme.muted,
                                            borderColor: theme.border,
                                            marginRight: Spacing.one,
                                        },
                                    ]}
                                >
                                    <Lock size={14} color={theme.foreground} />
                                </View>
                            ) : null}
                            {normalizedConversationId ? (
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Conversation options"
                                    onPress={() =>
                                        setShowConversationMenu(true)
                                    }
                                    style={({ pressed }) => [
                                        styles.headerIconButton,
                                        {
                                            backgroundColor: theme.muted,
                                            borderColor: theme.border,
                                            opacity: pressed ? 0.88 : 1,
                                        },
                                    ]}
                                >
                                    <EllipsisVertical
                                        size={16}
                                        color={theme.foreground}
                                    />
                                </Pressable>
                            ) : null}
                        </View>
                    </View>

                    {/* Messages area fills remaining space */}
                    {activeThreadMessageId ? (
                        <ThreadPanel
                            parentMessageId={activeThreadMessageId}
                            instanceUrl={instanceUrl ?? ""}
                            accessToken={accessToken ?? ""}
                            customEmojis={mappedEmojis}
                            contextId={normalizedConversationId}
                            currentUserId={currentUserId ?? null}
                            onOpenImageViewer={openImageViewer}
                            onClose={() => setActiveThreadMessageId(null)}
                            onReplyCountChange={(count) => {
                                const parentId = activeThreadMessageId;
                                if (!parentId) return;
                                setMessages((prev) => {
                                    const parent = prev.find(
                                        (m) => m.$id === parentId,
                                    );
                                    if (
                                        !parent ||
                                        parent.threadMessageCount === count
                                    ) {
                                        return prev;
                                    }
                                    return prev.map((m) =>
                                        m.$id === parentId
                                            ? {
                                                  ...m,
                                                  threadMessageCount: count,
                                              }
                                            : m,
                                    );
                                });
                            }}
                            type="dm"
                        />
                    ) : (
                        <View style={styles.messageArea}>
                            {messagesError ? (
                                <ThemedText
                                    themeColor="destructive"
                                    style={styles.errorText}
                                >
                                    {messagesError}
                                </ThemedText>
                            ) : null}

                            <View style={styles.messageAreaInner}>
                                <FlatList
                                    ref={listRef}
                                    data={messageRows}
                                    inverted
                                    extraData={mappedEmojis}
                                    keyExtractor={keyExtractor}
                                    renderItem={renderItem}
                                    // Messages have variable height (markdown, images, reactions), so
                                    // getItemLayout is not possible here. Without it, jumping to an
                                    // index past the measured range throws, so fall back to an
                                    // estimated offset — jump-to-message is reachable from the inbox
                                    // and from search results.
                                    onScrollToIndexFailed={
                                        handleScrollToIndexFailed
                                    }
                                    viewabilityConfig={VIEWABILITY_CONFIG}
                                    onViewableItemsChanged={({
                                        viewableItems,
                                    }) => {
                                        if (
                                            viewableItems.length > 0 &&
                                            viewableItems[0].index === 0
                                        ) {
                                            markDmReadRef.current?.();
                                        }
                                    }}
                                    onScrollEndDrag={(e) => {
                                        const y = e.nativeEvent.contentOffset.y;
                                        if (y <= 10) {
                                            markDmReadRef.current?.();
                                        }
                                    }}
                                    ListEmptyComponent={
                                        messagesLoadState ===
                                        "loading" ? null : (
                                            <ThemedView
                                                type="secondary"
                                                style={styles.emptyTimeline}
                                            >
                                                <ThemedText type="smallBold">
                                                    No messages yet
                                                </ThemedText>
                                                <ThemedText
                                                    themeColor="mutedForeground"
                                                    style={styles.emptyCopy}
                                                >
                                                    Say hello to start the
                                                    conversation.
                                                </ThemedText>
                                            </ThemedView>
                                        )
                                    }
                                    initialNumToRender={15}
                                    maxToRenderPerBatch={10}
                                    windowSize={5}
                                    removeClippedSubviews
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={styles.timelineList}
                                    style={styles.messageList}
                                />

                                {unreadCount > 0 ? (
                                    <Pressable
                                        onPress={() => {
                                            listRef.current?.scrollToOffset({
                                                offset: 0,
                                                animated: true,
                                            });
                                            markDmRead();
                                        }}
                                        style={[
                                            styles.unreadBadge,
                                            { backgroundColor: theme.primary },
                                        ]}
                                    >
                                        <ThemedText
                                            type="smallBold"
                                            style={{
                                                color: theme.primaryForeground,
                                            }}
                                        >
                                            {unreadCount} new message
                                            {unreadCount === 1 ? "" : "s"}
                                        </ThemedText>
                                    </Pressable>
                                ) : null}
                            </View>

                            {/* Reply / Edit preview */}
                            {replyingTo ? (
                                <View
                                    style={[
                                        styles.replyPreview,
                                        {
                                            borderTopColor: theme.border,
                                            backgroundColor: theme.muted,
                                        },
                                    ]}
                                >
                                    <View style={styles.replyPreviewCopy}>
                                        <ThemedText
                                            type="smallBold"
                                            themeColor="accent"
                                        >
                                            Replying to{" "}
                                            {replyingTo.senderDisplayName ??
                                                replyingTo.senderId ??
                                                "User"}
                                        </ThemedText>
                                        <ThemedText
                                            themeColor="mutedForeground"
                                            numberOfLines={1}
                                        >
                                            {replyingTo.text ?? ""}
                                        </ThemedText>
                                    </View>
                                    <Pressable
                                        onPress={() => setReplyingTo(null)}
                                        style={styles.replyCloseBtn}
                                    >
                                        <ThemedText themeColor="mutedForeground">
                                            ✕
                                        </ThemedText>
                                    </Pressable>
                                </View>
                            ) : editingMessage ? (
                                <View
                                    style={[
                                        styles.replyPreview,
                                        {
                                            borderTopColor: theme.border,
                                            backgroundColor: theme.muted,
                                        },
                                    ]}
                                >
                                    <View style={styles.replyPreviewCopy}>
                                        <ThemedText
                                            type="smallBold"
                                            themeColor="accent"
                                        >
                                            Editing message
                                        </ThemedText>
                                        <ThemedText
                                            themeColor="mutedForeground"
                                            numberOfLines={1}
                                        >
                                            {editingMessage.text ?? ""}
                                        </ThemedText>
                                    </View>
                                    <Pressable
                                        onPress={() => {
                                            setEditingMessage(null);
                                            setDraft("");
                                        }}
                                        style={styles.replyCloseBtn}
                                    >
                                        <ThemedText themeColor="mutedForeground">
                                            ✕
                                        </ThemedText>
                                    </Pressable>
                                </View>
                            ) : null}

                            {/* Composer pinned at bottom */}
                            {dmEncryptionEnabled ? (
                                <View
                                    style={[
                                        styles.encryptionBadge,
                                        {
                                            backgroundColor: theme.muted,
                                            borderTopColor: theme.border,
                                        },
                                    ]}
                                >
                                    <Lock
                                        size={10}
                                        color={theme.mutedForeground}
                                    />
                                    <ThemedText
                                        type="small"
                                        themeColor="destructive"
                                        style={{ marginLeft: 4 }}
                                    >
                                        {DM_ENCRYPTION_SUPPORTED
                                            ? "End-to-end encrypted"
                                            : "Encrypted messaging is unavailable in this build — messages cannot be sent"}
                                    </ThemedText>
                                </View>
                            ) : null}
                            {conversation?.readOnly ? (
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                    style={{
                                        textAlign: "center",
                                        paddingVertical: Spacing.two,
                                        paddingHorizontal: Spacing.three,
                                    }}
                                >
                                    {conversation.readOnlyReason ??
                                        "Replies are disabled"}
                                </ThemedText>
                            ) : null}
                            {sendError ? (
                                <ThemedText
                                    themeColor="destructive"
                                    style={styles.errorText}
                                >
                                    {sendError}
                                </ThemedText>
                            ) : null}
                            <View
                                style={[
                                    styles.composer,
                                    {
                                        borderTopColor: theme.border,
                                        backgroundColor: theme.background,
                                    },
                                ]}
                            >
                                <ChatInput
                                    value={draft}
                                    onChange={setDraft}
                                    onChangeText={handleTypingChange}
                                    placeholder="Message"
                                    ref={inputRef}
                                    disabled={
                                        !signedIn || conversation?.readOnly
                                    }
                                    onMentionsChange={() => {}}
                                    canMentionEveryone={false}
                                    instanceUrl={instanceUrl ?? ""}
                                    accessToken={accessToken ?? ""}
                                    attachments={composerAttachments}
                                    onAttachmentsChange={setComposerAttachments}
                                    onSend={() => void sendMessage()}
                                    sending={sendState === "loading"}
                                    customEmojis={composerEmojis}
                                    onOpenPollCreate={() =>
                                        setPollModalVisible(true)
                                    }
                                    onOpenGifStickerPicker={() =>
                                        setGifStickerPickerVisible(true)
                                    }
                                />
                            </View>
                        </View>
                    )}
                </SafeAreaView>

                <ImageViewer
                    url={viewerImageUrl ?? undefined}
                    visible={Boolean(viewerImageUrl)}
                    onClose={() => setViewerImageUrl(null)}
                />

                <EmojiPickerSheet
                    visible={emojiPickerVisible}
                    onClose={() => {
                        setEmojiPickerVisible(false);
                    }}
                    onSelect={async (emoji) => {
                        if (emojiPickerMsgId && instanceUrl && accessToken) {
                            try {
                                await toggleReaction(
                                    emojiPickerMsgId,
                                    emoji,
                                    true,
                                    true,
                                    instanceUrl,
                                    accessToken,
                                );
                                // Refresh messages to show the new reaction
                                if (loadMessages) await loadMessages(true);
                            } catch (e) {
                                console.error(
                                    "[dm:toggleReaction] Failed to toggle reaction",
                                    e,
                                );
                            }
                        }
                        setEmojiPickerVisible(false);
                    }}
                    customEmojis={mappedEmojis}
                />

                {pollModalVisible && (
                    <PollCreationModal
                        visible
                        onClose={() => setPollModalVisible(false)}
                        onSubmit={handlePollSubmit}
                    />
                )}

                {gifStickerPickerVisible && instanceUrl && accessToken ? (
                    <GifStickerPicker
                        instanceUrl={instanceUrl}
                        accessToken={accessToken}
                        visible={gifStickerPickerVisible}
                        onClose={() => setGifStickerPickerVisible(false)}
                        onSelectAttachment={(attachment) => {
                            const fileUrl = attachment.fileUrl;
                            if (!fileUrl) return;
                            setComposerAttachments((prev) => ({
                                ...prev,
                                files: [
                                    ...prev.files,
                                    {
                                        uri: fileUrl,
                                        name: attachment.fileName,
                                        mimeType: attachment.fileType,
                                        size: attachment.fileSize,
                                        remoteAttachment: {
                                            fileId: attachment.fileId,
                                            fileName: attachment.fileName,
                                            fileSize: attachment.fileSize,
                                            fileType: attachment.fileType,
                                            fileUrl,
                                            thumbnailUrl:
                                                attachment.thumbnailUrl,
                                            previewUrl: attachment.previewUrl,
                                            mediaKind: attachment.mediaKind,
                                            source: attachment.source,
                                            packId: attachment.packId,
                                            itemId: attachment.itemId,
                                        },
                                    },
                                ],
                            }));
                        }}
                    />
                ) : null}

                {/* Replaces the separate Pins and Profile buttons. Two labelled pills
            crowded a header that already carries a title, a lock badge and the
            peer's presence; an overflow menu keeps the actions and the chat
            surface in the same place, which is where they are used from. */}
                <Modal
                    visible={showConversationMenu}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowConversationMenu(false)}
                >
                    <Pressable
                        style={styles.menuBackdrop}
                        onPress={() => setShowConversationMenu(false)}
                    >
                        <View
                            style={[
                                styles.menuSheet,
                                {
                                    backgroundColor: theme.card,
                                    borderColor: theme.border,
                                },
                            ]}
                        >
                            <Pressable
                                style={styles.menuRow}
                                onPress={() => {
                                    setShowConversationMenu(false);
                                    setShowPinnedPanel(true);
                                }}
                            >
                                <Pin size={16} color={theme.foreground} />
                                <ThemedText type="small">
                                    Pinned messages
                                </ThemedText>
                            </Pressable>
                            {conversation?.otherUser?.userId ? (
                                <Pressable
                                    style={styles.menuRow}
                                    onPress={() => {
                                        const userId =
                                            conversation?.otherUser?.userId;
                                        setShowConversationMenu(false);
                                        if (userId) {
                                            router.push(
                                                `/user/${encodeURIComponent(userId)}` as never,
                                            );
                                        }
                                    }}
                                >
                                    <User size={16} color={theme.foreground} />
                                    <ThemedText type="small">
                                        View profile
                                    </ThemedText>
                                </Pressable>
                            ) : null}
                        </View>
                    </Pressable>
                </Modal>

                <Modal
                    visible={showPinnedPanel}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowPinnedPanel(false)}
                >
                    <View
                        style={[
                            styles.pinsOverlay,
                            { backgroundColor: "rgba(0,0,0,0.5)" },
                        ]}
                    >
                        <View
                            style={[
                                styles.pinsContainer,
                                {
                                    backgroundColor: theme.background,
                                    borderTopColor: theme.border,
                                },
                            ]}
                        >
                            <View style={styles.pinsHeader}>
                                <ThemedText
                                    type="smallBold"
                                    style={{ fontSize: 16 }}
                                >
                                    Pinned Messages
                                </ThemedText>
                                <Pressable
                                    onPress={() => setShowPinnedPanel(false)}
                                >
                                    <ThemedText
                                        themeColor="mutedForeground"
                                        style={{ fontSize: 16 }}
                                    >
                                        ✕
                                    </ThemedText>
                                </Pressable>
                            </View>
                            {pinsLoading ? (
                                <ActivityIndicator
                                    color={theme.primary}
                                    style={{ padding: Spacing.three }}
                                />
                            ) : pinnedMessages.length === 0 ? (
                                <View style={{ padding: Spacing.three }}>
                                    <ThemedText themeColor="mutedForeground">
                                        No pinned messages yet. Long-press a
                                        message and tap Pin to add one.
                                    </ThemedText>
                                </View>
                            ) : (
                                <ScrollView style={{ flex: 1 }}>
                                    {pinnedMessages.map((msg, i) => (
                                        <View
                                            key={msg.$id ?? i}
                                            style={[
                                                styles.pinItem,
                                                {
                                                    borderBottomColor:
                                                        withAlpha(
                                                            theme.border,
                                                            0.25,
                                                        ),
                                                },
                                            ]}
                                        >
                                            <EmojiRenderer
                                                text={msg.text ?? ""}
                                                customEmojis={mappedEmojis}
                                            />
                                            <ThemedText
                                                type="code"
                                                themeColor="mutedForeground"
                                                style={{
                                                    fontSize: 11,
                                                    marginTop: 4,
                                                }}
                                            >
                                                {msg.senderDisplayName ??
                                                    msg.senderId ??
                                                    "Unknown"}
                                            </ThemedText>
                                        </View>
                                    ))}
                                </ScrollView>
                            )}
                        </View>
                    </View>
                </Modal>
            </KeyboardAvoidingView>
            <UserProfileSheet
                userId={profileSheetUser?.userId ?? ""}
                displayName={profileSheetUser?.displayName}
                avatarUrl={profileSheetUser?.avatarUrl}
                open={Boolean(profileSheetUser)}
                onClose={() => setProfileSheetUser(null)}
                onViewFullProfile={() => {
                    if (profileSheetUser?.userId) {
                        router.push(
                            `/user/${encodeURIComponent(profileSheetUser.userId)}` as never,
                        );
                    }
                }}
            />
        </AuthRouteGuard>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    backdropOrbTop: {
        position: "absolute",
        width: 260,
        height: 260,
        borderRadius: 260,
        top: -130,
        left: -130,
        zIndex: 0,
    },
    backdropOrbBottom: {
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: 320,
        right: -160,
        bottom: 20,
        zIndex: 0,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: Spacing.two,
    },
    headerLeft: {
        flexShrink: 0,
    },
    headerCenter: {
        flex: 1,
        minWidth: 0,
    },
    headerRight: {
        flexShrink: 0,
    },
    backButton: {
        paddingVertical: Spacing.one,
    },
    dmTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
        minWidth: 0,
    },
    dmAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
    },
    dmTitle: {
        minWidth: 0,
    },
    headerIconButton: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.half,
    },
    menuBackdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.4)",
    },
    menuSheet: {
        marginHorizontal: Spacing.three,
        marginBottom: Spacing.four,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: "hidden",
    },
    menuRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
    },
    messageArea: {
        flex: 1,
    },
    messageAreaInner: {
        flex: 1,
        position: "relative",
    },
    unreadBadge: {
        position: "absolute",
        bottom: 12,
        alignSelf: "center",
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.one,
        borderRadius: 999,
        zIndex: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    errorText: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    messageList: {
        flex: 1,
    },
    timelineList: {
        paddingHorizontal: Spacing.two,
        paddingTop: Spacing.two,
        paddingBottom: Spacing.four,
    },
    emptyTimeline: {
        padding: Spacing.three,
        gap: Spacing.one,
        alignItems: "center",
    },
    emptyCopy: {
        fontSize: 14,
        lineHeight: 20,
    },
    composer: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        gap: Spacing.one,
    },
    input: {
        minHeight: 88,
        borderWidth: 1,
        borderRadius: 18,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        textAlignVertical: "top",
    },
    sendButton: {
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    replyPreview: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderTopWidth: 1,
    },
    replyPreviewCopy: {
        flex: 1,
        gap: 2,
    },
    replyCloseBtn: {
        padding: Spacing.one,
    },
    pinsOverlay: {
        flex: 1,
        justifyContent: "flex-end",
    },
    pinsContainer: {
        height: 360,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderTopWidth: 1,
        overflow: "hidden",
    },
    pinsHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    pinItem: {
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    encryptionBadge: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingVertical: Spacing.half,
    },
    dayDivider: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.two,
        paddingHorizontal: Spacing.three,
    },
    dayDividerRule: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
    },
    dayDividerLabel: {
        textAlign: "center",
    },
});
