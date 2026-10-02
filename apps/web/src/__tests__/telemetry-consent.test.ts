import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCapture, mockCaptureException, mockGetUserProfile } = vi.hoisted(
    () => ({
        mockCapture: vi.fn(),
        mockCaptureException: vi.fn(),
        mockGetUserProfile: vi.fn(),
    }),
);

vi.mock("@/lib/appwrite-profiles", () => ({
    getUserProfile: mockGetUserProfile,
}));

vi.mock("posthog-node", () => ({
    PostHog: class {
        capture = mockCapture;
        captureException = mockCaptureException;
        flush = vi.fn(async () => {});
        shutdown = vi.fn(async () => {});
    },
}));

vi.mock("next/server", () => ({
    after: (cb: () => void) => cb(),
    NextResponse: { json: (body: unknown) => body },
}));

const { __resetTelemetryConsentCache, isTelemetryAllowedForUser } = await import(
    "@/lib/telemetry-consent"
);

const { recordEvent, recordError } = await import("@/lib/posthog-utils");

const originalEnv = { ...process.env };

/** Lets the floating promise inside the capture path settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("server telemetry consent", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetTelemetryConsentCache();
        process.env = { ...originalEnv };
        process.env.POSTHOG_PROJECT_API_KEY = "phc_server_key";
        // NODE_ENV is pinned to "test" by the runner; this is the sanctioned
        // switch for exercising the real send path.
        process.env.ENABLE_POSTHOG_IN_TESTS = "true";
        mockGetUserProfile.mockResolvedValue({});
    });

    describe("isTelemetryAllowedForUser", () => {
        it("honours an explicit opt-out", async () => {
            mockGetUserProfile.mockResolvedValue({ telemetryEnabled: false });
            await expect(isTelemetryAllowedForUser("user-1")).resolves.toBe(
                false,
            );
        });

        it("honours an explicit opt-in", async () => {
            mockGetUserProfile.mockResolvedValue({ telemetryEnabled: true });
            await expect(isTelemetryAllowedForUser("user-1")).resolves.toBe(
                true,
            );
        });

        it("defaults to allowed when the profile has no preference", async () => {
            mockGetUserProfile.mockResolvedValue({});
            await expect(isTelemetryAllowedForUser("user-1")).resolves.toBe(
                true,
            );
        });

        it("defaults to allowed when the profile cannot be read", async () => {
            mockGetUserProfile.mockRejectedValue(new Error("boom"));
            await expect(isTelemetryAllowedForUser("user-1")).resolves.toBe(
                true,
            );
        });

        it("caches the decision instead of re-reading per event", async () => {
            mockGetUserProfile.mockResolvedValue({ telemetryEnabled: false });
            await isTelemetryAllowedForUser("user-1");
            await isTelemetryAllowedForUser("user-1");
            expect(mockGetUserProfile).toHaveBeenCalledTimes(1);
        });
    });

    describe("capture gating", () => {
        it("drops events for a user who opted out", async () => {
            mockGetUserProfile.mockResolvedValue({ telemetryEnabled: false });

            recordEvent("ApiCall", { userId: "user-1", endpoint: "/api/me" });
            await settle();

            expect(mockCapture).not.toHaveBeenCalled();
        });

        it("sends events for a user who is opted in", async () => {
            mockGetUserProfile.mockResolvedValue({ telemetryEnabled: true });

            recordEvent("ApiCall", { userId: "user-1", endpoint: "/api/me" });
            await settle();

            expect(mockCapture).toHaveBeenCalledTimes(1);
            expect(mockCapture.mock.calls[0][0].distinctId).toBe("user-1");
        });

        it("still sends unattributed events, since no person is involved", async () => {
            mockGetUserProfile.mockResolvedValue({ telemetryEnabled: false });

            recordEvent("ApiCall", { endpoint: "/api/health" });
            await settle();

            expect(mockCapture).toHaveBeenCalledTimes(1);
            expect(mockCapture.mock.calls[0][0].distinctId).toBe("server");
            // No person to check consent for.
            expect(mockGetUserProfile).not.toHaveBeenCalled();
        });

        it("drops error reports attributed to a user who opted out", async () => {
            mockGetUserProfile.mockResolvedValue({ telemetryEnabled: false });

            recordError(new Error("boom"), { userId: "user-1" });
            await settle();

            expect(mockCaptureException).not.toHaveBeenCalled();
        });

        it("sends error reports with no user attribution", async () => {
            mockGetUserProfile.mockResolvedValue({ telemetryEnabled: false });

            recordError(new Error("boom"));
            await settle();

            expect(mockCaptureException).toHaveBeenCalledTimes(1);
        });
    });
});
