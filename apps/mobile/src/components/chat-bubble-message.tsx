import React, { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { MessageSquare } from "lucide-react-native";

import { truncatePlainText } from "@firepit-chat/markdown-spoiler/react-native";

import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/action-button";
import MessageWithMentions from "@/components/message-with-mentions";
import { ReactionButton } from "@/components/reaction-button";
import { Spacing, withAlpha } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { MessagePoll, type PollData } from "@/components/message-poll";
import {
    FileAttachmentDisplay,
    type FileAttachment,
} from "@/components/file-attachment-display";
import {
    NO_CUSTOM_EMOJIS,
    type CustomEmoji,
} from "@/components/emoji-renderer";

export type Reaction = {
    emoji: string;
    count: number;
    reactedByMe?: boolean;
};

export type MessageReplyPreview = {
    authorLabel?: string;
    text: string;
};

export type ChatBubbleMessageProps = {
    messageId: string;
    authorId: string;
    authorName: string;
    authorAvatarUrl?: string | null;
    authorAvatarFramePreset?: string;
    authorAvatarFrameUrl?: string;
    /** Each frame is drawn for its own inset; without it every frame used the
     *  same 12% default and looked misaligned inside its ring. */
    authorAvatarFrameInsetPercent?: number;
    authorPronouns?: string;
    text: string;
    createdAt?: string;
    editedAt?: string;
    removedAt?: string | null;
    removedBy?: string | null;
    isPinned?: boolean;
    isMine: boolean;
    imageUrl?: string | null;
    replyTo?: MessageReplyPreview | null;
    reactions?: Reaction[];
    attachments?: FileAttachment[];
    threadReplyCount?: number | null;
    mentions?: string[];
    /** Display names of everyone visible in the chat, so a mention that
     *  contains spaces or punctuation highlights in full. */
    knownNames?: readonly string[];
    customEmojis?: readonly CustomEmoji[];
    customEmojiUrls?: Record<string, string>;
    poll?: PollData | null;
    pollReadOnly?: boolean;
    currentUserId?: string;
    canManageMessages?: boolean;
    compact?: boolean;
    onToggleReaction?: (
        emoji: string,
        isAdding: boolean,
    ) => void | Promise<void>;
    onStartReply?: () => void;
    onStartEdit?: () => void;
    onDelete?: () => void;
    onTogglePin?: () => void;
    onOpenThread?: () => void;
    onOpenImageViewer?: (url: string) => void;
    onOpenProfile?: () => void;
    onShowEmojiPicker?: () => void;
    onVotePoll?: (optionId: string) => void | Promise<void>;
    onClosePoll?: () => void | Promise<void>;
    /**
     * Not read by this component. The action callbacks above are built inline by
     * the message screens and capture the current session token, so when that
     * token rotates the memo has to re-render the bubble or it keeps handing the
     * revoked token to the network layer. Compared here rather than comparing
     * every callback, because the callbacks are fresh arrows on every parent
     * render and comparing them would defeat the memo entirely.
     */
    authToken?: string | null;
};

const TIME_FORMAT = new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
});

const DATE_FORMAT = new Intl.DateTimeFormat([], {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
});

function formatTs(createdAt?: string) {
    if (!createdAt) return "";
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return "";
    const time = TIME_FORMAT.format(d);
    const today = new Date();
    const isToday =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
    if (isToday) return time;
    return `${time} ${DATE_FORMAT.format(d)}`;
}

