import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import {
    containsSpoilerSyntax,
    remarkSpoiler,
    type TreeNode,
} from "../src/web/remark-spoiler";

/** Parse Markdown and run the plugin, returning the mutated mdast tree. */
function runPlugin(markdown: string): TreeNode {
    const processor = unified().use(remarkParse).use(remarkSpoiler);
    const tree = processor.parse(markdown) as TreeNode;
    processor.runSync(tree as never);
    return tree;
}

/**
 * Flatten the tree to a readable string for concise assertions. Text nodes
 * render as bare JSON strings, so `strong(text("a"))` prints as `strong("a")`.
 */
function shape(node: TreeNode): string {
    if (node.type === "text") {
        return JSON.stringify(node.value ?? "");
    }
    const children = node.children ?? [];
    return `${node.type}(${children.map(shape).join(",")})`;
}

/** Shape of the tree's children, dropping the `root` wrapper. */
function shapeBody(markdown: string): string {
    return (runPlugin(markdown).children ?? []).map(shape).join(",");
}

/** The first spoiler node in the tree, for focused assertions. */
function firstSpoiler(tree: TreeNode): TreeNode {
    const stack: TreeNode[] = [...(tree.children ?? [])];

    while (stack.length > 0) {
        const node = stack.shift() as TreeNode;
        if (node.type === "spoiler") {
            return node;
        }
        stack.push(...(node.children ?? []));
    }

    throw new Error("no spoiler node found");
}

describe("remarkSpoiler", () => {
    it("wraps a plain spoiler body in a spoiler node", () => {
        expect(shapeBody("a [spoiler]secret[/spoiler] b")).toBe(
            'paragraph("a ",spoiler("secret")," b")',
        );
    });

    it("sets hName so react-markdown can route it to a custom component", () => {
        const spoiler = firstSpoiler(runPlugin("[spoiler]x[/spoiler]"));

        expect(spoiler.type).toBe("spoiler");
        expect(spoiler.data?.hName).toBe("firepit-spoiler");
        expect(spoiler.data?.hProperties).toEqual({ "data-spoiler": "true" });
    });

    it("captures formatting inside the spoiler as sibling children", () => {
        // The delimiters and the emphasis land in different nodes, so the match
        // has to happen across siblings rather than within one text node.
        expect(shapeBody("[spoiler]**bold**[/spoiler]")).toBe(
            'paragraph(spoiler(strong("bold")))',
        );
    });

    it("captures a link inside the spoiler", () => {
        // mdast carries a link's target on `.url`, not as a child node.
        expect(shapeBody("[spoiler][x](https://e.com)[/spoiler]")).toBe(
            'paragraph(spoiler(link("x")))',
        );
    });

    it("produces a spoiler per region for sequential spoilers", () => {
        expect(shapeBody("[spoiler]a[/spoiler] mid [spoiler]b[/spoiler]")).toBe(
            'paragraph(spoiler("a")," mid ",spoiler("b"))',
        );
    });

    it("restores an unmatched opener as literal text", () => {
        // The final `[/spoiler]` closes the opener, so `b` is lost from the
        // spoiler frame. Putting the delimiter back means the user sees their
        // own syntax rather than silently missing content.
        expect(shapeBody("a [spoiler]b")).toBe(
            'paragraph("a ","[spoiler]","b")',
        );
    });

    it("leaves a stray closer as literal text", () => {
        expect(shapeBody("a b[/spoiler]")).toBe(
            'paragraph("a b","[/spoiler]")',
        );
    });

    it("leaves an unmatched nested opener visible", () => {
        // The outer spoiler never closes, so its delimiter is restored. The
        // user sees their own syntax; nothing is silently swallowed.
        expect(shapeBody("[spoiler]a [spoiler]b[/spoiler]")).toBe(
            'paragraph("[spoiler]","a ",spoiler("b"))',
        );
    });

    it("ignores delimiters inside a fenced code block", () => {
        expect(
            shape(runPlugin("```\n[spoiler]x[/spoiler]\n```")),
        ).not.toContain("spoiler(");
    });

    it("ignores delimiters inside an inline code span", () => {
        // `inlineCode` keeps its literal text on `.value`, and it is skipped
        // before its children are ever considered.
        expect(shapeBody("`[spoiler]x[/spoiler]`")).toBe(
            "paragraph(inlineCode())",
        );
    });

    it("handles an empty spoiler body", () => {
        expect(shapeBody("a [spoiler][/spoiler] b")).toBe(
            'paragraph("a ",spoiler()," b")',
        );
    });

    it("works inside a list item", () => {
        expect(shapeBody("- [spoiler]x[/spoiler]")).toBe(
            'list(listItem(paragraph(spoiler("x"))))',
        );
    });

    it("scans nested containers inside a spoiler body", () => {
        // Genuine nesting: the inner spoiler is emitted into the outer
        // spoiler's body, so revealing the outer one still reveals the inner.
        expect(
            shapeBody(
                "- [spoiler]outer [spoiler]inner[/spoiler] tail[/spoiler]",
            ),
        ).toBe(
            'list(listItem(paragraph(spoiler("outer ",spoiler("inner")," tail"))))',
        );
    });

    it("does not match across block boundaries", () => {
        // Documented limitation: a spoiler cannot span multiple block-level
        // containers, because the delimiters land in separate paragraphs.
        expect(shape(runPlugin("[spoiler]\n\npara\n\n[/spoiler]"))).toContain(
            '"[/spoiler]"',
        );
    });

    it("converts to HTML through the pipeline", async () => {
        const html = await unified()
            .use(remarkParse)
            .use(remarkSpoiler)
            .use(remarkRehype, { allowDangerousHtml: true })
            .use(rehypeStringify, { allowDangerousHtml: true })
            .process("[spoiler]x[/spoiler]");

        expect(String(html)).toContain("firepit-spoiler");
    });
});

describe("containsSpoilerSyntax", () => {
    it("is true for a single delimiter, so typos still get parsed", () => {
        expect(containsSpoilerSyntax("a [spoiler]b")).toBe(true);
        expect(containsSpoilerSyntax("a b[/spoiler]")).toBe(true);
    });

    it("is false for plain text", () => {
        expect(containsSpoilerSyntax("nothing here")).toBe(false);
    });

    it("agrees with hasSpoilerSyntax on well-formed input", () => {
        expect(containsSpoilerSyntax("a [spoiler]b[/spoiler]")).toBe(true);
    });
});
