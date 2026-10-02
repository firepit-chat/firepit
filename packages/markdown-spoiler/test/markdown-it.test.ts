import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";

import {
    SPOILER_TOKEN_TYPE,
    registerSpoilerRule,
} from "../src/native/markdown-it";

/**
 * Copied verbatim from
 * `react-native-markdown-display/src/lib/util/getTokenTypeByToken.js`.
 *
 * That function decides which `rules` key a token is dispatched to, so
 * mirroring it here is the only way to assert our tokens survive that
 * renderer's pipeline intact.
 */
const regSelectOpenClose = /_open|_close/g;

function rnmdTokenType(token: { type?: string }): string {
    if (token.type) {
        return token.type.replace(regSelectOpenClose, "");
    }
    return "unknown";
}

function parseInline(markdown: string): { type: string; content: string }[] {
    const md = registerSpoilerRule(new MarkdownIt({ typographer: true }));

    return md.parse(markdown, {}).flatMap((token) =>
        token.type === "inline" && token.children
            ? token.children.map((child) => ({
                  type: child.type,
                  content: child.content,
              }))
            : [],
    );
}

function mapped(markdown: string): string[] {
    return parseInline(markdown).map(rnmdTokenType);
}

describe("markdown-it spoiler rule", () => {
    it("emits one spoiler token per region", () => {
        const spoilers = parseInline("a [spoiler]secret[/spoiler] b").filter(
            (token) => token.type === SPOILER_TOKEN_TYPE,
        );

        expect(spoilers).toHaveLength(1);
        expect(spoilers[0]?.content).toBe("secret");
    });

    it("emits no closing token, which would render a duplicate spoiler", () => {
        // Regression guard.
        //
        // `react-native-markdown-display` strips `_open`/`_close` suffixes before
        // dispatching to a rule, so a `spoiler_close` token maps back to
        // `spoiler` and renders a second, empty spoiler beside the first.
        // Asserting on the post-mapping type is what catches that.
        expect(mapped("a [spoiler]secret[/spoiler] b")).toEqual([
            "text",
            "spoiler",
            "text",
        ]);
    });

    it("emits one spoiler token per region for adjacent spoilers", () => {
        expect(mapped("[spoiler]a[/spoiler][spoiler]b[/spoiler]")).toEqual([
            "spoiler",
            "spoiler",
        ]);
    });

    it("keeps the body as raw Markdown for the app to re-parse", () => {
        const spoilers = parseInline("a [spoiler]**bold**[/spoiler] b").filter(
            (token) => token.type === SPOILER_TOKEN_TYPE,
        );

        expect(spoilers[0]?.content).toBe("**bold**");
    });

    it("keeps surrounding text in document order", () => {
        expect(
            parseInline("before [spoiler]x[/spoiler] after").map(
                (token) => token.content,
            ),
        ).toEqual(["before ", "x", " after"]);
    });

    it("allows an empty body as a spoiler", () => {
        expect(mapped("a [spoiler][/spoiler] b")).toEqual([
            "text",
            "spoiler",
            "text",
        ]);
    });

    describe("malformed input", () => {
        it("leaves an unclosed opener as literal text", () => {
            expect(mapped("a [spoiler]b")).not.toContain("spoiler");
        });

        it("leaves a stray closer as literal text", () => {
            expect(mapped("a b[/spoiler]")).not.toContain("spoiler");
        });
    });

    it("does not match inside a code span", () => {
        expect(mapped("`[spoiler]x[/spoiler]`")).not.toContain("spoiler");
    });

    it("is idempotent when registered twice on one instance", () => {
        const md = new MarkdownIt({ typographer: true });

        registerSpoilerRule(md);
        registerSpoilerRule(md);

        const inline = md
            .parse("[spoiler]x[/spoiler]", {})
            .flatMap((token) => token.children ?? []);

        expect(
            inline.filter((token) => token.type === SPOILER_TOKEN_TYPE),
        ).toHaveLength(1);
    });
});