function ChatBubbleMessageInner({
    messageId,
    authorName,
    authorAvatarUrl,
    authorAvatarFrameUrl,
    authorAvatarFrameInsetPercent,
    authorPronouns,
    text,
    createdAt,
    editedAt,
    removedAt,
    removedBy,
    isPinned,
    isMine,
    imageUrl,
    replyTo,
    reactions,
    attachments,
    threadReplyCount,
    mentions,
    knownNames,
    customEmojis = NO_CUSTOM_EMOJIS,
    customEmojiUrls: propCustomEmojiUrls,
    poll,
    pollReadOnly = false,
    currentUserId,
    canManageMessages = false,
    compact = true,
    onToggleReaction,
    onStartReply,
    onStartEdit,
    onDelete,
    onTogglePin,
    onOpenThread,
    onOpenImageViewer,
    onOpenProfile,
    onShowEmojiPicker,
    onVotePoll,
    onClosePoll,
    authToken: _authToken,
}: ChatBubbleMessageProps) {
    const theme = useTheme();
    const [showActions, setShowActions] = useState(false);
    const [deleteConfirming, setDeleteConfirming] = useState(false);

    const handleToggleReaction = useCallback(
        (emoji: string, isAdding: boolean) =>
            onToggleReaction?.(emoji, isAdding),
        [onToggleReaction],
    );
    const handleStartReply = useCallback(
        () => onStartReply?.(),
        [onStartReply],
    );
    const handleStartEdit = useCallback(() => onStartEdit?.(), [onStartEdit]);
    const handleDelete = useCallback(() => onDelete?.(), [onDelete]);
    const handleTogglePin = useCallback(() => onTogglePin?.(), [onTogglePin]);
    const handleOpenThread = useCallback(
        () => onOpenThread?.(),
        [onOpenThread],
    );
    const handleOpenImageViewer = useCallback(
        (url: string) => {
            if (onOpenImageViewer) {
                onOpenImageViewer(url);
                return;
            }
            // No host viewer wired up (thread panels used to hit this). Open it
            // externally rather than swallowing the tap.
            Linking.openURL(url).catch(() => {});
        },
        [onOpenImageViewer],
    );
    const handleOpenProfile = useCallback(
        () => onOpenProfile?.(),
        [onOpenProfile],
    );
    const handleShowEmojiPicker = useCallback(
        () => onShowEmojiPicker?.(),
        [onShowEmojiPicker],
    );
    const handleVotePoll = useCallback(
        (optionId: string) => onVotePoll?.(optionId),
        [onVotePoll],
    );
    const handleClosePoll = useCallback(() => onClosePoll?.(), [onClosePoll]);

    const removed = Boolean(removedAt);
    const gap = compact ? Spacing.half : Spacing.one;
    const pad = compact ? Spacing.one : Spacing.two;
    const metaSize = compact ? 11 : 12;

    // One place for the metadata style. Every meta chip (pronouns, time,
    // edited, pin, removal notice) used to repeat the same fontSize/colour
    // pair inline, so tuning the metadata line meant editing five sites.
    const metaStyle = useMemo(
        () => ({
            fontSize: metaSize - 1,
            color: theme.mutedForeground,
        }),
        [metaSize, theme.mutedForeground],
    );

    // Tinted surfaces instead of hairline outlines. The border on every bubble
    // was drawing a box around each message; a fill separates just as well and
    // keeps the transcript calm when a run of messages arrives.
    const bubbleSurface = useMemo(
        () =>
            removed
                ? { backgroundColor: withAlpha(theme.muted, 0.33) }
                : isMine
                  ? { backgroundColor: withAlpha(theme.primary, 0.12) }
                  : { backgroundColor: theme.backgroundElement },
        [isMine, removed, theme.backgroundElement, theme.muted, theme.primary],
    );

    const customEmojiUrlMap = useMemo(() => {
        if (propCustomEmojiUrls) return propCustomEmojiUrls;
        const map: Record<string, string> = {};
        for (const ce of customEmojis) {
            if (ce.name && ce.url) {
                map[ce.name.toLowerCase()] = ce.url;
            }
        }
        return map;
    }, [customEmojis, propCustomEmojiUrls]);

    const ts = formatTs(createdAt);
    const displayName = authorName || "Unknown";

    const toggleActions = () => {
        setShowActions((v) => !v);
        setDeleteConfirming(false);
    };

    const handleLongPress = () => {
        if (!removed) toggleActions();
    };

    return (
        <View style={[styles.row, isMine ? styles.rowMine : styles.rowOther]}>
            {/* Avatar — shown for every message, yours included, matching the
                web list. Own messages stay right-aligned (rowMine flips the
                row), so the avatar simply sits on the opposite side. */}
            <View style={styles.avatarCol}>
                {onOpenProfile ? (
                    <Pressable
                        onPress={handleOpenProfile}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${displayName}'s profile`}
                    >
                        <Avatar
                            uri={authorAvatarUrl ?? undefined}
                            size={28}
                            initials={displayName}
                            frameUrl={authorAvatarFrameUrl}
                            frameInset={authorAvatarFrameInsetPercent}
                        />
                    </Pressable>
                ) : (
                    <Avatar
                        uri={authorAvatarUrl ?? undefined}
                        size={28}
                        initials={displayName}
                        frameUrl={authorAvatarFrameUrl}
                        frameInset={authorAvatarFrameInsetPercent}
                    />
                )}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
                <Pressable
                    onLongPress={handleLongPress}
                    delayLongPress={350}
                    // The action row is long-press-only, which no screen
                    // reader announces on its own. Labelling the bubble and
                    // stating the gesture is what makes it reachable without
                    // a pointer.
                    accessibilityRole="button"
                    accessibilityLabel={`Message from ${displayName}`}
                    accessibilityHint="Long press for reply, react, thread, pin and delete"
                    accessibilityActions={[
                        { name: "activate", label: "Show message actions" },
                    ]}
                    onAccessibilityAction={() => {
                        if (!removed) toggleActions();
                    }}
                    style={({ pressed }) => [
                        styles.bubble,
                        {
                            padding: pad,
                            gap: gap,
                            ...bubbleSurface,
                        },
                        // A tap that long-press also produces briefly dims the
                        // bubble, so the press is acknowledged before the
                        // action row slides in.
                        pressed && styles.bubblePressed,
                    ]}
                >
                    {/* Header: name + pronouns + timestamp + badges */}
                    <View
                        style={[
                            styles.headerRow,
                            isMine && styles.headerRowMine,
                        ]}
                    >
                        <Text
                            style={[
                                styles.authorName,
                                { fontSize: metaSize, color: theme.text },
                            ]}
                            numberOfLines={1}
                        >
                            {displayName}
                        </Text>
                        {authorPronouns ? (
                            <Text style={[styles.meta, metaStyle]}>
                                ({authorPronouns})
                            </Text>
                        ) : null}
                        {ts ? (
                            <Text style={[styles.meta, metaStyle]}>{ts}</Text>
                        ) : null}
                        {editedAt ? (
                            <Text style={[styles.meta, metaStyle]}>
                                (edited)
                            </Text>
                        ) : null}
                        {isPinned ? (
                            <Text
                                style={[
                                    styles.meta,
                                    { ...metaStyle, color: theme.primary },
                                ]}
                            >
                                📌
                            </Text>
                        ) : null}
                        {removed ? (
                            <Text
                                style={[
                                    styles.meta,
                                    { ...metaStyle, color: theme.destructive },
                                ]}
                            >
                                {removedBy ? "Removed by mod" : "Removed"}
                            </Text>
                        ) : null}
                    </View>

                    {/* Reply preview */}
                    {replyTo && !removed ? (
                        <View
                            style={[
                                styles.replyPreview,
                                {
                                    backgroundColor: withAlpha(
                                        theme.muted,
                                        0.27,
                                    ),
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.replyAuthor,
                                    {
                                        fontSize: metaSize + 1,
                                        color: theme.text,
                                    },
                                ]}
                            >
                                {replyTo.authorLabel || "User"}
                            </Text>
                            <Text
                                style={[
                                    styles.replyText,
                                    {
                                        fontSize: metaSize,
                                        color: theme.mutedForeground,
                                    },
                                ]}
                                numberOfLines={1}
                            >
                                {truncatePlainText(replyTo.text, 80)}
                            </Text>
                        </View>
                    ) : null}

                    {/* Message body with markdown + mentions + custom emojis */}
                    {!removed ? (
                        <MessageWithMentions
                            text={poll ? "" : text}
                            customEmojis={customEmojis}
                            mentions={mentions}
                            knownNames={knownNames}
                        />
                    ) : null}

                    {/* Inline image */}
                    {imageUrl && !removed ? (
                        <Pressable
                            onPress={() => handleOpenImageViewer(imageUrl)}
                            accessibilityRole="imagebutton"
                            accessibilityLabel="Open image"
                            style={{ marginTop: gap }}
                        >
                            <Image
                                source={{ uri: imageUrl }}
                                style={styles.inlineImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                            />
                        </Pressable>
                    ) : null}

                    {/* Poll */}
                    {poll && !removed ? (
                        <MessagePoll
                            poll={poll}
                            currentUserId={currentUserId}
                            canClose={
                                canManageMessages ||
                                (currentUserId != null &&
                                    poll.createdBy === currentUserId)
                            }
                            readOnly={pollReadOnly}
                            onVote={handleVotePoll}
                            onClose={handleClosePoll}
                        />
                    ) : null}

                    {/* Attachments */}
                    {attachments && attachments.length > 0 && !removed ? (
                        <View style={{ gap: gap, marginTop: gap }}>
                            {attachments.map((att, idx) => (
                                <FileAttachmentDisplay
                                    key={`${messageId}-${att.fileId ?? "att"}-${idx}`}
                                    attachment={att}
                                    onPress={handleOpenImageViewer}
                                />
                            ))}
                        </View>
                    ) : null}

                    {/* Reactions and the reply count share one row. With the
                        count in its own row underneath, a message that had both
                        read as though the reactions had displaced it. */}
                    {(reactions && reactions.length > 0) ||
                    (typeof threadReplyCount === "number" &&
                        threadReplyCount > 0 &&
                        onOpenThread) ? (
                        <View style={styles.reactionsRow}>
                            {reactions?.map((reaction) => (
                                <ReactionButton
                                    key={`${messageId}-${reaction.emoji}`}
                                    reaction={reaction}
                                    customEmojiUrls={customEmojiUrlMap}
                                    onToggle={handleToggleReaction}
                                />
                            ))}
                            {typeof threadReplyCount === "number" &&
                            threadReplyCount > 0 &&
                            onOpenThread ? (
                                <Pressable
                                    onPress={handleOpenThread}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${threadReplyCount} ${threadReplyCount === 1 ? "reply" : "replies"}, open thread`}
                                    style={[
                                        styles.threadRow,
                                        { backgroundColor: theme.accentSoft },
                                    ]}
                                >
                                    <MessageSquare
                                        size={12}
                                        color={theme.primary}
                                    />
                                    <Text
                                        style={[
                                            styles.threadText,
                                            {
                                                fontSize: metaSize,
                                                color: theme.primary,
                                            },
                                        ]}
                                    >
                                        {threadReplyCount}{" "}
                                        {threadReplyCount === 1
                                            ? "reply"
                                            : "replies"}
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>
                    ) : null}

                    {/* Action sheet */}
                    {showActions && !removed ? (
                        <View
                            style={[
                                styles.actionsRow,
                                isMine && styles.actionsRowMine,
                            ]}
                        >
                            {onToggleReaction ? (
                                <ActionButton
                                    label="React"
                                    onPress={() => {
                                        if (onShowEmojiPicker) {
                                            handleShowEmojiPicker();
                                        } else {
                                            handleToggleReaction("❤️", true);
                                        }
                                        setShowActions(false);
                                    }}
                                    tone="ghost"
                                />
                            ) : null}
                            {onStartReply ? (
                                <ActionButton
                                    label="Reply"
                                    onPress={() => {
                                        handleStartReply();
                                        setShowActions(false);
                                    }}
                                    tone="ghost"
                                />
                            ) : null}
                            {onOpenThread ? (
                                <ActionButton
                                    label="Thread"
                                    onPress={() => {
                                        handleOpenThread();
                                        setShowActions(false);
                                    }}
                                    tone="ghost"
                                />
                            ) : null}
                            {isMine && onStartEdit ? (
                                <ActionButton
                                    label="Edit"
                                    onPress={() => {
                                        handleStartEdit();
                                        setShowActions(false);
                                    }}
                                    tone="ghost"
                                />
                            ) : null}
                            {(isMine || canManageMessages) && onTogglePin ? (
                                <ActionButton
                                    label={isPinned ? "Unpin" : "Pin"}
                                    onPress={() => {
                                        handleTogglePin();
                                        setShowActions(false);
                                    }}
                                    tone="ghost"
                                />
                            ) : null}
                            {isMine && onDelete ? (
                                deleteConfirming ? (
                                    <View style={styles.deleteConfirmRow}>
                                        <ActionButton
                                            label="Confirm"
                                            onPress={() => {
                                                handleDelete();
                                                setDeleteConfirming(false);
                                                setShowActions(false);
                                            }}
                                            tone="destructive"
                                        />
                                        <ActionButton
                                            label="Cancel"
                                            onPress={() =>
                                                setDeleteConfirming(false)
                                            }
                                            tone="ghost"
                                        />
                                    </View>
                                ) : (
                                    <ActionButton
                                        label="Delete"
                                        onPress={() =>
                                            setDeleteConfirming(true)
                                        }
                                        tone="ghost"
                                    />
                                )
                            ) : null}
                            <ActionButton
                                label="Close"
                                onPress={() => {
                                    setShowActions(false);
                                    setDeleteConfirming(false);
                                }}
                                tone="ghost"
                            />
                        </View>
                    ) : null}
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: Spacing.one,
        paddingVertical: 1,
    },
    rowMine: {
        flexDirection: "row-reverse",
    },
    rowOther: {
        flexDirection: "row",
    },
    avatarCol: {
        width: 28,
        alignItems: "center",
        paddingTop: 2,
    },
    bubble: {
        // No flex here. `flex: 1` implies flexBasis 0, so inside the
        // auto-height column above, the bubble resolved to zero height while its
        // text still drew at full size and spilled out below the box. The
        // wrapper already carries flex: 1, which is what actually needs to
        // grow (web puts flex-1 on the content column, not the bubble).
        minWidth: 0,
        borderRadius: 12,
    },
    bubblePressed: {
        opacity: 0.72,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: Spacing.one,
        flexWrap: "wrap",
    },
    headerRowMine: {
        justifyContent: "flex-end",
    },
    authorName: {
        fontWeight: "700",
    },
    meta: {
        fontStyle: "italic",
    },
    replyPreview: {
        borderRadius: 6,
        paddingHorizontal: Spacing.one,
        paddingVertical: Spacing.half,
        gap: 1,
    },
    replyAuthor: {
        fontWeight: "700",
    },
    replyText: {},
    inlineImage: {
        width: 200,
        height: 150,
        borderRadius: 8,
    },
    threadRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.half,
        borderRadius: 6,
        paddingHorizontal: Spacing.one,
        paddingVertical: Spacing.half,
    },
    threadText: {
        fontWeight: "700",
    },
    reactionsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.half,
    },
    actionsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.half,
        paddingTop: Spacing.half,
    },
    actionsRowMine: {
        justifyContent: "flex-end",
    },
    deleteConfirmRow: {
        flexDirection: "row",
        gap: Spacing.half,
    },
});

function sameReactions(
    a: readonly Reaction[] | undefined,
    b: readonly Reaction[] | undefined,
): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (
            a[i].emoji !== b[i].emoji ||
            a[i].count !== b[i].count ||
            Boolean(a[i].reactedByMe) !== Boolean(b[i].reactedByMe)
        ) {
            return false;
        }
    }
    return true;
}

export const ChatBubbleMessage = React.memo(
    ChatBubbleMessageInner,
    (prev, next) => {
        if (prev.messageId !== next.messageId) return false;
        if (prev.authorId !== next.authorId) return false;
        if (prev.currentUserId !== next.currentUserId) return false;
        if (prev.authorName !== next.authorName) return false;
        if (prev.authorAvatarUrl !== next.authorAvatarUrl) return false;
        if (prev.authorAvatarFramePreset !== next.authorAvatarFramePreset)
            return false;
        if (prev.authorAvatarFrameUrl !== next.authorAvatarFrameUrl)
            return false;
        if (
            prev.authorAvatarFrameInsetPercent !==
            next.authorAvatarFrameInsetPercent
        )
            return false;
        if (prev.authorPronouns !== next.authorPronouns) return false;
        if (prev.text !== next.text) return false;
        if (prev.createdAt !== next.createdAt) return false;
        if (prev.editedAt !== next.editedAt) return false;
        if (prev.removedAt !== next.removedAt) return false;
        if (prev.removedBy !== next.removedBy) return false;
        if (prev.isPinned !== next.isPinned) return false;
        if (prev.isMine !== next.isMine) return false;
        if (prev.imageUrl !== next.imageUrl) return false;
        if (prev.replyTo?.text !== next.replyTo?.text) return false;
        if (prev.replyTo?.authorLabel !== next.replyTo?.authorLabel)
            return false;
        // Compare by value: the message screens build this array while mapping
        // over messages, so an identity check was always false and this memo —
        // the only one in the app — never actually skipped a render.
        if (!sameReactions(prev.reactions, next.reactions)) return false;
        if (prev.attachments !== next.attachments) return false;
        if (prev.threadReplyCount !== next.threadReplyCount) return false;
        if (prev.mentions !== next.mentions) return false;
        if (prev.customEmojis !== next.customEmojis) return false;
        if (prev.customEmojiUrls !== next.customEmojiUrls) return false;
        if (prev.poll !== next.poll) return false;
        if (prev.pollReadOnly !== next.pollReadOnly) return false;
        if (prev.canManageMessages !== next.canManageMessages) return false;
        if (prev.compact !== next.compact) return false;
        // Callbacks are compared too. Returning true here means "will not
        // re-render", so a bubble that first rendered without
        // onOpenImageViewer kept that dead closure permanently and its image
        // taps did nothing. Call sites pass this one from useCallback, so the
        // identity is stable and the memo still skips renders.
        if (prev.onOpenImageViewer !== next.onOpenImageViewer) return false;
        if (prev.authToken !== next.authToken) return false;
        return true;
    },
);
