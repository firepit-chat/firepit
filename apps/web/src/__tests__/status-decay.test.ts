import { describe, expect, it } from "vitest";
import {
    STATUS_IDLE_THRESHOLD_MS,
    STATUS_STALE_THRESHOLD_MS,
    normalizeStatus,
} from "@/lib/status-normalization";

const NOW = Date.parse("2026-01-01T12:00:00.000Z");

function statusAt(
    overrides: Parameters<typeof normalizeStatus>[0],
    ageMs: number,
): string {
    const lastSeenAt = new Date(NOW - ageMs).toISOString();
    return normalizeStatus({ lastSeenAt, ...overrides }, NOW).normalized
        .status;
}

const FRESH = 0;
const IDLE = STATUS_IDLE_THRESHOLD_MS + 60_000;
const STALE = STATUS_STALE_THRESHOLD_MS + 60_000;

describe("status decay", () => {
    it("decays an automatic status online -> away -> offline", () => {
        const doc = { status: "online", isManuallySet: false };

        expect(statusAt(doc, FRESH)).toBe("online");
        expect(statusAt(doc, IDLE)).toBe("away");
        expect(statusAt(doc, STALE)).toBe("offline");
    });

    // The whole point: "online" is the default a user gets for free, so pinning
    // it manually would keep them online forever regardless of activity.
    it("treats a manual online the same as an automatic one", () => {
        const doc = { status: "online", isManuallySet: true };

        expect(statusAt(doc, FRESH)).toBe("online");
        expect(statusAt(doc, IDLE)).toBe("away");
        expect(statusAt(doc, STALE)).toBe("offline");
    });

    it.each(["away", "busy", "offline"] as const)(
        "keeps a manual %s indefinitely",
        (manual) => {
            const doc = { status: manual, isManuallySet: true };

            expect(statusAt(doc, FRESH)).toBe(manual);
            expect(statusAt(doc, IDLE)).toBe(manual);
            expect(statusAt(doc, STALE)).toBe(manual);
            expect(statusAt(doc, STALE * 100)).toBe(manual);
        },
    );

    it("still expires a manual status at expiresAt", () => {
        const doc = {
            status: "busy",
            isManuallySet: true,
            expiresAt: new Date(NOW - 60_000).toISOString(),
        };

        expect(statusAt(doc, FRESH)).toBe("offline");
    });

    it("treats a missing status document as offline", () => {
        expect(statusAt({ status: "nonsense" }, FRESH)).toBe("offline");
    });

    it("reports idle and stale separately", () => {
        const idle = normalizeStatus(
            { status: "online", lastSeenAt: new Date(NOW - IDLE).toISOString() },
            NOW,
        );
        expect(idle.isIdle).toBe(true);
        expect(idle.isStale).toBe(false);

        const stale = normalizeStatus(
            {
                status: "online",
                lastSeenAt: new Date(NOW - STALE).toISOString(),
            },
            NOW,
        );
        expect(stale.isStale).toBe(true);
    });

    it("flags a status that will be rewritten as offline", () => {
        expect(
            normalizeStatus(
                {
                    status: "online",
                    isManuallySet: true,
                    lastSeenAt: new Date(NOW - STALE).toISOString(),
                },
                NOW,
            ).shouldAutoOffline,
        ).toBe(true);

        expect(
            normalizeStatus(
                {
                    status: "busy",
                    isManuallySet: true,
                    lastSeenAt: new Date(NOW - STALE).toISOString(),
                },
                NOW,
            ).shouldAutoOffline,
        ).toBe(false);
    });
});