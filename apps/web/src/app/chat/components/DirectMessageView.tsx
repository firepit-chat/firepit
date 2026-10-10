"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
    Loader2,
    Lock,
    ArrowLeft,
    MessageSquare,
    Reply,
    Pencil,
    Trash2,
    Image as ImageIcon,
    X,
    Users,
    Pin,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/status-indicator";
import dynamic from "next/dynamic";

// Both of these only render on interaction, so they stay out of the initial
// chat payload. `ImageViewer` was previously imported statically here *and*
// dynamically in `chat/page.tsx`, which put the same component in the bundle
// twice; two dynamic references to one module resolve to one async chunk.
const ImageViewer = dynamic(
    () =>
        import("@/components/image-viewer").then((mod) => ({
            default: mod.ImageViewer,
        })),
    { ssr: false },
);

const GifStickerPicker = dynamic(
    () =>
        import("@/components/gif-sticker-picker").then((mod) => ({
            default: mod.GifStickerPicker,
        })),
    { ssr: false },
);
import { ImageWithSkeleton } from "@/components/image-with-skeleton";
import { EmojiPicker } from "@/components/emoji-picker";
import { ChatInput } from "@/components/chat-input";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionPicker } from "@/components/reaction-picker";

import { MessageWithMentions } from "@/components/message-with-mentions";
import { FileUploadButton, FilePreview } from "@/components/file-upload-button";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import { VirtualizedDMList } from "@/components/virtualized-dm-list";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ChatPinnedMessagesContent } from "@/components/chat-pinned-messages-content";
import { ChatThreadContent } from "@/components/chat-thread-content";
import { MentionHelpTooltip } from "@/components/mention-help-tooltip";
import { MESSAGE_LIST_VIEWPORT_HEIGHT } from "@/components/virtualized-message-list";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";
import { adaptDirectMessages, fromDirectMessage } from "@/lib/chat-surface";
import { jumpToMessage } from "@/lib/message-navigation";
import type { ChatSurfaceMessage } from "@/lib/chat-surface";
import type { DirectMessage, Conversation, FileAttachment } from "@/lib/types";
import { formatMessageTimestamp } from "@/lib/utils";
import { uploadImage } from "@/lib/appwrite-dms-client";
import { toggleReaction } from "@/lib/reactions-client";
import { toast } from "sonner";

// Keep DM rendering parity with the shared chat surface threshold.
const VIRTUALIZATION_THRESHOLD = 20;

// Stable no-op fallback: `prop || (() => undefined)` allocated a new function
// each render, which defeated the memo on every message row.
const noop = () => undefined;

type DirectMessageViewProps = {
    conversation: Conversation;
    messages: DirectMessage[];
    loading: boolean;
    sending: boolean;
    currentUserId: string;
    readOnly?: boolean;
    readOnlyReason?: string | null;
    messageDensity?: "compact" | "cozy";
    onSend: (
        _text: string,
        _imageFileId?: string,
        _imageUrl?: string,
        _replyToId?: string,
        _attachments?: unknown[],
    ) => Promise<void>;
    onEdit: (_messageId: string, _newText: string) => Promise<void>;
    onDelete: (_messageId: string) => Promise<void>;
    onToggleReaction?: (
        _messageId: string,
        _emoji: string,
        _isAdding: boolean,
    ) => Promise<void>;
    onBack?: () => void;
    typingUsers?: Record<
        string,
        { userId: string; userName?: string; updatedAt: string }
    >;
    onTypingChange?: (_text: string) => void;
    pinnedMessages?: DirectMessage[];
    pinnedMessageIds?: string[];
    onTogglePinMessage?: (_message: DirectMessage) => Promise<void>;
    onOpenThread?: (_message: DirectMessage) => Promise<void>;
    activeThreadParent?: DirectMessage | null;
    threadMessages?: DirectMessage[];
    threadLoading?: boolean;
    threadReplySending?: boolean;
    onCloseThread?: () => void;
    onSendThreadReply?: (_text: string) => Promise<void> | void;
    onOpenProfileModal?: (
        userId: string,
        userName?: string,
        displayName?: string,
        avatarUrl?: string,
    ) => void;
    onCatchUpUnread?: () => void;
    onJumpToUnread?: () => void;
    onLoadOlder?: () => Promise<void> | void;
    shouldShowLoadOlder?: boolean;
    unreadAnchorMessageId?: string | null;
    unreadSummaryLabel?: string | null;
    dmEncryptionSelfEnabled?: boolean;
    dmEncryptionPeerEnabled?: boolean;
    dmEncryptionMutualEnabled?: boolean;
    dmEncryptionPeerPublicKey?: string | null;
};

type EncryptionStatus = {
    className: string;
    label: string;
};

