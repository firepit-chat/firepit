# Channel unread state

How the app decides that a channel has unread messages, and the deliberate
limits of that decision. Read this before changing any of it — the limits below
are trade-offs, not oversights.

## The model

Read state is **per user, per server**: one `channel_reads` document holding a
`channelId -> lastReadAt` map. It is stored server-side rather than on the channel
because a channel is shared by every member while "read" is personal.

- Collection definition: `scripts/setup-appwrite.ts` (`setupChannelReads`).
- Read/write: `src/lib/channel-read-store.ts`, exposed as `/api/channel-reads`.
- Client: `src/app/chat/hooks/useChannelReads.ts` (web),
  `src/lib/firepit/channel-reads.ts` (mobile).
- The rule itself: `src/lib/channel-unread.ts` (web) and
  `apps/mobile/src/lib/channel-unread.ts` (mobile) — duplicated because the two
  apps share no runtime package.

A channel is unread when:

```
lastMessageAt > (lastReadAt ?? channel.$createdAt)
```

A channel with no `lastReadAt` has never been opened, so everything since it
existed counts as unread. `lastReadAt` only ever moves forward: writes merge by
max, so a stale request cannot rewind progress, and a client clock ahead of the
server is clamped to now.

## The activity window — the important limit

`lastMessageAt` comes from **one bounded query over the server's most recent 300
messages**, not a per-channel lookup:

```ts
// apps/web/src/app/api/channels/route.ts
const RECENT_MESSAGES_WINDOW = 300;
```

Two consequences:

1. **A channel quieter than the window reports no `lastMessageAt` and therefore
   reads as clean.** A channel has to be among the server's ~300 newest messages
   to be considered unread at all.
2. **The channel list costs one extra query**, not one per channel. Raising this
   to per-channel lookups is an N+1 on every sidebar load.

The window is deliberately biased toward _missing_ old unreads rather than
showing an unread badge forever on a dead channel. A channel that has gone quiet
has nothing urgent, and the alternative — an exact count for every channel on
every sidebar load — costs a query per channel.

To make this exact, the shape of the fix is not a bigger constant: it is a
per-channel aggregate (`lastMessageAt` maintained on the channel document, or a
denormalised unread counter updated on message create), at the cost of a write
per message.

## Counters

The category counter in the sidebar counts **channels with unread messages**, not
messages:

```
countUnreadChannels(channels, reads)
```

It renders only when the count is greater than zero. Note this is distinct from
the per-channel badge, which comes from the inbox and counts **mentions and
thread replies** — see `channelUnreadStateById` in `src/app/chat/page.tsx`.
Ordinary channel messages never create inbox items, so the two numbers
deliberately do not agree.

## Failure behaviour

Read state is cosmetic, so it is never allowed to become a load problem:

- **GET never fails.** Any error — including a missing collection — returns `200`
  with an empty map, so the counters simply stay hidden. The client does not
  retry it.
- **PUT reports availability.** `503` with `channelReadsAvailable: false` means the
  collection or its `reads` attribute is missing. The client latches off for the
  rest of the session. Any other failure returns `500` with
  `channelReadsAvailable: true`, which triggers exponential backoff up to 30s
  rather than disabling the feature.
- **The mark-read effect is guarded by a ref, not the server response.** It
  records what it attempted, so a burst of renders or messages costs one request.
  Guarding on the stored value alone is not safe: the value only updates after
  the server confirms, so a failing endpoint would be re-fired on every render.
  This actually happened — it produced a request storm and 429s.
- **Collection-missing detection cannot use configuration.** `appwrite-core`
  resolves every collection name to a default string, so `collections.channelReads`
  is truthy even when the collection does not exist. Availability is detected from
  the Appwrite error (`collection_not_found` / `attribute_not_found`) instead.

## Gotchas

- `lastMessageAt` is only on the channels list response. Any other channel
  payload will not carry it and will read as clean.
- Until `bun run setup` has created the collection, reads come back empty and
  every counter stays hidden. That is the intended failure mode — no crash, no
  false "everything is read" badges.
- `reads` is a JSON string capped at ~65KB, roughly 1000 channels per server.
  Beyond that a server needs a different storage shape.
