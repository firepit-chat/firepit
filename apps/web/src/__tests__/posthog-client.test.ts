import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInit, mockOptIn, mockOptOut } = vi.hoisted(() => ({
    mockInit: vi.fn(),
    mockOptIn: vi.fn(),
    mockOptOut: vi.fn(),
}));

vi.mock("posthog-js", () => ({
    default: {
        init: mockInit,
        opt_in_capturing: mockOptIn,
        opt_out_capturing: mockOptOut,
        identify: vi.fn(),
        capture: vi.fn(),
        captureException: vi.fn(),
        reset: vi.fn(),
    },
}));

const {
    initPostHogClient,
    __resetPostHogClientForTests,
    __isPostHogClientInitialized,
} = await import("@/lib/posthog-client");

const originalEnv = { ...process.env };

describe("initPostHogClient", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetPostHogClientForTests();
        // happy-dom provides `window`; the init guard requires it.
        (global as { window?: { posthog?: unknown } }).window = { posthog: undefined };
        process.env = { ...originalEnv };
        process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_test_token";
        process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com/";
    });

    it("initializes the browser SDK with the project token", () => {
        initPostHogClient();

        expect(mockInit).toHaveBeenCalledTimes(1);
        const [token, config] = mockInit.mock.calls[0];
        expect(token).toBe("phc_test_token");
        expect(config.api_host).toBe("https://us.i.posthog.com");
        expect(__isPostHogClientInitialized()).toBe(true);
    });

    it("captures anonymous events by default, so the pre-auth funnel is recorded", () => {
        initPostHogClient();
        expect(mockInit.mock.calls[0][1].opt_out_capturing_by_default).toBe(false);
    });

    it("exposes window.posthog so client-logger can reach it", () => {
        // client-logger.ts reads window.posthog, which posthog-js does not set
        // when bundled through npm rather than the CDN snippet.
        initPostHogClient();
        expect(
            (global as { window?: { posthog?: unknown } }).window?.posthog,
        ).toBeDefined();
    });

    it("only initializes once, so Strict Mode double-render is harmless", () => {
        initPostHogClient();
        initPostHogClient();
        expect(mockInit).toHaveBeenCalledTimes(1);
    });

    it("does nothing without a token, rather than buffering unsendable events", () => {
        delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
        initPostHogClient();

        expect(mockInit).not.toHaveBeenCalled();
        expect(__isPostHogClientInitialized()).toBe(false);
    });

    it("only enables session recording on an explicit true", () => {
        initPostHogClient();
        expect(mockInit.mock.calls[0][1].disable_session_recording).toBe(true);

        __resetPostHogClientForTests();
        mockInit.mockClear();
        process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING = "true";
        initPostHogClient();
        expect(mockInit.mock.calls[0][1].disable_session_recording).toBe(false);

        // A malformed value must fail closed, not silently start recording.
        __resetPostHogClientForTests();
        mockInit.mockClear();
        process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING = "yes";
        initPostHogClient();
        expect(mockInit.mock.calls[0][1].disable_session_recording).toBe(true);
    });
});
