import { beforeEach, describe, expect, it, vi } from "vitest";
import { connection } from "next/server";

const { mockRequireAuth, mockRedirect, mockLoggerError } = vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockRedirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/auth-server", async () => {
    const actual = await vi.importActual<typeof import("@/lib/auth-server")>(
        "@/lib/auth-server",
    );
    return { ...actual, requireAuth: mockRequireAuth };
});

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

vi.mock("@/lib/posthog-utils", () => ({
    logger: { error: mockLoggerError },
}));

vi.mock("@/app/notifications/notifications-center", () => ({
    NotificationsCenter: () => null,
}));

import { AuthError } from "@/lib/auth-server";
import NotificationsPage from "@/app/notifications/page";

describe("NotificationsPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stops at connection() before the session lookup", async () => {
        const prerenderAbort = new Error("prerender ended");
        vi.mocked(connection).mockRejectedValueOnce(prerenderAbort);

        await expect(NotificationsPage()).rejects.toBe(prerenderAbort);
        expect(mockRequireAuth).not.toHaveBeenCalled();
        expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it("redirects a signed-out visitor to login without an error log", async () => {
        mockRequireAuth.mockRejectedValueOnce(new AuthError("UNAUTHORIZED"));

        await expect(NotificationsPage()).rejects.toThrow(
            "NEXT_REDIRECT:/login?redirect=/notifications",
        );
        expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it("logs and rethrows a non-auth failure", async () => {
        const failure = new Error("upstream down");
        mockRequireAuth.mockRejectedValueOnce(failure);

        await expect(NotificationsPage()).rejects.toBe(failure);
        expect(mockRedirect).not.toHaveBeenCalled();
        expect(mockLoggerError).toHaveBeenCalledTimes(1);
    });
});
