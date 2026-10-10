import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createElement, type ReactNode } from "react";

import { useChannelReads } from "@/app/chat/hooks/useChannelReads";

/**
 * Regression cover for the request storm: when the channel-reads endpoint fails
 * or reports the collection is not deployed, the hook must stop asking.
 *
 * The original bug was that `markChannelRead` depended on the whole `mutation`
 * object, which react-query hands out a fresh reference for on every render. The
 * caller's effect therefore re-ran every render, and since its guard waited on a
 * server response that a failing endpoint never sent, it fired a PUT per render.
 */
function withClient(): (props: { children: ReactNode }) => ReactNode {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }) =>
        createElement(QueryClientProvider, { client }, children);
}

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

describe("useChannelReads request safety", () => {
    it("does not retry a failed read", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("nope", { status: 400 }));

        function Probe() {
            useChannelReads("server-1");
            return null;
        }

        render(createElement(Probe), { wrapper: withClient() });
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

        // A 400 on a cosmetic read must not be retried.
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(1);
        fetchSpy.mockRestore();
    });

    it("keeps markChannelRead referentially stable across rerenders", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { status: 500 }));

        const seen: unknown[] = [];
        let bump: () => void = () => {};

        function Probe() {
            const [, setTick] = React.useState(0);
            const { markChannelRead } = useChannelReads("server-1");
            bump = () => setTick((n) => n + 1);
            seen.push(markChannelRead);
            React.useEffect(() => {
                markChannelRead("channel-1", TIMESTAMP);
            }, [markChannelRead]);
            return null;
        }

        render(createElement(Probe), { wrapper: withClient() });

        for (let i = 0; i < 25; i++) {
            bump();
        }
        await new Promise((resolve) => setTimeout(resolve, 60));

        const identities = new Set(seen);
        expect(identities.size).toBe(1);

        // 25 rerenders must not turn into 25 writes.
        const puts = fetchSpy.mock.calls.filter(
            (call) => call[1]?.method === "PUT",
        );
        expect(puts.length).toBeLessThanOrEqual(1);
        fetchSpy.mockRestore();
    });

    it("stops writing once the server reports read state is not deployed", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ channelReadsAvailable: false }), {
                status: 503,
            }),
        );

        function Probe() {
            const { markChannelRead } = useChannelReads("server-1");
            React.useEffect(() => {
                markChannelRead("channel-1", TIMESTAMP);
            }, [markChannelRead]);
            return null;
        }

        render(createElement(Probe), { wrapper: withClient() });
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

        const afterFirst = fetchSpy.mock.calls.length;
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(fetchSpy.mock.calls.length).toBe(afterFirst);
        fetchSpy.mockRestore();
    });
});
