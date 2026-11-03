/**
 * Whether the viewer has unread messages in a channel.
 *
 * Read state is a channelId -> lastReadAt map owned by the viewer; a channel
 * with no entry has never been opened, so everything since it existed counts as
 * unread.
 */
export function isChannelUnread(params: {
    channelCreatedAt: string;
    lastMessageAt?: string;
    lastReadAt?: string;
}): boolean {
    // No recent messages means nothing to be unread about. Channels quiet
    // enough to fall outside the activity window report no lastMessageAt.
    if (!params.lastMessageAt) {
        return false;
    }

    const since = params.lastReadAt ?? params.channelCreatedAt;
    if (!since) {
        return true;
    }

    return params.lastMessageAt > since;
}

type UnreadCandidate = {
    $createdAt: string;
    $id: string;
    lastMessageAt?: string;
};

/**
 * How many of the given channels the viewer has unread messages in. This is
 * what a category's counter shows: a count of *channels*, not of messages.
 */
export function countUnreadChannels(
    channels: readonly UnreadCandidate[],
    reads: Record<string, string>,
): number {
    let total = 0;
    for (const channel of channels) {
        if (
            isChannelUnread({
                channelCreatedAt: channel.$createdAt,
                lastMessageAt: channel.lastMessageAt,
                lastReadAt: reads[channel.$id],
            })
        ) {
            total += 1;
        }
    }
    return total;
}