function getEncryptionStatus(params: {
    isGroup: boolean;
    dmEncryptionMutualEnabled: boolean;
    dmEncryptionSelfEnabled: boolean;
    dmEncryptionPeerEnabled: boolean;
    dmEncryptionPeerPublicKey: string | null;
}): EncryptionStatus | null {
    const {
        isGroup,
        dmEncryptionMutualEnabled,
        dmEncryptionSelfEnabled,
        dmEncryptionPeerEnabled,
        dmEncryptionPeerPublicKey,
    } = params;
    const hasPeerPublicKey =
        typeof dmEncryptionPeerPublicKey === "string" &&
        dmEncryptionPeerPublicKey.length > 0;

    if (isGroup) {
        return null;
    }

    if (dmEncryptionMutualEnabled && hasPeerPublicKey) {
        return {
            label: "End-to-end encryption active",
            className: "text-emerald-700 dark:text-emerald-300",
        };
    }

    if (dmEncryptionMutualEnabled && !hasPeerPublicKey) {
        return {
            label: "Encryption enabled but peer key unavailable; currently plaintext",
            className: "text-amber-700 dark:text-amber-300",
        };
    }

    if (dmEncryptionSelfEnabled && !dmEncryptionPeerEnabled) {
        return {
            label: "Encryption enabled for you; waiting for peer",
            className: "text-amber-700 dark:text-amber-300",
        };
    }

    if (!dmEncryptionSelfEnabled && dmEncryptionPeerEnabled) {
        if (!hasPeerPublicKey) {
            return {
                label: "Peer enabled encryption but no key is published yet",
                className: "text-amber-700 dark:text-amber-300",
            };
        }

        return {
            label: "Peer enabled encryption; currently plaintext",
            className: "text-amber-700 dark:text-amber-300",
        };
    }

    return {
        label: "Direct messages currently plaintext",
        className: "text-muted-foreground",
    };
}

