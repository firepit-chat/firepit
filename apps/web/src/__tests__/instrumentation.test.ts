import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRegisterLoggerProvider, mockRegisterProcessHandlers } =
    vi.hoisted(() => ({
        mockRegisterLoggerProvider: vi.fn(),
        mockRegisterProcessHandlers: vi.fn(),
    }));

vi.mock("@/lib/posthog-utils", () => ({
    registerPostHogLoggerProvider: mockRegisterLoggerProvider,
    registerPostHogProcessHandlers: mockRegisterProcessHandlers,
}));

describe("instrumentation", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        mockRegisterLoggerProvider.mockClear();
        mockRegisterProcessHandlers.mockClear();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("should register PostHog hooks on the Node.js runtime", async () => {
        process.env.NEXT_RUNTIME = "nodejs";

        const { register } = await import("../../instrumentation");
        await register();

        expect(mockRegisterLoggerProvider).toHaveBeenCalled();
        expect(mockRegisterProcessHandlers).toHaveBeenCalled();
    });

    it("should not register hooks on the Edge runtime", async () => {
        process.env.NEXT_RUNTIME = "edge";

        const { register } = await import("../../instrumentation");
        await register();

        expect(mockRegisterLoggerProvider).not.toHaveBeenCalled();
        expect(mockRegisterProcessHandlers).not.toHaveBeenCalled();
    });
});