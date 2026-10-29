"use client";

import { useCallback, useMemo, useState } from "react";
import {
    BellOff,
    Check,
    Clock3,
    Loader2,
    MessageSquare,
    MoreVertical,
    Plus,
    UserMinus,
    Users,
    X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/status-indicator";
import { useStatusSubscription } from "@/app/chat/hooks/useStatusSubscription";
import { presenceText } from "@/app/chat/components/presence-label";
import { useFriends } from "@/hooks/useFriends";
import { getOrCreateConversation } from "@/lib/appwrite-dms-client";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatListTimestamp } from "@/lib/chat-dates";
import type {
    Conversation,
    InboxListResponse,
    PresenceStatus,
} from "@/lib/types";
import { toast } from "sonner";

type ConversationUnreadState = {
    count: number;
    muted: boolean;
};

type ConversationListProps = {
    conversations: Conversation[];
    currentUserId?: string;
    loading: boolean;
    selectedConversationId: string | null;
    onConversationCreated?: (conversation: Conversation) => void;
    onSelectConversation: (conversation: Conversation) => void;
    onNewConversation: () => void;
    onMuteConversation?: (
        conversationId: string,
        conversationName: string,
    ) => void;
    inboxContractVersion?: InboxListResponse["contractVersion"];
    conversationUnreadStateById?: Record<string, ConversationUnreadState>;
};

