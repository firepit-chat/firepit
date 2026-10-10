import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { createElement } from "react";

import { useViewerMembers } from "@/hooks/use-viewer-members";

/**
 * Switching servers leaves the previous server's member list in state for a
 * render before the new request resolves. `loading` used to be raised inside the
 * async fetch, which React batches, so the panel reported "No members" for a
 * server that had simply not loaded yet — and looked broken while loading.
 */
function Probe({ serverId }: { serverId: string | null }) {
    const { loading, members } = useViewerMembers(serverId);
    return createElement(
        "div",
        null,
        createElement("span", { "data-testid": "state" },
            loading ? "loading" : "settled"),
        createElement("span", { "data-testid": "count" },
            String(members.length)),
    );
}

function memberResponse(count: number) {
    return {
        members: Array.from({ length: count }, (_, index) => ({
            userId: `user-${String(index)}`,
            username: `user${String(index)}`,
            displayName: `User ${String(index)}`,
            avatarUrl: null,
            avatarFramePreset: null,
            avatarFrameUrl: null,
            avatarFrameInsetPercent: null,
            role: null,
        })),
    };
}

describe("useViewerMembers loading state", () => {
    it("reports loading on the first render for a server", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            () => new Promise(() => undefined),
        );

        render(createElement(Probe, { serverId: "server-1" }));

        // Must be loading immediately, not settled-with-zero.
        expect(screen.getByTestId("state").textContent).toBe("loading");
        vi.restoreAllMocks();
    });

    it("settles once the list for the current server arrives", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                new Response(JSON.stringify(memberResponse(2))),
            )
            .mockResolvedValue(
                new Response(JSON.stringify(memberResponse(5))),
            );

        const { rerender } = render(createElement(Probe, { serverId: "server-1" }));
        await waitFor(() =>
            expect(screen.getByTestId("state").textContent).toBe("settled"),
        );

        rerender(createElement(Probe, { serverId: "server-2" }));

        await waitFor(() =>
            expect(screen.getByTestId("count").textContent).toBe("5"),
        );
        expect(screen.getByTestId("state").textContent).toBe("settled");
        vi.restoreAllMocks();
    });

    // The reported bug. `serverId` is null until the server list resolves, which
    // is not the same as "this server has no members". That window used to read
    // as settled-with-zero, so the panel flashed "No members" on every load.
    it("is not settled while the server is still being resolved", () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ members: [] })),
        );

        render(createElement(Probe, { serverId: null }));

        expect(screen.getByTestId("state").textContent).toBe("loading");
        expect(screen.getByTestId("count").textContent).toBe("0");
        vi.restoreAllMocks();
    });

    it("is settled with no members when the server genuinely has none", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ members: [] })),
        );

        render(createElement(Probe, { serverId: "server-1" }));

        await waitFor(() =>
            expect(screen.getByTestId("state").textContent).toBe("settled"),
        );
        expect(screen.getByTestId("count").textContent).toBe("0");
        vi.restoreAllMocks();
    });
});