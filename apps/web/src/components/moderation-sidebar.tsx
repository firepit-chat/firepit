"use client";

import Link from "next/link";
import { Hash } from "lucide-react";
import { useMemo } from "react";
import type { Route } from "next";
import type { Channel, Server } from "@/lib/types";
import { useChannels } from "@/app/chat/hooks/useChannels";
import { useCategories } from "@/app/chat/hooks/useCategories";

function sortSidebarChannels(channels: Channel[]) {
    return [...channels].sort((left, right) => {
        const leftPosition = left.position ?? 0;
        const rightPosition = right.position ?? 0;
        if (leftPosition !== rightPosition) {
            return leftPosition - rightPosition;
        }

        return left.name.localeCompare(right.name);
    });
}

function serverHref(serverId: string, channelId?: string): Route {
    return channelId
        ? (`/moderation?serverId=${encodeURIComponent(serverId)}&channelId=${encodeURIComponent(channelId)}` as Route)
        : (`/moderation?serverId=${encodeURIComponent(serverId)}` as Route);
}

export function ModerationSidebar({
    servers,
    selectedServerId,
    selectedChannelId,
    userId,
}: {
    servers: Server[];
    selectedServerId: string;
    selectedChannelId?: string;
    userId: string;
}) {
    const channelsApi = useChannels({
        selectedServer: selectedServerId,
        userId,
        servers,
    });
    const categoriesApi = useCategories(selectedServerId);

    const groupedChannels = useMemo(() => {
        const categories = [...categoriesApi.categories].sort((left, right) => {
            if (left.position !== right.position) {
                return left.position - right.position;
            }
            return left.name.localeCompare(right.name);
        });

        return categories.map((category) => ({
            category,
            channels: sortSidebarChannels(
                channelsApi.channels.filter(
                    (channel) => channel.categoryId === category.$id,
                ),
            ),
        }));
    }, [categoriesApi.categories, channelsApi.channels]);

    const uncategorizedChannels = useMemo(
        () =>
            sortSidebarChannels(
                channelsApi.channels.filter((channel) => !channel.categoryId),
            ),
        [channelsApi.channels],
    );

    return (
        <aside className="h-fit rounded-3xl border border-border/60 bg-card/80 p-4 shadow-xl backdrop-blur-sm lg:sticky lg:top-8">
            <form className="space-y-1" method="get">
                <label
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    htmlFor="serverId"
                >
                    Server
                </label>
                <select
                    className="w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    defaultValue={selectedServerId}
                    id="serverId"
                    name="serverId"
                    onChange={(event) => event.currentTarget.form?.requestSubmit()}
                >
                    {servers.map((server) => (
                        <option key={server.$id} value={server.$id}>
                            {server.name}
                        </option>
                    ))}
                </select>
            </form>

            <nav className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
                {groupedChannels.map(({ category, channels }) => (
                    <div key={category.$id}>
                        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                            {category.name}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                            {channels.map((channel) => (
                                <ChannelLink
                                    key={channel.$id}
                                    channel={channel}
                                    href={serverHref(
                                        selectedServerId,
                                        channel.$id,
                                    )}
                                    selected={
                                        channel.$id === selectedChannelId
                                    }
                                />
                            ))}
                        </ul>
                    </div>
                ))}

                {uncategorizedChannels.length > 0 && (
                    <ul className="space-y-0.5">
                        {uncategorizedChannels.map((channel) => (
                            <ChannelLink
                                key={channel.$id}
                                channel={channel}
                                href={serverHref(selectedServerId, channel.$id)}
                                selected={channel.$id === selectedChannelId}
                            />
                        ))}
                    </ul>
                )}

                {channelsApi.cursor && (
                    <button
                        className="mt-2 w-full rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                        onClick={channelsApi.loadMore}
                        type="button"
                    >
                        {channelsApi.loading ? "Loading..." : "Load more"}
                    </button>
                )}
            </nav>
        </aside>
    );
}

function ChannelLink({
    channel,
    href,
    selected,
}: {
    channel: Channel;
    href: Route;
    selected: boolean;
}) {
    return (
        <li>
            <Link
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${
                    selected
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                href={href}
            >
                <Hash className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{channel.name}</span>
            </Link>
        </li>
    );
}