import { countUnreadChannels, isChannelUnread } from "@/lib/channel-unread";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const CREATED = "2026-01-01T00:00:00.000Z";
const MESSAGE = "2026-01-02T00:00:00.000Z";

if (import.meta.main) {
  // --- unread when a newer message arrived ---
  assert(
    isChannelUnread({
      channelCreatedAt: CREATED,
      lastMessageAt: MESSAGE,
      lastReadAt: "2026-01-01T12:00:00.000Z",
    }),
    "newer message is unread",
  );

  // --- read once the read time catches up ---
  assert(
    !isChannelUnread({
      channelCreatedAt: CREATED,
      lastMessageAt: MESSAGE,
      lastReadAt: MESSAGE,
    }),
    "equal read time is read",
  );

  // --- never-read channel counts as unread back to its creation ---
  assert(
    isChannelUnread({ channelCreatedAt: CREATED, lastMessageAt: MESSAGE }),
    "never-read channel is unread",
  );

  // --- no recent message is never unread ---
  assert(
    !isChannelUnread({ channelCreatedAt: CREATED }),
    "no lastMessageAt is not unread",
  );
  assert(
    !isChannelUnread({
      channelCreatedAt: CREATED,
      lastMessageAt: null,
      lastReadAt: "2026-01-01T12:00:00.000Z",
    }),
    "null lastMessageAt is not unread",
  );

  // --- the counter counts channels, not messages ---
  const channels = [
    { $createdAt: CREATED, $id: "a", lastMessageAt: MESSAGE },
    { $createdAt: CREATED, $id: "b", lastMessageAt: MESSAGE },
    { $createdAt: CREATED, $id: "c", lastMessageAt: MESSAGE },
    { $createdAt: CREATED, $id: "d" },
  ];
  assert(countUnreadChannels(channels, {}) === 3, "all unread = 3");
  assert(
    countUnreadChannels(channels, {
      a: "2026-01-06T00:00:00.000Z",
      c: "2026-01-06T00:00:00.000Z",
    }) === 1,
    "partially read = 1",
  );
  assert(
    countUnreadChannels(channels, {
      a: "2026-01-06T00:00:00.000Z",
      b: "2026-01-06T00:00:00.000Z",
      c: "2026-01-06T00:00:00.000Z",
      d: "2026-01-06T00:00:00.000Z",
    }) === 0,
    "all read = 0, which hides the counter",
  );
  assert(countUnreadChannels([], {}) === 0, "empty category = 0");

  // --- the per-channel dot must agree with the category counter ---
  // The sidebar dot and the category badge both come from this rule. If they
  // ever disagreed, a category could show a count with no channel explaining
  // it, which is what the dot was added to prevent.
  const readStates: Record<string, string>[] = [
    {},
    { a: "2026-01-06T00:00:00.000Z" },
    { a: "2026-01-06T00:00:00.000Z", c: "2026-01-06T00:00:00.000Z" },
  ];
  for (const reads of readStates) {
    const counter = countUnreadChannels(channels, reads);
    const dotted = channels.filter((c) =>
      isChannelUnread({
        channelCreatedAt: c.$createdAt,
        lastMessageAt: c.lastMessageAt,
        lastReadAt: reads[c.$id],
      }),
    ).length;
    assert(
      counter === dotted,
      `dot count ${String(dotted)} matches counter ${String(counter)}`,
    );
  }

  console.log("channel-unread.test.ts: all assertions passed");
}
