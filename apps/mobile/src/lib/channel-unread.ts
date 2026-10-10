/**
 * Mirrors apps/web/src/lib/channel-unread.ts. The two apps share no runtime
 * package, so this is the same rule written twice — see the web copy for why.
 */

/**
 * Whether the viewer has unread messages in a channel.
 *
 * A channel with no read entry has never been opened, so everything since it
 * existed counts as unread.
 */
export function isChannelUnread(params: {
  channelCreatedAt?: string;
  lastMessageAt?: string | null;
  lastReadAt?: string;
}): boolean {
  // No recent message means nothing to be unread about. Channels quiet enough to
  // fall outside the activity window report no lastMessageAt.
  if (!params.lastMessageAt) return false;

  const since = params.lastReadAt ?? params.channelCreatedAt;
  if (!since) return true;

  return params.lastMessageAt > since;
}

type UnreadCandidate = {
  $createdAt?: string;
  $id?: string;
  lastMessageAt?: string | null;
};

/**
 * How many of the given channels have unread messages. A category's counter
 * shows a count of *channels*, not of messages.
 */
export function countUnreadChannels(
  channels: readonly UnreadCandidate[],
  reads: Record<string, string>,
): number {
  let total = 0;
  for (const channel of channels) {
    if (!channel.$id) continue;
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
