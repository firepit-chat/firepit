import { describe, expect, it } from "vitest";
import { AppwriteException } from "node-appwrite";
import { describeAppwriteError } from "@/lib/appwrite-errors";

describe("describeAppwriteError", () => {
    it("includes the Appwrite code and type", () => {
        const error = new AppwriteException(
            "Project is in read-only mode",
            402,
            "team_read_only",
        );

        expect(describeAppwriteError(error)).toBe(
            " (Appwrite 402 team_read_only)",
        );
    });

    it("returns an empty string for errors without a code or type", () => {
        expect(describeAppwriteError(new Error("boom"))).toBe("");
        expect(describeAppwriteError("boom")).toBe("");
        expect(describeAppwriteError(null)).toBe("");
    });
});
