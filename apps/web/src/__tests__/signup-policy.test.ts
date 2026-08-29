import { describe, expect, it } from "vitest";
import {
    getApprovalStatusFromPrefs,
    isSignupPolicy,
} from "@/lib/signup-policy";

describe("isSignupPolicy", () => {
    it("accepts the known policies and rejects everything else", () => {
        expect(isSignupPolicy("open")).toBe(true);
        expect(isSignupPolicy("approval")).toBe(true);
        expect(isSignupPolicy("disabled")).toBe(true);

        expect(isSignupPolicy("")).toBe(false);
        expect(isSignupPolicy("enabled")).toBe(false);
        expect(isSignupPolicy(undefined)).toBe(false);
        expect(isSignupPolicy(null)).toBe(false);
    });
});

describe("getApprovalStatusFromPrefs", () => {
    it("treats missing prefs as approved (legacy accounts)", () => {
        expect(getApprovalStatusFromPrefs(undefined)).toBe("approved");
        expect(getApprovalStatusFromPrefs(null)).toBe("approved");
        expect(getApprovalStatusFromPrefs({})).toBe("approved");
    });

    it("reads the explicit status", () => {
        expect(
            getApprovalStatusFromPrefs({ approvalStatus: "pending" }),
        ).toBe("pending");
        expect(
            getApprovalStatusFromPrefs({ approvalStatus: "rejected" }),
        ).toBe("rejected");
        expect(
            getApprovalStatusFromPrefs({ approvalStatus: "approved" }),
        ).toBe("approved");
    });

    it("falls back to approved for unknown values", () => {
        expect(getApprovalStatusFromPrefs({ approvalStatus: "weird" })).toBe(
            "approved",
        );
    });
});