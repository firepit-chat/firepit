import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";

import { remarkSpoiler } from "../src/web/remark-spoiler";
import {
    SPOILER_TOKEN_TYPE,
    registerSpoilerRule,
} from "../src/native/markdown-it";

/** Number of spoiler nodes the web plugin produces. */
function webSpoilerCount(markdown: string): number {
    const processor = unified().use(remarkParse).use(remarkSpoiler);
    const tree = processor.parse(markdown) as {
        children?: { type: string; children?: unknown[] }[];
    };
    processor.runSync(tree as never);

    let count = 0;
    const stack = [...(tree.children ?? [])];
    while (stack.length > 0) {
        const node = stack.pop() as { type: string; children?: unknown[] };
        if (node.type === SPOILER_TOKEN_TYPE) {
            count += 1;
        }
        stack.push(...((node.children ?? []) as never[]));
    }
    return count;
}

/** Number of spoiler tokens the native inline rule produces. */
function nativeSpoilerCount(markdown: string): number {
    const md = registerSpoilerRule(new MarkdownIt({ typographer: true }));

    return md
        .parse(markdown, {})
        .flatMap((token) => token.children ?? [])
        .filter((token) => token.type === SPOILER_TOKEN_TYPE).length;
}

/**
 * Inputs where both renderers must agree.
 *
 * These are the cases where a user would notice the platforms behaving
 * differently for the same message. Anything not listed here is either
 * platform-specific by design (block-level nesting on web) or untested.
 */
const SHARED_CASES = [
    "a [spoiler]b[/spoiler] c",
    "[spoiler]a[/spoiler]",
    "a [spoiler][/spoiler] b",
    "[spoiler]a[/spoiler][spoiler]b[/spoiler]",
    "[spoiler]**bold**[/spoiler]",
    "before [spoiler]x[/spoiler] after",
    // Malformed input must never produce a spoiler on either platform.
    "a [spoiler]unclosed",
    "a stray[/spoiler]",
    // Delimiters inside code are literal, not spoilers.
    "`[spoiler]x[/spoiler]`",
    "```\n[spoiler]x[/spoiler]\n```",
] as const;

describe("web/native parity", () => {
    for (const markdown of SHARED_CASES) {
        it(`agree on ${JSON.stringify(markdown)}`, () => {
            expect(webSpoilerCount(markdown)).toBe(
                nativeSpoilerCount(markdown),
            );
        });
    }

    it("is a sanity check that spoilers are actually detected", () => {
        // Guards against the parity loop passing because both sides return zero.
        expect(webSpoilerCount("a [spoiler]b[/spoiler] c")).toBe(1);
        expect(nativeSpoilerCount("a [spoiler]b[/spoiler] c")).toBe(1);
    });

    it("converts a spoiler to HTML on the web pipeline", async () => {
        const html = await unified()
            .use(remarkParse)
            .use(remarkSpoiler)
            .use(remarkRehype, { allowDangerousHtml: true })
            .use(rehypeStringify, { allowDangerousHtml: true })
            .process("[spoiler]x[/spoiler]");

        expect(String(html)).toContain("firepit-spoiler");
    });
});
