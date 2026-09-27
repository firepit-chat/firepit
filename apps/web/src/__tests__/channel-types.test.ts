import { describe, expect, it } from "vitest";

import { normalizeChannelType } from "@/lib/types";

describe("normalizeChannelType", () => {
    it("passes through every known channel type", () => {
        expect(normalizeChannelType("text")).toBe("text");
        expect(normalizeChannelType("voice")).toBe("voice");
        expect(normalizeChannelType("announcement")).toBe("announcement");
    });

    it("defaults unknown, missing, and non-string values to text", () => {
        // Appwrite documents are untrusted: type can be absent or any shape.
        expect(normalizeChannelType(undefined)).toBe("text");
        expect(normalizeChannelType(null)).toBe("text");
        expect(normalizeChannelType("forum")).toBe("text");
        expect(normalizeChannelType("TEXT")).toBe("text");
        expect(normalizeChannelType(42)).toBe("text");
        expect(normalizeChannelType({ type: "voice" })).toBe("text");
        expect(normalizeChannelType(["voice"])).toBe("text");
    });

    it("always returns a canonical primitive, never the input object", () => {
        // A boxed String is not a valid primitive type, so it falls back to
        // "text". The previous cast-based copies returned the String *object*
        // itself here, leaking a non-primitive where callers expect a string.
        expect(normalizeChannelType(new String("voice"))).toBe("text");
    });
});
