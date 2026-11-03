import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createElement, type ReactNode } from "react";

import { useUnreadChannels } from "@/app/notifications/useUnreadChannels";

/**
 * The notifications page reads only the inbox, which by design holds mentions,
 * thread replies and DMs — an ordinary unread channel message never lands there.
 * These cover the replacement: the same `isChannelUnread` rule the sidebar dot
 * uses, driven by read state, with no inbox write.
 */
function withClient(): (props: { children: ReactNode }) => ReactNode {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }) =>
        createElement(QueryClientProvider, { client }, children);
}

const server = { $id: "server-1", name: "Test" } as never;

function channel(overrides: Record<string, unknown>) {
    return {
        $createdAt: "2026-01-01T00:00:00.000Z",
        $id: "channel-1",
        name: "general",
        serverId: "server-1",
        ...overrides,
    };
}

function mockEndpoints(
    channels: Array<Record<string, unknown>>,
    reads: Record<string, string>,
) {
    return vi.spyOn(globalThis, "fetch").mockImplementation((async (
        input: RequestInfo | URL,
    ) => {
        const url = String(input);
        if (url.includes("/api/channel-reads")) {
            return new Response(
                JSON.stringify({ reads, serverId: "server-1" }),
            );
        }
        if (url.includes("/api/channels")) {
            return new Response(JSON.stringify({ channels, nextCursor: null }));
        }
        return new Response("{}", { status: 404 });
    }) as typeof fetch);
}

function Probe() {
    const { unreadChannels } = useUnreadChannels([server]);
    return createElement(
        "div",
        null,
        unreadChannels.map((entry) => entry.channel.name).join(","),
    );
}

describe("useUnreadChannels", () => {
    // The header popup renders on every page, so fetching per server up front
    // would cost two requests per server per page load.
    it("makes no requests until enabled", async () => {
        const spy = mockEndpoints(
            [channel({ lastMessageAt: "2026-01-02T00:00:00.000Z" })],
            {},
        );

        function LazyProbe() {
            const { unreadChannels } = useUnreadChannels([server], {
                enabled: false,
            });
            return createElement(
                "div",
                null,
                unreadChannels.map((entry) => entry.channel.name).join(","),
            );
        }

        render(createElement(LazyProbe), { wrapper: withClient() });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("fetches once enabled", async () => {
        const spy = mockEndpoints(
            [channel({ lastMessageAt: "2026-01-02T00:00:00.000Z" })],
            {},
        );

        function LazyProbe() {
            const { unreadChannels } = useUnreadChannels([server], {
                enabled: true,
            });
            return createElement(
                "div",
                null,
                unreadChannels.map((entry) => entry.channel.name).join(","),
            );
        }

        const { container } = render(createElement(LazyProbe), {
            wrapper: withClient(),
        });
        await waitFor(() => expect(container.textContent).toBe("general"));
        spy.mockRestore();
    });
    it("lists a channel whose newest message is past the read time", async () => {
        const spy = mockEndpoints(
            [channel({ lastMessageAt: "2026-01-02T00:00:00.000Z" })],
            { "channel-1": "2026-01-01T12:00:00.000Z" },
        );

        const { container } = render(createElement(Probe), {
            wrapper: withClient(),
        });
        await waitFor(() => expect(container.textContent).toBe("general"));
        spy.mockRestore();
    });

    it("omits a channel that has been read up to its newest message", async () => {
        const spy = mockEndpoints(
            [channel({ lastMessageAt: "2026-01-02T00:00:00.000Z" })],
            { "channel-1": "2026-01-02T00:00:00.000Z" },
        );

        const { container } = render(createElement(Probe), {
            wrapper: withClient(),
        });
        await waitFor(() => expect(container.textContent).toBe(""));
        spy.mockRestore();
    });

    // Channels outside the 300-message activity window report no lastMessageAt
    // and must read as clean rather than permanently unread.
    it("omits a channel with no recent message", async () => {
        const spy = mockEndpoints([channel({})], {});

        const { container } = render(createElement(Probe), {
            wrapper: withClient(),
        });
        await waitFor(() => expect(container.textContent).toBe(""));
        spy.mockRestore();
    });

    // A failing read endpoint is cosmetic, so it degrades to "nothing unread"
    // instead of an error state.
    it("degrades to no channels when reads cannot be loaded", async () => {
        const spy = vi.spyOn(globalThis, "fetch").mockImplementation((async (
            input: RequestInfo | URL,
        ) => {
            const url = String(input);
            if (url.includes("/api/channel-reads")) {
                return new Response("nope", { status: 500 });
            }
            return new Response(
                JSON.stringify({
                    channels: [
                        channel({
                            lastMessageAt: "2026-01-02T00:00:00.000Z",
                        }),
                    ],
                    nextCursor: null,
                }),
            );
        }) as typeof fetch);

        const { container } = render(createElement(Probe), {
            wrapper: withClient(),
        });
        await waitFor(() => expect(container.textContent).toBe(""));
        spy.mockRestore();
    });
});
