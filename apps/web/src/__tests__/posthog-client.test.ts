import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInit, mockOptIn, mockOptOut, mockCapture, mockIdentify } =
    vi.hoisted(() => ({
        mockInit: vi.fn(),
        mockOptIn: vi.fn(),
        mockOptOut: vi.fn(),
        mockCapture: vi.fn(),
        mockIdentify: vi.fn(),
    }));

vi.mock("posthog-js", () => ({
    default: {
        init: mockInit,
        opt_in_capturing: mockOptIn,
        opt_out_capturing: mockOptOut,
        identify: mockIdentify,
        capture: mockCapture,
        captureException: vi.fn(),
        reset: vi.fn(),
    },
}));

const {
    initPostHogClient,
    whenPostHogReady,
    posthog,
    __resetPostHogClientForTests,
    __isPostHogClientInitialized,
} = await import("@/lib/posthog-client");

const originalEnv = { ...process.env };

describe("initPostHogClient", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetPostHogClientForTests();
        // happy-dom provides `window`; the init guard requires it.
        (global as { window?: { posthog?: unknown } }).window = {
            posthog: undefined,
        };
        process.env = { ...originalEnv };
        process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_test_token";
        process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com/";
    });

    it("initializes the browser SDK with the project token", async () => {
        await initPostHogClient();

        expect(mockInit).toHaveBeenCalledTimes(1);
        const [token, config] = mockInit.mock.calls[0];
        expect(token).toBe("phc_test_token");
        expect(config.api_host).toBe("https://us.i.posthog.com");
        expect(__isPostHogClientInitialized()).toBe(true);
    });

    it("captures anonymous events by default, so the pre-auth funnel is recorded", async () => {
        await initPostHogClient();
        expect(mockInit.mock.calls[0][1].opt_out_capturing_by_default).toBe(
            false,
        );
    });

    it("exposes window.posthog so client-logger can reach it", async () => {
        // client-logger.ts reads window.posthog, which posthog-js does not set
        // when bundled through npm rather than the CDN snippet.
        await initPostHogClient();
        expect(
            (global as { window?: { posthog?: unknown } }).window?.posthog,
        ).toBeDefined();
    });

    it("only initializes once, so Strict Mode double-render is harmless", async () => {
        await initPostHogClient();
        initPostHogClient();
        expect(mockInit).toHaveBeenCalledTimes(1);
    });

    it("does nothing without a token, rather than buffering unsendable events", () => {
        delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
        initPostHogClient();

        expect(mockInit).not.toHaveBeenCalled();
        expect(__isPostHogClientInitialized()).toBe(false);
    });

    it("only enables session recording on an explicit true", async () => {
        await initPostHogClient();
        expect(mockInit.mock.calls[0][1].disable_session_recording).toBe(true);

        __resetPostHogClientForTests();
        mockInit.mockClear();
        process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING = "true";
        await initPostHogClient();
        expect(mockInit.mock.calls[0][1].disable_session_recording).toBe(false);

        // A malformed value must fail closed, not silently start recording.
        __resetPostHogClientForTests();
        mockInit.mockClear();
        process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING = "yes";
        await initPostHogClient();
        expect(mockInit.mock.calls[0][1].disable_session_recording).toBe(true);
    });

    // The SDK is behind a dynamic import now, so anything captured before the
    // chunk lands has to survive. These are the pre-auth funnel events the
    // module doc says must not be lost.
    describe("queueing before the SDK loads", () => {
        it("replays calls made before load, in order", async () => {
            initPostHogClient();
            posthog.capture("first", { a: 1 });
            posthog.identify("user-1");
            posthog.capture("second");

            expect(mockCapture).toHaveBeenCalledTimes(0);

            await whenPostHogReady();

            expect(mockCapture.mock.calls.map((c) => c[0])).toEqual([
                "first",
                "second",
            ]);
            expect(mockIdentify).toHaveBeenCalledWith("user-1");
        });

        it("honours an opt-out queued before load", async () => {
            initPostHogClient();
            posthog.opt_out_capturing();
            posthog.capture("should_be_suppressed");

            await whenPostHogReady();

            // Opt-out is replayed before the capture, so the SDK suppresses it.
            expect(mockOptOut).toHaveBeenCalledTimes(1);
        });

        it("does not fetch the SDK at all without a token", async () => {
            delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
            await initPostHogClient();

            expect(mockInit).not.toHaveBeenCalled();
            expect(__isPostHogClientInitialized()).toBe(false);
        });

        it("hands client-logger a working handle immediately", () => {
            // client-logger reads window.posthog before the SDK resolves.
            initPostHogClient();
            const handle = (
                global as { window?: { posthog?: { capture: unknown } } }
            ).window?.posthog;
            expect(typeof handle?.capture).toBe("function");
        });
    });
});
