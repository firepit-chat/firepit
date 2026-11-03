"use client";

import type { Route } from "next";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInbox } from "@/app/chat/hooks/useInbox";
import { useServers } from "@/app/chat/hooks/useServers";
import { useUnreadChannels } from "@/app/notifications/useUnreadChannels";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildChatMessageHref } from "@/lib/message-navigation";
import { Bell, Hash, Inbox } from "lucide-react";

function formatRelativeTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "Recent";
    }

    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

type NotificationsMenuProps = {
    userId: string | null;
};

export function NotificationsMenu({ userId }: NotificationsMenuProps) {
    const router = useRouter();
    const inboxApi = useInbox(userId);
    // Channel unreads cost a read plus a channel list per server, so they are
    // only fetched once the popup is opened rather than on every page load.
    const [open, setOpen] = useState(false);
    const membershipEnabled = Boolean(
        process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
    );
    const serversApi = useServers({ membershipEnabled, userId });
    const { loading: channelsLoading, unreadChannels } = useUnreadChannels(
        serversApi.servers,
        { enabled: open },
    );
    const recentItems = useMemo(
        () => inboxApi.items.slice(0, 5),
        [inboxApi.items],
    );
    const unreadChannelsPreview = useMemo(
        () => unreadChannels.slice(0, 3),
        [unreadChannels],
    );
    const unreadCount = inboxApi.unreadCount;

    return (
        <DropdownMenu onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    aria-label="Open notifications"
                    className="relative rounded-lg"
                    variant="outline"
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 ? (
                        <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1.5 text-[10px] leading-none">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                    ) : null}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-[24rem] max-w-[calc(100vw-1rem)] rounded-xl border border-border/60 bg-card/95 p-2 shadow-lg"
            >
                <div className="px-3 py-2">
                    <p className="text-sm font-semibold text-foreground">
                        Recent notifications
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Jump into unread mentions, DMs, and thread activity.
                    </p>
                </div>

                <DropdownMenuSeparator />

                <div className="px-3 pb-1 pt-0.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Unread channels
                    </p>
                </div>

                {open && channelsLoading ? (
                    <div className="space-y-2 px-3 py-2 text-sm text-muted-foreground">
                        Loading unread channels...
                    </div>
                ) : unreadChannelsPreview.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                        {open
                            ? "No channels with unread messages."
                            : "Open to check for unread channels."}
                    </div>
                ) : (
                    <div className="space-y-1 px-1 py-1">
                        {unreadChannelsPreview.map(({ channel, serverId }) => (
                            <DropdownMenuItem
                                className="cursor-pointer rounded-md"
                                key={`${serverId}:${channel.$id}`}
                                onSelect={() => {
                                    router.push(
                                        `/chat?server=${encodeURIComponent(
                                            serverId,
                                        )}&channel=${encodeURIComponent(
                                            channel.$id,
                                        )}` as Route,
                                    );
                                }}
                            >
                                <Hash
                                    aria-hidden="true"
                                    className="mr-2 size-3.5 shrink-0 text-primary"
                                />
                                <span className="min-w-0 flex-1 truncate text-sm">
                                    {channel.name}
                                </span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                    {formatRelativeTime(
                                        channel.lastMessageAt ??
                                            channel.$createdAt,
                                    )}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </div>
                )}

                <DropdownMenuSeparator />

                {inboxApi.loading ? (
                    <div className="space-y-2 px-3 py-2 text-sm text-muted-foreground">
                        Loading recent notifications...
                    </div>
                ) : recentItems.length === 0 ? (
                    <div className="space-y-2 px-3 py-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2 text-foreground">
                            <Inbox className="h-4 w-4 text-primary" />
                            {unreadChannels.length > 0
                                ? "No mentions or DMs"
                                : "All caught up"}
                        </div>
                        <p>
                            {unreadChannels.length > 0
                                ? "No recent unread mentions, DMs, or thread activity."
                                : "No recent unread notifications found."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-1 px-1 py-1">
                        {recentItems.map((item) => (
                            <DropdownMenuItem
                                className="cursor-pointer rounded-md p-0"
                                key={item.id}
                                onSelect={() => {
                                    const destination =
                                        item.contextKind === "channel"
                                            ? {
                                                  kind: "channel" as const,
                                                  channelId: item.contextId,
                                                  messageId: item.messageId,
                                                  serverId: item.serverId,
                                              }
                                            : {
                                                  kind: "dm" as const,
                                                  conversationId:
                                                      item.contextId,
                                                  messageId: item.messageId,
                                              };
                                    const href = buildChatMessageHref(
                                        destination,
                                        { entry: "unread" },
                                    );
                                    router.push(href as Route);
                                }}
                            >
                                <div className="flex w-full items-start gap-3 px-2 py-2 text-left">
                                    <Avatar
                                        alt={item.authorLabel}
                                        fallback={item.authorLabel}
                                        size="sm"
                                        src={item.authorAvatarUrl}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {item.authorLabel}
                                            </p>
                                            <span className="text-[11px] text-muted-foreground">
                                                {formatRelativeTime(
                                                    item.latestActivityAt,
                                                )}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground">
                                            <span>
                                                {item.kind === "mention"
                                                    ? "Mention"
                                                    : "Thread"}
                                            </span>
                                            <span>
                                                {item.contextKind === "channel"
                                                    ? "Channel"
                                                    : "Direct message"}
                                            </span>
                                            {item.muted ? (
                                                <span>Muted</span>
                                            ) : null}
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                            {item.previewText}
                                        </p>
                                    </div>
                                </div>
                            </DropdownMenuItem>
                        ))}
                    </div>
                )}

                <DropdownMenuSeparator />

                <div className="grid gap-2 px-3 py-2">
                    <Button asChild className="w-full rounded-lg" size="sm">
                        <Link href="/notifications">
                            Open notification center
                        </Link>
                    </Button>
                    <Button
                        asChild
                        className="w-full rounded-lg"
                        size="sm"
                        variant="outline"
                    >
                        <Link href={"/settings/notifications" as Route}>
                            Manage notification controls
                        </Link>
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
