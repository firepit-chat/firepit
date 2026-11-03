import { describe, expect, it } from "vitest";
import { countUnreadChannels, isChannelUnread } from "@/lib/channel-unread";

describe("channel unread", () => {
    it("counts a channel whose newest message is newer than the read time", () => {
        expect(
            isChannelUnread({
                channelCreatedAt: "2026-01-01T00:00:00.000Z",
                lastMessageAt: "2026-01-02T00:00:00.000Z",
                lastReadAt: "2026-01-01T12:00:00.000Z",
            }),
        ).toBe(true);
    });

    it("is read once the read time catches up", () => {
        expect(
            isChannelUnread({
                channelCreatedAt: "2026-01-01T00:00:00.000Z",
                lastMessageAt: "2026-01-02T00:00:00.000Z",
                lastReadAt: "2026-01-02T00:00:00.000Z",
            }),
        ).toBe(false);
    });

    // A channel nobody has opened has no read entry, so everything since it
    // existed is unread rather than silently clean.
    it("treats a never-read channel as unread back to its creation", () => {
        expect(
            isChannelUnread({
                channelCreatedAt: "2026-01-01T00:00:00.000Z",
                lastMessageAt: "2026-01-02T00:00:00.000Z",
            }),
        ).toBe(true);
    });

    // Channels outside the activity window report no lastMessageAt. Showing them
    // unread forever would be worse than showing them clean.
    it("is never unread without a recent message", () => {
        expect(
            isChannelUnread({
                channelCreatedAt: "2026-01-01T00:00:00.000Z",
                lastReadAt: undefined,
            }),
        ).toBe(false);
    });

    it("counts channels, not messages", () => {
        const channels = [
            {
                $createdAt: "2026-01-01T00:00:00.000Z",
                $id: "a",
                lastMessageAt: "2026-01-05T00:00:00.000Z",
            },
            {
                $createdAt: "2026-01-01T00:00:00.000Z",
                $id: "b",
                lastMessageAt: "2026-01-05T00:00:00.000Z",
            },
            {
                $createdAt: "2026-01-01T00:00:00.000Z",
                $id: "c",
                lastMessageAt: "2026-01-05T00:00:00.000Z",
            },
            { $createdAt: "2026-01-01T00:00:00.000Z", $id: "d" },
        ];

        expect(countUnreadChannels(channels, {})).toBe(3);
        expect(
            countUnreadChannels(channels, {
                a: "2026-01-06T00:00:00.000Z",
                c: "2026-01-06T00:00:00.000Z",
            }),
        ).toBe(1);
        expect(
            countUnreadChannels(channels, {
                a: "2026-01-06T00:00:00.000Z",
                b: "2026-01-06T00:00:00.000Z",
                c: "2026-01-06T00:00:00.000Z",
                d: "2026-01-06T00:00:00.000Z",
            }),
        ).toBe(0);
    });

    it("counts zero for an empty category", () => {
        expect(countUnreadChannels([], {})).toBe(0);
    });
});