export function DirectMessageView({
    conversation,
    messages,
    loading,
    sending,
    currentUserId,
    readOnly = false,
    readOnlyReason,
    messageDensity = "compact",
    onSend,
    onEdit,
    onDelete,
    onToggleReaction,
    onBack,
    typingUsers = {},
    onTypingChange,
    pinnedMessages: providedPinnedMessages,
    pinnedMessageIds,
    onTogglePinMessage,
    onOpenThread,
    activeThreadParent,
    threadMessages = [],
    threadLoading = false,
    threadReplySending = false,
    onCloseThread,
    onSendThreadReply,
    onOpenProfileModal,
    onCatchUpUnread,
    onJumpToUnread,
    onLoadOlder,
    shouldShowLoadOlder = false,
    unreadAnchorMessageId,
    unreadSummaryLabel,
    dmEncryptionSelfEnabled = false,
    dmEncryptionPeerEnabled = false,
    dmEncryptionMutualEnabled = false,
    dmEncryptionPeerPublicKey = null,
}: DirectMessageViewProps) {
    const compactMessages = messageDensity === "compact";
    const [text, setText] = useState("");
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null,
    );
    const [replyingToMessage, setReplyingToMessage] =
        useState<DirectMessage | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [viewingImage, setViewingImage] = useState<{
        url: string;
        alt: string;
    } | null>(null);
    const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>(
        [],
    );
    const [threadReplyText, setThreadReplyText] = useState("");
    const [pinnedOpen, setPinnedOpen] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isGroup =
        conversation.isGroup || conversation.participants.length > 2;
    const otherUser = conversation.otherUser;
    const displayName = isGroup
        ? conversation.name || "Group DM"
        : otherUser?.displayName || otherUser?.userId || "Unknown User";
    const participantCount =
        conversation.participantCount ?? conversation.participants.length;
    const subtitle = isGroup
        ? `${participantCount} participant${participantCount === 1 ? "" : "s"}`
        : otherUser?.status;
    const encryptionStatus = getEncryptionStatus({
        isGroup,
        dmEncryptionMutualEnabled,
        dmEncryptionSelfEnabled,
        dmEncryptionPeerEnabled,
        dmEncryptionPeerPublicKey,
    });
    const composerDisabled = readOnly || sending || uploadingImage;
    const readOnlyMessage = readOnlyReason || "This conversation is read-only.";
    const useVirtualScrolling = messages.length >= VIRTUALIZATION_THRESHOLD;
    const typingUserList = Object.values(typingUsers ?? {});
    const typingLabel = typingUserList
        .map(
            (typingUser) =>
                typingUser.userName || typingUser.userId.slice(0, 6),
        )
        .join(", ");

    // Custom emojis
    const { customEmojis, uploadEmoji } = useCustomEmojis();

    // Collect all display names from visible DM messages so mentions with
    // spaces (like "avery <3") can be highlighted for old messages.
    const knownDisplayNames = useMemo(
        () => [
            ...new Set(
                messages
                    .map((m) => m.senderDisplayName)
                    .filter((n): n is string => Boolean(n)),
            ),
        ],
        [messages],
    );

    const pinnedMessages = useMemo(() => {
        if (providedPinnedMessages) {
            return providedPinnedMessages;
        }

        if (!Array.isArray(pinnedMessageIds) || pinnedMessageIds.length === 0) {
            return [] as DirectMessage[];
        }

        const byId = new Map(messages.map((message) => [message.$id, message]));
        return pinnedMessageIds
            .map((messageId) => byId.get(messageId))
            .filter((message): message is DirectMessage => Boolean(message));
    }, [messages, pinnedMessageIds, providedPinnedMessages]);
    const pinnedSurfaceMessages = useMemo(
        () => adaptDirectMessages(pinnedMessages),
        [pinnedMessages],
    );
    const threadParentSurfaceMessage = useMemo(
        () =>
            activeThreadParent ? fromDirectMessage(activeThreadParent) : null,
        [activeThreadParent],
    );
    const threadSurfaceMessages = useMemo(
        () => adaptDirectMessages(threadMessages),
        [threadMessages],
    );
    useEffect(() => {
        setThreadReplyText("");
    }, [activeThreadParent?.$id]);

    const handleToggleReaction = useCallback(
        async (messageId: string, emoji: string, isAdding: boolean) => {
            if (onToggleReaction) {
                await onToggleReaction(messageId, emoji, isAdding);
                return;
            }

            await toggleReaction(messageId, emoji, isAdding, true);
        },
        [onToggleReaction],
    );

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (messagesContainerRef.current) {
            // Scroll the container, not the entire page
            messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
        }
    }, [messages.length]); // Only scroll when message count changes, not on every update

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (
            (!text.trim() && !selectedImage && fileAttachments.length === 0) ||
            sending
        ) {
            return;
        }

        const messageText = text;
        const replyToId = replyingToMessage?.$id;
        let imageFileId: string | undefined;
        let imageUrl: string | undefined;

        // Upload image if selected
        if (selectedImage) {
            try {
                setUploadingImage(true);
                const result = await uploadImage(selectedImage);
                imageFileId = result.fileId;
                imageUrl = result.url;
            } catch (error) {
                if (process.env.NODE_ENV === "development") {
                    console.error("Failed to upload image:", error);
                }
                setUploadingImage(false);
                return;
            } finally {
                setUploadingImage(false);
            }
        }

        // Prepare attachments
        const attachmentsToSend =
            fileAttachments.length > 0 ? [...fileAttachments] : undefined;

        setText("");
        setSelectedImage(null);
        setImagePreview(null);
        setReplyingToMessage(null);
        setFileAttachments([]);

        try {
            if (editingMessageId) {
                await onEdit(editingMessageId, messageText);
                setEditingMessageId(null);
            } else {
                await onSend(
                    messageText,
                    imageFileId,
                    imageUrl,
                    replyToId,
                    attachmentsToSend,
                );
            }
        } catch {
            // Re-set text on error so user can retry
            setText(messageText);
        }
    };
    // Surface messages carry a sliced id; the handlers below need the raw
    // document. One Map instead of a `messages.find()` scan per interaction.
    const rawMessagesById = useMemo(
        () => new Map(messages.map((message) => [message.$id, message])),
        [messages],
    );

    const startEdit = useCallback((message: DirectMessage) => {
        setEditingMessageId(message.$id);
        setText(message.text);
        setReplyingToMessage(null);
    }, []);

    const cancelEdit = () => {
        setEditingMessageId(null);
        setText("");
    };

    const startReply = useCallback((message: DirectMessage) => {
        setReplyingToMessage(message);
        setEditingMessageId(null);
    }, []);

    const cancelReply = () => {
        setReplyingToMessage(null);
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        // Validate file type
        if (!file.type.startsWith("image/")) {
            toast.error("Please select an image file");
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Image must be less than 5MB");
            return;
        }

        setSelectedImage(file);

        // Create preview
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            setImagePreview(reader.result as string);
        });
        reader.readAsDataURL(file);
    };

    const removeImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDelete = useCallback(
        async (messageId: string) => {
            try {
                await onDelete(messageId);
                setDeleteConfirmId(null);
            } catch {
                // Error handled by parent
            }
        },
        [onDelete],
    );

    // Each of these is threaded down to every memoized message row, so they
    // must keep a stable identity across renders.
    const handleOpenImageViewer = useCallback((imageUrl: string) => {
        setViewingImage({ url: imageUrl, alt: "Direct message image" });
    }, []);

    const handleOpenThreadRow = useCallback(
        async (message: ChatSurfaceMessage) => {
            const raw = rawMessagesById.get(message.id);
            if (raw && onOpenThread) {
                await onOpenThread(raw);
            }
        },
        [onOpenThread, rawMessagesById],
    );

    const handleStartEditRow = useCallback(
        (message: ChatSurfaceMessage) => {
            const raw = rawMessagesById.get(message.id);
            if (raw) {
                startEdit(raw);
            }
        },
        [rawMessagesById, startEdit],
    );

    const handleStartReplyRow = useCallback(
        (message: ChatSurfaceMessage) => {
            const raw = rawMessagesById.get(message.id);
            if (raw) {
                startReply(raw);
            }
        },
        [rawMessagesById, startReply],
    );

    const handleTogglePinRow = useCallback(
        async (message: ChatSurfaceMessage) => {
            const raw = rawMessagesById.get(message.id);
            if (raw && onTogglePinMessage) {
                await onTogglePinMessage(raw);
            }
        },
        [onTogglePinMessage, rawMessagesById],
    );

    const handleToggleReactionRow = useCallback(
        async (messageId: string, emoji: string, isAdding: boolean) => {
            await handleToggleReaction(messageId, emoji, isAdding);
        },
        [handleToggleReaction],
    );

    const handleRemoveRow = useCallback(
        (messageId: string) => {
            void handleDelete(messageId);
        },
        [handleDelete],
    );

    const handleEmojiSelect = useCallback((emoji: string) => {
        setText((prev) => prev + emoji);
    }, []);

    const handleFileAttachmentSelect = useCallback(
        (attachment: FileAttachment) => {
            setFileAttachments((prev) => [...prev, attachment]);
        },
        [],
    );

    const removeFileAttachment = useCallback((index: number) => {
        setFileAttachments((prev) => prev.filter((_, i) => i !== index));
    }, []);

    /**
     * Threads render in the message column rather than beside it: docked in the
     * 320px sidebar a long thread scrolled that column forever, and the reply
     * list's `flex-1 overflow-y-auto` had no bounded height to fill.
     */
    function renderThreadView() {
        return (
            <div className="min-w-0 space-y-4">
                <div className="flex items-center gap-2 border-b border-border/80 pb-3">
                    <Button
                        onClick={onCloseThread}
                        size="sm"
                        title="Back to conversation"
                        type="button"
                        variant="ghost"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex min-w-0 items-center gap-1.5 text-sm">
                        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-semibold">
                            {displayName}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                            &gt;
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                            Thread
                        </span>
                    </div>
                </div>
                <div
                    className="flex min-w-0 flex-col"
                    style={{ height: MESSAGE_LIST_VIEWPORT_HEIGHT }}
                >
                    <ChatThreadContent
                        currentUserId={currentUserId}
                        customEmojis={customEmojis}
                        loading={threadLoading}
                        onReplyTextChange={
                            onSendThreadReply ? setThreadReplyText : undefined
                        }
                        onSendReply={
                            onSendThreadReply
                                ? async () => {
                                      const value = threadReplyText;
                                      setThreadReplyText("");
                                      await onSendThreadReply(value);
                                  }
                                : undefined
                        }
                        onToggleReaction={async (
                            messageId,
                            emoji,
                            isAdding,
                        ) => {
                            await handleToggleReaction(
                                messageId,
                                emoji,
                                isAdding,
                            );
                        }}
                        parentMessage={threadParentSurfaceMessage}
                        replies={threadSurfaceMessages}
                        replyDisabled={readOnly}
                        replyPlaceholder={
                            readOnly ? readOnlyMessage : "Reply in thread"
                        }
                        sendingReply={threadReplySending}
                        replyText={threadReplyText}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="min-w-0 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/80 pb-3">
                {onBack && (
                    <Button onClick={onBack} size="sm" variant="ghost">
                        <ArrowLeft className="size-4" />
                    </Button>
                )}
                <div className="relative">
                    <Avatar
                        alt={displayName}
                        fallback={displayName}
                        framePreset={otherUser?.avatarFramePreset}
                        frameUrl={otherUser?.avatarFrameUrl}
                        size="sm"
                        src={
                            isGroup
                                ? conversation.avatarUrl
                                : otherUser?.avatarUrl
                        }
                    />
                    {!isGroup && otherUser?.status && (
                        <div className="absolute -bottom-0.5 -right-0.5">
                            <StatusIndicator
                                size="sm"
                                status={
                                    otherUser.status as
                                        "online" | "away" | "busy" | "offline"
                                }
                            />
                        </div>
                    )}
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-sm">{displayName}</h3>
                    {subtitle && (
                        <p className="text-muted-foreground text-xs capitalize flex items-center gap-1">
                            {isGroup && <Users className="size-3" />}
                            {subtitle}
                        </p>
                    )}
                    {readOnly ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                            <Lock className="size-3" />
                            Read only
                        </p>
                    ) : null}
                    {encryptionStatus ? (
                        <p
                            className={`mt-1 flex items-center gap-1 text-xs font-medium ${encryptionStatus.className}`}
                        >
                            <Lock className="size-3" />
                            {encryptionStatus.label}
                        </p>
                    ) : null}
                </div>
                <Button
                    aria-label="Pinned messages"
                    onClick={() => setPinnedOpen(true)}
                    size="icon"
                    title="Pinned messages"
                    type="button"
                    variant="ghost"
                >
                    <Pin className="h-4 w-4" />
                </Button>
            </div>

            {readOnly ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
                    <Lock className="mt-0.5 size-4 shrink-0" />
                    <div>
                        <p className="font-medium">Messaging disabled</p>
                        <p className="text-xs text-amber-800/90 dark:text-amber-200/90">
                            {readOnlyMessage}
                        </p>
                    </div>
                </div>
            ) : null}

            <div className="grid gap-4">
                {activeThreadParent && onCloseThread
                    ? renderThreadView()
                    : null}
                <div
                    className={
                        activeThreadParent && onCloseThread
                            ? "hidden"
                            : "min-w-0 space-y-4"
                    }
                >
                    <MentionHelpTooltip />
                    {unreadAnchorMessageId &&
                    (onJumpToUnread || onCatchUpUnread) ? (
                        <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                            <div>
                                <p className="font-medium text-foreground">
                                    Unread activity available
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {unreadSummaryLabel ||
                                        "Jump to the first unread item or catch up from the latest messages."}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {onJumpToUnread ? (
                                    <Button
                                        onClick={onJumpToUnread}
                                        size="sm"
                                        type="button"
                                    >
                                        Jump to unread
                                    </Button>
                                ) : null}
                                {onCatchUpUnread ? (
                                    <Button
                                        onClick={onCatchUpUnread}
                                        size="sm"
                                        type="button"
                                        variant="outline"
                                    >
                                        Catch up
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    <div
                        className="min-w-0 w-full space-y-3 overflow-y-auto p-3"
                        data-message-scroll-container="true"
                        ref={messagesContainerRef}
                        style={{ height: MESSAGE_LIST_VIEWPORT_HEIGHT }}
                    >
                        {loading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div className="flex gap-3" key={i}>
                                        <Skeleton className="size-8 rounded-full" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-32" />
                                            <Skeleton className="h-16 w-full" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center space-y-2 text-center">
                                <MessageSquare className="mb-2 size-12 text-muted-foreground" />
                                <p className="font-medium text-muted-foreground text-sm">
                                    No messages yet
                                </p>
                                <p className="max-w-xs text-muted-foreground/70 text-xs">
                                    Start the conversation! Send a message to
                                    begin chatting.
                                </p>
                            </div>
                        ) : useVirtualScrolling ? (
                            <VirtualizedDMList
                                conversationId={conversation.$id}
                                customEmojis={customEmojis}
                                deleteConfirmId={deleteConfirmId}
                                editingMessageId={editingMessageId}
                                messageDensity={messageDensity}
                                messages={messages}
                                onLoadOlder={onLoadOlder || noop}
                                onOpenImageViewer={handleOpenImageViewer}
                                onOpenProfileModal={onOpenProfileModal || noop}
                                onOpenThread={
                                    onOpenThread
                                        ? handleOpenThreadRow
                                        : undefined
                                }
                                onRemove={handleRemoveRow}
                                onStartEdit={handleStartEditRow}
                                onStartReply={handleStartReplyRow}
                                onTogglePin={
                                    onTogglePinMessage
                                        ? handleTogglePinRow
                                        : undefined
                                }
                                onToggleReaction={handleToggleReactionRow}
                                onUploadCustomEmoji={uploadEmoji}
                                pinnedMessageIds={pinnedMessageIds}
                                setDeleteConfirmId={setDeleteConfirmId}
                                shouldShowLoadOlder={shouldShowLoadOlder}
                                unreadAnchorMessageId={unreadAnchorMessageId}
                                userId={currentUserId}
                                userIdSlice={6}
                            />
                        ) : (
                            <>
                                {shouldShowLoadOlder && onLoadOlder ? (
                                    <div className="flex justify-center pb-4">
                                        <Button
                                            onClick={onLoadOlder}
                                            size="sm"
                                            type="button"
                                            variant="outline"
                                        >
                                            Load older messages
                                        </Button>
                                    </div>
                                ) : null}
                                {messages.map((message) => {
                                    const isMine =
                                        message.senderId === currentUserId;
                                    const isEditing =
                                        editingMessageId === message.$id;
                                    const isDeleting =
                                        deleteConfirmId === message.$id;
                                    const removed = Boolean(message.removedAt);
                                    const isPinned =
                                        Array.isArray(pinnedMessageIds) &&
                                        pinnedMessageIds.includes(message.$id);
                                    const msgDisplayName =
                                        message.senderDisplayName ||
                                        message.senderId;

                                    return (
                                        <div key={message.$id}>
                                            {unreadAnchorMessageId ===
                                            message.$id ? (
                                                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-primary">
                                                    <span className="h-px flex-1 bg-primary/30" />
                                                    First unread
                                                    <span className="h-px flex-1 bg-primary/30" />
                                                </div>
                                            ) : null}
                                            <div
                                                className={`group flex ${
                                                    isEditing
                                                        ? "rounded-lg bg-blue-50 ring-2 ring-blue-500/50 dark:bg-blue-950/20"
                                                        : ""
                                                } ${compactMessages ? "gap-2 p-2" : "gap-3 p-3"}`}
                                                data-message-id={message.$id}
                                            >
                                                <Avatar
                                                    alt={msgDisplayName}
                                                    fallback={msgDisplayName}
                                                    framePreset={
                                                        message.senderAvatarFramePreset
                                                    }
                                                    frameUrl={
                                                        message.senderAvatarFrameUrl
                                                    }
                                                    size="sm"
                                                    src={
                                                        message.senderAvatarUrl
                                                    }
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div
                                                        className={`flex flex-wrap items-baseline gap-2 text-muted-foreground ${
                                                            compactMessages
                                                                ? "text-[11px]"
                                                                : "text-xs"
                                                        }`}
                                                    >
                                                        <span className="font-medium text-foreground">
                                                            {msgDisplayName}
                                                        </span>
                                                        {message.senderPronouns ? (
                                                            <span className="italic">
                                                                (
                                                                {
                                                                    message.senderPronouns
                                                                }
                                                                )
                                                            </span>
                                                        ) : null}
                                                        <span>
                                                            {formatMessageTimestamp(
                                                                message.$createdAt,
                                                            )}
                                                        </span>
                                                        {message.editedAt ? (
                                                            <span className="italic">
                                                                (edited)
                                                            </span>
                                                        ) : null}
                                                        {removed ? (
                                                            <span className="text-destructive">
                                                                (removed)
                                                            </span>
                                                        ) : null}
                                                        {isPinned ? (
                                                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                                <Pin className="h-3 w-3" />
                                                                Pinned
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {message.replyTo ? (
                                                        <div
                                                            className={`mt-1 rounded-lg border-l-2 border-muted-foreground/40 bg-muted/30 ${
                                                                compactMessages
                                                                    ? "px-2 py-1 text-[11px]"
                                                                    : "px-3 py-1.5 text-xs"
                                                            }`}
                                                        >
                                                            <div className="font-medium text-muted-foreground">
                                                                Replying to{" "}
                                                                {message.replyTo
                                                                    .senderDisplayName ||
                                                                    "Unknown"}
                                                            </div>
                                                            <div className="line-clamp-1 text-muted-foreground/80">
                                                                {
                                                                    message
                                                                        .replyTo
                                                                        .text
                                                                }
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                    <div className="flex items-start gap-2">
                                                        <div
                                                            className={`flex-1 wrap-break-word ${
                                                                compactMessages
                                                                    ? "space-y-1 text-xs"
                                                                    : "space-y-2 text-sm"
                                                            }`}
                                                        >
                                                            {message.imageUrl &&
                                                            !removed ? (
                                                                <div className="mt-1">
                                                                    <ImageWithSkeleton
                                                                        alt="Uploaded image"
                                                                        className="block h-auto max-h-96 w-auto max-w-full cursor-pointer rounded-lg transition-opacity hover:opacity-90"
                                                                        onClick={() => {
                                                                            if (
                                                                                message.imageUrl
                                                                            ) {
                                                                                setViewingImage(
                                                                                    {
                                                                                        url: message.imageUrl,
                                                                                        alt: `Image from ${msgDisplayName}`,
                                                                                    },
                                                                                );
                                                                            }
                                                                        }}
                                                                        onKeyDown={(
                                                                            event,
                                                                        ) => {
                                                                            if (
                                                                                event.key ===
                                                                                    "Enter" ||
                                                                                event.key ===
                                                                                    " "
                                                                            ) {
                                                                                event.preventDefault();
                                                                                if (
                                                                                    message.imageUrl
                                                                                ) {
                                                                                    setViewingImage(
                                                                                        {
                                                                                            url: message.imageUrl,
                                                                                            alt: `Image from ${msgDisplayName}`,
                                                                                        },
                                                                                    );
                                                                                }
                                                                            }
                                                                        }}
                                                                        role="button"
                                                                        src={
                                                                            message.imageUrl
                                                                        }
                                                                        tabIndex={
                                                                            0
                                                                        }
                                                                    />
                                                                </div>
                                                            ) : null}
                                                            {message.attachments &&
                                                            message.attachments
                                                                .length > 0 &&
                                                            !removed ? (
                                                                <div className="mt-1 space-y-2">
                                                                    {message.attachments.map(
                                                                        (
                                                                            attachment,
                                                                            index,
                                                                        ) => (
                                                                            <FileAttachmentDisplay
                                                                                key={`${message.$id}-${attachment.fileId}-${index}`}
                                                                                attachment={
                                                                                    attachment
                                                                                }
                                                                            />
                                                                        ),
                                                                    )}
                                                                </div>
                                                            ) : null}
                                                            {removed ? (
                                                                <span className="italic opacity-70">
                                                                    Message
                                                                    removed
                                                                </span>
                                                            ) : message.text ? (
                                                                <div
                                                                    className={
                                                                        compactMessages
                                                                            ? "text-xs"
                                                                            : "text-sm"
                                                                    }
                                                                >
                                                                    <MessageWithMentions
                                                                        currentUserId={
                                                                            currentUserId
                                                                        }
                                                                        customEmojis={
                                                                            customEmojis
                                                                        }
                                                                        knownNames={
                                                                            knownDisplayNames
                                                                        }
                                                                        mentions={
                                                                            message.mentions
                                                                        }
                                                                        text={
                                                                            message.text
                                                                        }
                                                                    />
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                    {!removed &&
                                                    message.reactions &&
                                                    message.reactions.length >
                                                        0 ? (
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {message.reactions.map(
                                                                (reaction) => (
                                                                    <ReactionButton
                                                                        currentUserId={
                                                                            currentUserId
                                                                        }
                                                                        customEmojis={
                                                                            customEmojis
                                                                        }
                                                                        key={
                                                                            reaction.emoji
                                                                        }
                                                                        onToggle={async (
                                                                            emoji,
                                                                            isAdding,
                                                                        ) => {
                                                                            await handleToggleReaction(
                                                                                message.$id,
                                                                                emoji,
                                                                                isAdding,
                                                                            );
                                                                        }}
                                                                        reaction={
                                                                            reaction
                                                                        }
                                                                    />
                                                                ),
                                                            )}
                                                        </div>
                                                    ) : null}
                                                    {typeof message.threadMessageCount ===
                                                        "number" &&
                                                    message.threadMessageCount >
                                                        0 &&
                                                    onOpenThread ? (
                                                        <button
                                                            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                                            onClick={() => {
                                                                void onOpenThread(
                                                                    message,
                                                                );
                                                            }}
                                                            type="button"
                                                        >
                                                            <MessageSquare className="h-3 w-3" />
                                                            {
                                                                message.threadMessageCount
                                                            }{" "}
                                                            {message.threadMessageCount ===
                                                            1
                                                                ? "reply"
                                                                : "replies"}
                                                        </button>
                                                    ) : null}
                                                    {!removed ? (
                                                        <div
                                                            className={`mt-1 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${isMine ? "justify-end" : ""}`}
                                                        >
                                                            <ReactionPicker
                                                                customEmojis={
                                                                    customEmojis
                                                                }
                                                                onSelectEmoji={async (
                                                                    emoji,
                                                                ) => {
                                                                    await handleToggleReaction(
                                                                        message.$id,
                                                                        emoji,
                                                                        true,
                                                                    );
                                                                }}
                                                                onUploadCustomEmoji={
                                                                    uploadEmoji
                                                                }
                                                            />
                                                            <Button
                                                                aria-label="Reply"
                                                                onClick={() =>
                                                                    startReply(
                                                                        message,
                                                                    )
                                                                }
                                                                size="sm"
                                                                type="button"
                                                                variant="ghost"
                                                            >
                                                                <Reply className="h-4 w-4" />
                                                            </Button>
                                                            {onOpenThread ? (
                                                                <Button
                                                                    aria-label="Start thread"
                                                                    onClick={() => {
                                                                        void onOpenThread(
                                                                            message,
                                                                        );
                                                                    }}
                                                                    size="sm"
                                                                    type="button"
                                                                    variant="ghost"
                                                                >
                                                                    <MessageSquare className="h-4 w-4" />
                                                                </Button>
                                                            ) : null}
                                                            {onTogglePinMessage ? (
                                                                <Button
                                                                    aria-label={
                                                                        isPinned
                                                                            ? "Unpin message"
                                                                            : "Pin message"
                                                                    }
                                                                    onClick={() => {
                                                                        void onTogglePinMessage(
                                                                            message,
                                                                        );
                                                                    }}
                                                                    size="sm"
                                                                    type="button"
                                                                    variant="ghost"
                                                                >
                                                                    <Pin
                                                                        className={`h-4 w-4 ${isPinned ? "text-amber-600 dark:text-amber-400" : ""}`}
                                                                    />
                                                                </Button>
                                                            ) : null}
                                                            {isMine ? (
                                                                <>
                                                                    <Button
                                                                        onClick={() =>
                                                                            startEdit(
                                                                                message,
                                                                            )
                                                                        }
                                                                        size="sm"
                                                                        type="button"
                                                                        variant="ghost"
                                                                    >
                                                                        <Pencil className="h-4 w-4" />
                                                                    </Button>
                                                                    {isDeleting ? (
                                                                        <>
                                                                            <Button
                                                                                onClick={() => {
                                                                                    void handleDelete(
                                                                                        message.$id,
                                                                                    );
                                                                                }}
                                                                                size="sm"
                                                                                type="button"
                                                                                variant="destructive"
                                                                            >
                                                                                Confirm
                                                                            </Button>
                                                                            <Button
                                                                                onClick={() => {
                                                                                    setDeleteConfirmId(
                                                                                        null,
                                                                                    );
                                                                                }}
                                                                                size="sm"
                                                                                type="button"
                                                                                variant="ghost"
                                                                            >
                                                                                Cancel
                                                                            </Button>
                                                                        </>
                                                                    ) : (
                                                                        <Button
                                                                            onClick={() => {
                                                                                setDeleteConfirmId(
                                                                                    message.$id,
                                                                                );
                                                                            }}
                                                                            size="sm"
                                                                            type="button"
                                                                            variant="ghost"
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>

                    {typingUserList.length > 0 ? (
                        <div className="flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                            <span
                                aria-hidden="true"
                                className="inline-flex size-2 animate-pulse rounded-full bg-primary"
                            />
                            <span>
                                {typingLabel}{" "}
                                {typingUserList.length > 1 ? "are" : "is"}{" "}
                                typing...
                            </span>
                        </div>
                    ) : null}

                    <>
                        {replyingToMessage ? (
                            <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                                <div className="truncate">
                                    Replying to{" "}
                                    <span className="font-medium">
                                        {replyingToMessage.senderDisplayName ||
                                            "Unknown"}
                                    </span>
                                </div>
                                <Button
                                    onClick={cancelReply}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : null}

                        {editingMessageId ? (
                            <div className="flex items-center justify-between rounded-md border border-blue-200/60 bg-blue-50/60 px-3 py-2 text-sm dark:border-blue-500/40 dark:bg-blue-950/30">
                                <span className="text-blue-700 dark:text-blue-300">
                                    Editing message
                                </span>
                                <Button
                                    onClick={cancelEdit}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : null}

                        <div className="space-y-3 p-2.5">
                            {imagePreview ? (
                                <div className="relative inline-block">
                                    <img
                                        alt="Upload preview"
                                        className="h-32 rounded-lg object-cover"
                                        src={imagePreview}
                                    />
                                    <Button
                                        className="absolute -right-2 -top-2"
                                        onClick={removeImage}
                                        size="icon"
                                        type="button"
                                        variant="destructive"
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </div>
                            ) : null}

                            {fileAttachments.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                    {fileAttachments.map(
                                        (attachment, index) => (
                                            <FilePreview
                                                attachment={attachment}
                                                key={`${attachment.fileId}-${index}`}
                                                onRemove={() => {
                                                    removeFileAttachment(index);
                                                }}
                                            />
                                        ),
                                    )}
                                </div>
                            ) : null}

                            <form
                                className="flex flex-col gap-3 sm:flex-row sm:items-center"
                                onSubmit={(event) => {
                                    void handleSend(event);
                                }}
                            >
                                <input
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageSelect}
                                    ref={fileInputRef}
                                    type="file"
                                />
                                <div className="flex items-center gap-2">
                                    <Button
                                        className="shrink-0"
                                        disabled={
                                            composerDisabled ||
                                            Boolean(editingMessageId)
                                        }
                                        onClick={() => {
                                            fileInputRef.current?.click();
                                        }}
                                        size="icon"
                                        type="button"
                                        variant="outline"
                                    >
                                        <ImageIcon className="size-4" />
                                    </Button>
                                    <FileUploadButton
                                        className="shrink-0"
                                        disabled={
                                            composerDisabled ||
                                            Boolean(editingMessageId)
                                        }
                                        onFileSelect={
                                            handleFileAttachmentSelect
                                        }
                                    />
                                    <GifStickerPicker
                                        disabled={
                                            composerDisabled ||
                                            Boolean(editingMessageId)
                                        }
                                        onSelectAttachment={
                                            handleFileAttachmentSelect
                                        }
                                    />
                                    <EmojiPicker
                                        customEmojis={customEmojis}
                                        onEmojiSelect={handleEmojiSelect}
                                        onUploadCustomEmoji={uploadEmoji}
                                    />
                                </div>
                                <ChatInput
                                    aria-label={
                                        editingMessageId
                                            ? "Edit message"
                                            : "Message"
                                    }
                                    className="flex-1 rounded-lg border-border/60"
                                    disabled={composerDisabled}
                                    onChange={(newValue) => {
                                        setText(newValue);
                                        onTypingChange?.(newValue);
                                    }}
                                    onMentionsChange={undefined}
                                    placeholder={
                                        readOnly
                                            ? readOnlyMessage
                                            : "Type a message..."
                                    }
                                    value={text}
                                />
                                <Button
                                    className="shrink-0 rounded-lg"
                                    disabled={
                                        composerDisabled ||
                                        (!text.trim() &&
                                            !selectedImage &&
                                            fileAttachments.length === 0)
                                    }
                                    type="submit"
                                >
                                    {uploadingImage ? (
                                        <>
                                            <Loader2 className="mr-2 size-4 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        "Send"
                                    )}
                                </Button>
                            </form>
                        </div>
                    </>
                </div>

                <Dialog onOpenChange={setPinnedOpen} open={pinnedOpen}>
                    <DialogContent className="max-w-xl">
                        <DialogHeader>
                            <DialogTitle>Pinned Messages</DialogTitle>
                        </DialogHeader>
                        <ChatPinnedMessagesContent
                            canManageMessages={Boolean(onTogglePinMessage)}
                            messages={pinnedSurfaceMessages}
                            onJumpToMessage={(messageId) => {
                                setPinnedOpen(false);
                                jumpToMessage(messageId);
                            }}
                            onUnpin={
                                onTogglePinMessage
                                    ? async (surfaceMessage) => {
                                          const rawMessage =
                                              pinnedMessages.find(
                                                  (message) =>
                                                      message.$id ===
                                                      surfaceMessage.id,
                                              );
                                          if (rawMessage) {
                                              await onTogglePinMessage(
                                                  rawMessage,
                                              );
                                          }
                                      }
                                    : undefined
                            }
                        />
                    </DialogContent>
                </Dialog>
            </div>
            {viewingImage && (
                <ImageViewer
                    alt={viewingImage.alt}
                    onClose={() => {
                        setViewingImage(null);
                    }}
                    src={viewingImage.url}
                />
            )}
        </div>
    );
}
