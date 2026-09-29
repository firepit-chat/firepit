import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetUserProfile, mockGetNotificationSettings } = vi.hoisted(() => ({
    mockGetUserProfile: vi.fn(),
    mockGetNotificationSettings: vi.fn(),
}));

vi.mock("@/lib/appwrite-profiles", () => ({
    getUserProfile: mockGetUserProfile,
}));

vi.mock("@/lib/notification-settings", () => ({
    getNotificationSettings: mockGetNotificationSettings,
}));

vi.mock("@/lib/posthog-utils", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { resolveDmEncryptionEnabled, readDmEncryptionEnabled } = await import(
    "@/lib/dm-encryption-preference"
);

describe("resolveDmEncryptionEnabled precedence", () => {
    it("prefers the profile value", () => {
        expect(
            resolveDmEncryptionEnabled(
                { dmEncryptionEnabled: true },
                { dmEncryptionEnabled: false },
            ),
        ).toBe(true);
        // An explicit false on the profile must win too, not fall through.
        expect(
            resolveDmEncryptionEnabled(
                { dmEncryptionEnabled: false },
                { dmEncryptionEnabled: true },
            ),
        ).toBe(false);
    });

    it("falls back to notification settings when the profile has no value", () => {
        // This is the pre-migration account: no profiles column, but encryption
        // was turned on. Losing this silently downgrades DMs to plaintext.
        expect(
            resolveDmEncryptionEnabled({}, { dmEncryptionEnabled: true }),
        ).toBe(true);
        expect(
            resolveDmEncryptionEnabled(
                { dmEncryptionEnabled: null },
                { dmEncryptionEnabled: true },
            ),
        ).toBe(true);
    });

    it("defaults to false when neither source has a value", () => {
        expect(resolveDmEncryptionEnabled(null, null)).toBe(false);
        expect(resolveDmEncryptionEnabled({}, {})).toBe(false);
    });
});

describe("readDmEncryptionEnabled", () => {
    beforeEach(() => {
        mockGetUserProfile.mockReset();
        mockGetNotificationSettings.mockReset();
    });

    it("does not read notification settings when the profile answers", async () => {
        mockGetUserProfile.mockResolvedValue({ dmEncryptionEnabled: true });
        await expect(readDmEncryptionEnabled("user-1")).resolves.toBe(true);
        expect(mockGetNotificationSettings).not.toHaveBeenCalled();
    });

    it("falls back for an account that predates the column", async () => {
        mockGetUserProfile.mockResolvedValue({});
        mockGetNotificationSettings.mockResolvedValue({
            dmEncryptionEnabled: true,
        });
        await expect(readDmEncryptionEnabled("user-1")).resolves.toBe(true);
        expect(mockGetNotificationSettings).toHaveBeenCalledWith("user-1");
    });

    it("reuses a caller-supplied profile instead of fetching again", async () => {
        mockGetNotificationSettings.mockResolvedValue({});
        await expect(
            readDmEncryptionEnabled("user-1", { dmEncryptionEnabled: true }),
        ).resolves.toBe(true);
        expect(mockGetUserProfile).not.toHaveBeenCalled();
        expect(mockGetNotificationSettings).not.toHaveBeenCalled();
    });

    it("treats a failed profile read as absent and still tries the fallback", async () => {
        mockGetUserProfile.mockRejectedValue(new Error("boom"));
        mockGetNotificationSettings.mockResolvedValue({
            dmEncryptionEnabled: true,
        });
        await expect(readDmEncryptionEnabled("user-1")).resolves.toBe(true);
    });

    it("resolves false when both reads fail", async () => {
        mockGetUserProfile.mockRejectedValue(new Error("boom"));
        mockGetNotificationSettings.mockRejectedValue(new Error("boom"));
        await expect(readDmEncryptionEnabled("user-1")).resolves.toBe(false);
    });
});
