import { describe, expect, it } from "vitest";

import {
    hasSpoilerSyntax,
    splitBySpoilers,
    stripSpoilerSyntax,
} from "../src/shared/syntax";

describe("hasSpoilerSyntax", () => {
    it("detects a well-formed spoiler", () => {
        expect(hasSpoilerSyntax("a [spoiler]b[/spoiler] c")).toBe(true);
    });

    it("requires both delimiters", () => {
        expect(hasSpoilerSyntax("[spoiler]b")).toBe(false);
        expect(hasSpoilerSyntax("b[/spoiler]")).toBe(false);
    });

    it("ignores case and whitespace variants", () => {
        expect(hasSpoilerSyntax("[Spoiler]b[/Spoiler]")).toBe(false);
        expect(hasSpoilerSyntax("[spoiler ]b[/spoiler]")).toBe(false);
    });
});

describe("splitBySpoilers", () => {
    it("returns the whole string as text when there is no spoiler", () => {
        expect(splitBySpoilers("just text")).toEqual([
            { type: "text", value: "just text" },
        ]);
    });

    it("splits leading, spoiler and trailing text", () => {
        expect(
            splitBySpoilers("before [spoiler]hidden[/spoiler] after"),
        ).toEqual([
            { type: "text", value: "before " },
            { type: "spoiler", value: "hidden" },
            { type: "text", value: " after" },
        ]);
    });

    it("handles a spoiler at the very start", () => {
        expect(splitBySpoilers("[spoiler]hidden[/spoiler]")).toEqual([
            { type: "spoiler", value: "hidden" },
        ]);
    });

    it("handles a spoiler at the very end", () => {
        expect(splitBySpoilers("lead [spoiler]hidden[/spoiler]")).toEqual([
            { type: "text", value: "lead " },
            { type: "spoiler", value: "hidden" },
        ]);
    });

    it("handles adjacent spoilers without interleaved text", () => {
        expect(
            splitBySpoilers("[spoiler]a[/spoiler][spoiler]b[/spoiler]"),
        ).toEqual([
            { type: "spoiler", value: "a" },
            { type: "spoiler", value: "b" },
        ]);
    });

    it("allows an empty body", () => {
        expect(splitBySpoilers("[spoiler][/spoiler]")).toEqual([
            { type: "spoiler", value: "" },
        ]);
    });

    it("matches non-greedily so sequential spoilers do not merge", () => {
        expect(
            splitBySpoilers("[spoiler]a[/spoiler]x[spoiler]b[/spoiler]"),
        ).toEqual([
            { type: "spoiler", value: "a" },
            { type: "text", value: "x" },
            { type: "spoiler", value: "b" },
        ]);
    });

    it("spans newlines and blank lines", () => {
        const input =
            "line one\n\n[spoiler]para one\n\npara two[/spoiler]\n\ntail";
        expect(splitBySpoilers(input)).toEqual([
            { type: "text", value: "line one\n\n" },
            { type: "spoiler", value: "para one\n\npara two" },
            { type: "text", value: "\n\ntail" },
        ]);
    });

    it("preserves inner markdown for the caller to re-render", () => {
        expect(
            splitBySpoilers("[spoiler]**bold** and `code`[/spoiler]"),
        ).toEqual([{ type: "spoiler", value: "**bold** and `code`" }]);
    });

    describe("malformed input degrades to literal text", () => {
        it("leaves an unclosed opener as text", () => {
            expect(splitBySpoilers("a [spoiler]b")).toEqual([
                { type: "text", value: "a [spoiler]b" },
            ]);
        });

        it("leaves a stray closer as text", () => {
            expect(splitBySpoilers("a b[/spoiler]")).toEqual([
                { type: "text", value: "a b[/spoiler]" },
            ]);
        });

        it("leaves an inverted pair as text", () => {
            const input = "a [/spoiler] b [spoiler] c";
            expect(splitBySpoilers(input)).toEqual([
                { type: "text", value: input },
            ]);
        });
    });

    describe("delimiters inside other constructs", () => {
        it("does not treat a closer followed by no opener as a spoiler", () => {
            expect(splitBySpoilers("[/spoiler] trailing")).toEqual([
                { type: "text", value: "[/spoiler] trailing" },
            ]);
        });

        it("preserves a spoiler that wraps markdown link syntax", () => {
            expect(
                splitBySpoilers(
                    "[spoiler][label](https://example.com)[/spoiler]",
                ),
            ).toEqual([
                { type: "spoiler", value: "[label](https://example.com)" },
            ]);
        });

        it("keeps the literal table pipe out of the grammar's way", () => {
            // The reason `[spoiler]` was chosen over `||x||`: a pipe is claimed
            // by GFM tables on the web renderer.
            expect(splitBySpoilers("| a | b |\n| - | - |")).toEqual([
                { type: "text", value: "| a | b |\n| - | - |" },
            ]);
        });
    });
});

describe("stripSpoilerSyntax", () => {
    it("returns text unchanged when there is no spoiler", () => {
        expect(stripSpoilerSyntax("plain text")).toBe("plain text");
    });

    it("removes delimiters but keeps the revealed body", () => {
        expect(
            stripSpoilerSyntax("a [spoiler]the butler did it[/spoiler] b"),
        ).toBe("a the butler did it b");
    });

    it("handles multiple spoilers", () => {
        expect(
            stripSpoilerSyntax("[spoiler]a[/spoiler] and [spoiler]b[/spoiler]"),
        ).toBe("a and b");
    });

    it("removes an unclosed opener's delimiter", () => {
        expect(stripSpoilerSyntax("a [spoiler]b")).toBe("a b");
    });

    it("removes a stray closer", () => {
        expect(stripSpoilerSyntax("a b[/spoiler]")).toBe("a b");
    });
});
