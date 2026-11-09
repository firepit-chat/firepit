import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";

vi.mock("@/lib/realtime-pool", () => ({
    getSharedRealtime: vi.fn(() => ({
        subscribe: vi.fn(async () => ({ close: vi.fn() })),
    })),
    trackSubscription: vi.fn(() => vi.fn()),
}));

const STORAGE_KEY = "firepit_custom_emojis";
const cachedEmojis = [
    { fileId: "emoji1", url: "/api/emoji/emoji1", name: "cached" },
];

function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
    );
}

function mockFallbackResponse() {
    vi.spyOn(global, "fetch").mockResolvedValue(
        new Response("[]", {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "X-Custom-Emojis-Unavailable": "1",
            },
        }),
    );
}

describe("useCustomEmojis fallback response", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it("keeps the cached emojis when the server sends the fallback list", async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedEmojis));
        mockFallbackResponse();

        const { result } = renderHook(() => useCustomEmojis(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.customEmojis).toEqual(cachedEmojis);
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "")).toEqual(
            cachedEmojis,
        );
    });

    it("returns an empty list without an error when no cache exists", async () => {
        mockFallbackResponse();

        const { result } = renderHook(() => useCustomEmojis(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.customEmojis).toEqual([]);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
});