export function ConversationList({
    conversations,
    currentUserId,
    loading,
    selectedConversationId,
    onConversationCreated,
    onSelectConversation,
    onNewConversation,
    onMuteConversation,
    inboxContractVersion = "thread_v1",
    conversationUnreadStateById = {},
}: ConversationListProps) {
    const {
        friends,
        incoming,
        loading: friendsLoading,
        actionLoading,
        acceptFriendRequest,
        declineFriendRequest,
        removeFriendship,
    } = useFriends(Boolean(currentUserId));
    const [openingConversationUserId, setOpeningConversationUserId] = useState<
        string | null
    >(null);
    const isMessageContract = inboxContractVersion === "message_v2";

    const getConversationUnreadCount = useCallback(
        (conversation: Conversation) => {
            const inboxCount =
                conversationUnreadStateById[conversation.$id]?.count;
            if (typeof inboxCount === "number") {
                return inboxCount;
            }

            if (isMessageContract) {
                return 0;
            }

            return conversation.unreadThreadCount ?? 0;
        },
        [conversationUnreadStateById, isMessageContract],
    );

    const favoriteFriends = useMemo(() => friends.slice(0, 4), [friends]);
    const favoriteFriendIds = useMemo(
        () => new Set(favoriteFriends.map((f) => f.user.userId)),
        [favoriteFriends],
    );
    const filteredConversations = useMemo(
        () =>
            conversations.filter((conversation) => {
                if (conversation.isSystemAnnouncementThread) {
                    return true;
                }

                if (conversation.isGroup) {
                    return true;
                }
                const otherUserId = conversation.otherUser?.userId;
                return !otherUserId || !favoriteFriendIds.has(otherUserId);
            }),
        [conversations, favoriteFriendIds],
    );
    const incomingRequests = useMemo(() => incoming.slice(0, 3), [incoming]);

    // Friends rows are rendered from the friendship list, which carries no
    // activity or presence. Both already exist on the loaded conversations, so
    // index them by the other user and reuse that rather than a second fetch.
    const conversationByUserId = useMemo(() => {
        const byUserId = new Map<string, Conversation>();
        for (const conversation of conversations) {
            const otherUserId = conversation.otherUser?.userId;
            if (otherUserId) {
                byUserId.set(otherUserId, conversation);
            }
        }
        return byUserId;
    }, [conversations]);

    // Friends are excluded from the rows below, so they need their own presence
    // subscription to show a status dot.
    const friendUserIds = useMemo(
        () => favoriteFriends.map((entry) => entry.user.userId),
        [favoriteFriends],
    );
    const { statuses: friendStatuses } = useStatusSubscription(friendUserIds);
    const unreadConversations = useMemo(
        () =>
            filteredConversations.filter(
                (conversation) => getConversationUnreadCount(conversation) > 0,
            ),
        [filteredConversations, getConversationUnreadCount],
    );
    const activeConversationList =
        unreadConversations.length > 0
            ? unreadConversations
            : filteredConversations;

    function renderUnreadBadge(count: number | undefined, muted = false) {
        if (!count || count <= 0) {
            return null;
        }

        return (
            <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    muted
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary text-primary-foreground"
                }`}
            >
                {count}
            </span>
        );
    }

    function renderConversationRow(conversation: Conversation) {
        const isSelected = conversation.$id === selectedConversationId;
        const isGroup =
            conversation.isGroup ||
            (conversation.participants?.length ?? 0) > 2;
        const otherUser = conversation.otherUser;
        const participantCount =
            conversation.participantCount ?? conversation.participants.length;
        const displayName = isGroup
            ? conversation.name || "Group DM"
            : otherUser?.displayName || otherUser?.userId || "Unknown User";
        const subtitle = isGroup
            ? `${participantCount} participants`
            : presenceText(otherUser?.status, otherUser?.statusMessage);
        const secondaryLine = conversation.readOnly
            ? conversation.readOnlyReason || "Read only"
            : conversation.lastMessage?.text || subtitle;
        const unreadState = conversationUnreadStateById[conversation.$id];
        const unreadCount =
            unreadState?.count ?? getConversationUnreadCount(conversation);
        const secondaryLineClassName = conversation.readOnly
            ? "truncate text-amber-700 dark:text-amber-300 text-xs"
            : "truncate text-muted-foreground text-xs";

        return (
            <div
                className="group relative flex min-w-0 items-center gap-1"
                key={conversation.$id}
            >
                <button
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                        isSelected ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                    onClick={() => onSelectConversation(conversation)}
                    type="button"
                >
                    <div className="relative">
                        <Avatar
                            alt={displayName}
                            fallback={displayName}
                            framePreset={otherUser?.avatarFramePreset}
                            frameUrl={otherUser?.avatarFrameUrl}
                            size="md"
                            src={
                                isGroup
                                    ? conversation.avatarUrl
                                    : otherUser?.avatarUrl
                            }
                        />
                        {!isGroup && (
                            <div className="absolute -bottom-0.5 -right-0.5">
                                <StatusIndicator
                                    size="sm"
                                    // Falls back to offline so a 1:1 always shows
                                    // a dot. It used to render only when a status
                                    // was present, which hid it entirely for
                                    // auto-set and not-yet-loaded statuses —
                                    // exactly the people you most want to spot.
                                    status={
                                        (otherUser?.status ??
                                            "offline") as PresenceStatus
                                    }
                                />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate font-medium text-sm">
                                    {displayName}
                                </p>
                                {renderUnreadBadge(
                                    unreadCount,
                                    unreadState?.muted ?? false,
                                )}
                            </div>
                            {conversation.lastMessageAt && (
                                <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground text-xs">
                                    {formatListTimestamp(
                                        conversation.lastMessageAt,
                                    )}
                                </span>
                            )}
                        </div>
                        {secondaryLine && (
                            <p className={secondaryLineClassName}>
                                {secondaryLine}
                            </p>
                        )}
                    </div>
                </button>
                {onMuteConversation && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                                size="icon"
                                type="button"
                                variant="ghost"
                            >
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">
                                    Conversation options
                                </span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={() =>
                                    onMuteConversation(
                                        conversation.$id,
                                        displayName,
                                    )
                                }
                            >
                                <BellOff className="mr-2 h-4 w-4" />
                                Mute Conversation
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        );
    }

    async function handleOpenFriendConversation(friendUserId: string) {
        if (!currentUserId) {
            return;
        }

        const existingConversation = conversations.find((conversation) => {
            if (conversation.isGroup) {
                return false;
            }

            return conversation.otherUser?.userId === friendUserId;
        });

        if (existingConversation) {
            onSelectConversation(existingConversation);
            return;
        }

        setOpeningConversationUserId(friendUserId);
        try {
            const conversation = await getOrCreateConversation(
                currentUserId,
                friendUserId,
            );
            if (onConversationCreated) {
                onConversationCreated(conversation);
                return;
            }

            onSelectConversation(conversation);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to start direct message",
            );
        } finally {
            setOpeningConversationUserId(null);
        }
    }

    async function handleAction(
        action: () => Promise<boolean>,
        successMessage: string,
    ) {
        const succeeded = await action();
        if (succeeded) {
            toast.success(successMessage);
        }
    }

    if (loading) {
        return (
            <div className="space-y-2 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div className="flex items-center gap-3 p-2" key={i}>
                        <Skeleton className="size-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-border border-b p-3">
                <h3 className="flex items-center gap-2 font-semibold text-sm">
                    <MessageSquare className="size-4" />
                    Direct Messages
                </h3>
                <Button
                    onClick={onNewConversation}
                    size="sm"
                    title="New conversation"
                    variant="ghost"
                >
                    <Plus className="size-4" />
                </Button>
            </div>

            <div className="min-w-0 flex-1 overflow-y-auto">
                {currentUserId &&
                (friendsLoading ||
                    incomingRequests.length > 0 ||
                    favoriteFriends.length > 0) ? (
                    <div className="space-y-4 border-border/60 border-b p-3">
                        {incomingRequests.length > 0 ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                    <Clock3 className="size-3.5" />
                                    Pending Requests
                                </div>
                                <div className="space-y-2">
                                    {incomingRequests.map((entry) => {
                                        const displayName =
                                            entry.user.displayName ??
                                            entry.user.userId;

                                        return (
                                            <div
                                                className="rounded-md border border-border/60 bg-background/60 p-2"
                                                key={entry.friendship.$id}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Avatar
                                                        alt={displayName}
                                                        fallback={displayName}
                                                        framePreset={
                                                            entry.user
                                                                .avatarFramePreset
                                                        }
                                                        frameUrl={
                                                            entry.user
                                                                .avatarFrameUrl
                                                        }
                                                        size="sm"
                                                        src={
                                                            entry.user.avatarUrl
                                                        }
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">
                                                            {displayName}
                                                        </p>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            wants to connect
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="mt-2 flex gap-2">
                                                    <Button
                                                        className="flex-1"
                                                        disabled={
                                                            actionLoading ===
                                                            `accept:${entry.user.userId}`
                                                        }
                                                        onClick={() =>
                                                            void handleAction(
                                                                () =>
                                                                    acceptFriendRequest(
                                                                        entry
                                                                            .user
                                                                            .userId,
                                                                    ),
                                                                `You are now friends with ${displayName}`,
                                                            )
                                                        }
                                                        size="sm"
                                                        type="button"
                                                    >
                                                        <Check className="mr-2 size-3.5" />
                                                        Accept
                                                    </Button>
                                                    <Button
                                                        className="flex-1"
                                                        disabled={
                                                            actionLoading ===
                                                            `decline:${entry.user.userId}`
                                                        }
                                                        onClick={() =>
                                                            void handleAction(
                                                                () =>
                                                                    declineFriendRequest(
                                                                        entry
                                                                            .user
                                                                            .userId,
                                                                    ),
                                                                `Declined request from ${displayName}`,
                                                            )
                                                        }
                                                        size="sm"
                                                        type="button"
                                                        variant="outline"
                                                    >
                                                        <X className="mr-2 size-3.5" />
                                                        Decline
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                <Users className="size-3.5" />
                                Friends
                            </div>
                            {friendsLoading ? (
                                <div className="space-y-2">
                                    {Array.from({ length: 2 }).map(
                                        (_, index) => (
                                            <div
                                                className="flex items-center gap-2"
                                                key={index}
                                            >
                                                <Skeleton className="size-8 rounded-full" />
                                                <Skeleton className="h-4 flex-1" />
                                            </div>
                                        ),
                                    )}
                                </div>
                            ) : favoriteFriends.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    Add friends from profiles or search to keep
                                    them close.
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {favoriteFriends.map((entry) => {
                                        const displayName =
                                            entry.user.displayName ??
                                            entry.user.userId;
                                        const isOpening =
                                            openingConversationUserId ===
                                            entry.user.userId;
                                        const friendConversation =
                                            conversationByUserId.get(
                                                entry.user.userId,
                                            );
                                        const lastMessageAt =
                                            friendConversation?.lastMessageAt;
                                        // Falls back to offline so a friend always
                                        // shows a dot, matching the DM rows.
                                        const friendStatus =
                                            (friendStatuses.get(
                                                entry.user.userId,
                                            )?.status ??
                                                friendConversation?.otherUser
                                                    ?.status ??
                                                "offline") as PresenceStatus;
                                        const friendUnreadState =
                                            friendConversation
                                                ? conversationUnreadStateById[
                                                      friendConversation.$id
                                                  ]
                                                : undefined;
                                        const friendUnreadCount =
                                            friendUnreadState?.count ??
                                            (friendConversation
                                                ? getConversationUnreadCount(
                                                      friendConversation,
                                                  )
                                                : 0);
                                        const friendMuted =
                                            friendUnreadState?.muted ?? false;
                                        // Custom status text when set, otherwise
                                        // the plain presence word, matching a DM row.
                                        const friendPresenceText = presenceText(
                                            friendStatuses.get(
                                                entry.user.userId,
                                            )?.status ??
                                                friendConversation?.otherUser
                                                    ?.status,
                                            friendStatuses.get(
                                                entry.user.userId,
                                            )?.customMessage ??
                                                friendConversation?.otherUser
                                                    ?.statusMessage,
                                        );

                                        return (
                                            <div
                                                className="group relative flex min-w-0 items-center gap-1"
                                                key={entry.friendship.$id}
                                            >
                                                <button
                                                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-accent/50"
                                                    onClick={() =>
                                                        void handleOpenFriendConversation(
                                                            entry.user.userId,
                                                        )
                                                    }
                                                    type="button"
                                                >
                                                    <div className="relative">
                                                        <Avatar
                                                            alt={displayName}
                                                            fallback={
                                                                displayName
                                                            }
                                                            framePreset={
                                                                entry.user
                                                                    .avatarFramePreset
                                                            }
                                                            frameUrl={
                                                                entry.user
                                                                    .avatarFrameUrl
                                                            }
                                                            size="sm"
                                                            src={
                                                                entry.user
                                                                    .avatarUrl
                                                            }
                                                        />
                                                        <div className="absolute -bottom-0.5 -right-0.5">
                                                            <StatusIndicator
                                                                size="sm"
                                                                status={
                                                                    friendStatus
                                                                }
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex min-w-0 items-center justify-between gap-2">
                                                            <div className="flex min-w-0 items-center gap-2">
                                                                <p className="truncate text-sm font-medium">
                                                                    {
                                                                        displayName
                                                                    }
                                                                </p>
                                                                {renderUnreadBadge(
                                                                    friendUnreadCount,
                                                                    friendMuted,
                                                                )}
                                                            </div>
                                                            {lastMessageAt ? (
                                                                <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground text-xs">
                                                                    {formatListTimestamp(
                                                                        lastMessageAt,
                                                                    )}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        {/* Status rather than pronouns, so a friend row and a DM row carry the same
                                                            information. */}
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {friendPresenceText}
                                                        </p>
                                                    </div>
                                                    {isOpening ? (
                                                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                                    ) : null}
                                                </button>
                                                {/* One menu per row, as on the DM
                                                    rows below, so the timestamp
                                                    column lines up. Remove used to
                                                    be a second button here, which
                                                    held a permanent 32px slot even
                                                    while invisible and pushed every
                                                    friend date left of the DM
                                                    dates. */}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        asChild
                                                    >
                                                        <Button
                                                            aria-label={`Options for ${displayName}`}
                                                            className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                                                            size="icon"
                                                            type="button"
                                                            variant="ghost"
                                                        >
                                                            <MoreVertical className="h-4 w-4" />
                                                            <span className="sr-only">
                                                                Options for{" "}
                                                                {displayName}
                                                            </span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        {friendConversation &&
                                                        onMuteConversation ? (
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    onMuteConversation(
                                                                        friendConversation.$id,
                                                                        displayName,
                                                                    )
                                                                }
                                                            >
                                                                <BellOff className="mr-2 h-4 w-4" />
                                                                Mute
                                                                Conversation
                                                            </DropdownMenuItem>
                                                        ) : null}
                                                        <DropdownMenuItem
                                                            disabled={
                                                                actionLoading ===
                                                                `remove:${entry.user.userId}`
                                                            }
                                                            onClick={() =>
                                                                void handleAction(
                                                                    () =>
                                                                        removeFriendship(
                                                                            entry
                                                                                .user
                                                                                .userId,
                                                                        ),
                                                                    `Removed ${displayName} from friends`,
                                                                )
                                                            }
                                                        >
                                                            <UserMinus className="mr-2 h-4 w-4" />
                                                            Remove {displayName}{" "}
                                                            from friends
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}

                {activeConversationList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                        <MessageSquare className="mb-2 size-8 text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">
                            No conversations yet
                        </p>
                        <Button
                            className="mt-3"
                            onClick={onNewConversation}
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            Start a conversation
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-1 p-2">
                        {activeConversationList.map((conversation) =>
                            renderConversationRow(conversation),
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
