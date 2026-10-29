import { describe, expect, it } from "vitest";

import {
    presenceLabel,
    presenceText,
} from "@/app/chat/components/presence-label";

/**
 * Rows used to render the raw stored status word, so an automatic status read
 * as lowercase "offline"/"online" and a custom status was never shown at all.
 * These pin the label wording and the custom-status preference.
 */
describe("presenceLabel", () => {
    it("capitalises each presence word", () => {
        expect(presenceLabel("online")).toBe("Online");
        expect(presenceLabel("away")).toBe("Away");
        expect(presenceLabel("busy")).toBe("Busy");
        expect(presenceLabel("offline")).toBe("Offline");
    });
});

describe("presenceText", () => {
    it("falls back to the presence word when no status is known", () => {
        // An absent status is not an empty line; it reads as Offline.
        expect(presenceText(undefined)).toBe("Offline");
    });

    it("shows the presence word on its own when there is no custom message", () => {
        expect(presenceText("online")).toBe("Online");
    });

    it("prefers the custom status text but keeps the presence word", () => {
        expect(presenceText("busy", "2.2 coming soon")).toBe(
            "Busy — 2.2 coming soon",
        );
    });

    it("ignores a blank custom message", () => {
        expect(presenceText("away", "   ")).toBe("Away");
    });

    it("trims surrounding whitespace on a custom message", () => {
        expect(presenceText("online", "  i’m here now !!  ")).toBe(
            "Online — i’m here now !!",
        );
    });

    it("reports Offline for an automatic status that has decayed", () => {
        // normalizeStatus decays a stale automatic status to offline before it
        // reaches a row; the label must reflect that, not the stored word.
        expect(presenceText("offline")).toBe("Offline");
    });
});
