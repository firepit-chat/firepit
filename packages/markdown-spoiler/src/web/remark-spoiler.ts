import type { Root } from "mdast";

import {
    SPOILER_CLOSE,
    SPOILER_OPEN,
    tokenizeSpoilerDelimiters,
} from "../shared/syntax.js";

/**
 * `hName` for a spoiler region. Consumers wire this to their renderer in the
 * react-markdown `components` map.
 */
export const SPOILER_TAG_NAME = "firepit-spoiler";

/**
 * Node types whose text is literal and must never be scanned for spoilers. A
 * `[spoiler]` inside a code span or fenced block is code, not a spoiler.
 */
const LITERAL_TEXT_TYPES = new Set(["code", "inlineCode"]);

/**
 * Minimal structural view of an mdast node.
 *
 * mdast's `Nodes` union is closed, so a plugin that introduces a new node type
 * cannot describe its own output with it. Working structurally keeps the plugin
 * honest without widening the public type surface to `any`.
 */
export type TreeNode = {
    readonly type: string;
    readonly value?: string;
    children?: TreeNode[];
    data?: Record<string, unknown>;
};

export type SpoilerNode = TreeNode & {
    readonly type: "spoiler";
    readonly children: TreeNode[];
    readonly data: {
        readonly hName: string;
        readonly hProperties: Record<string, string>;
    };
};

/**
 * Rewrite `[spoiler]...[/spoiler]` regions into structured spoiler nodes,
 * before the tree is converted to HTML.
 *
 * Regions are matched across *sibling* nodes rather than within a single text
 * node. That is what makes `[spoiler]**bold**[/spoiler]` and
 * `[spoiler][label](https://example.com)[/spoiler]` work: the parser has
 * already turned the inner Markdown into separate nodes by the time this runs,
 * so a text-node-local match would miss both.
 *
 * Malformed input degrades to literal text. An unclosed `[spoiler]` leaves its
 * delimiter in the output, so a bad message renders visibly rather than
 * silently dropping content. A nested opener closes the outer spoiler and
 * starts a new one, so the remainder of the message is never swallowed.
 *
 * Two limitations follow from matching within a single parent node, and are
 * deliberate:
 *
 * - A spoiler cannot span block-level containers, because the delimiters land
 *   in different paragraphs.
 * - A spoiler cannot span two list items, for the same reason.
 */
export function remarkSpoiler() {
    return (tree: Root): void => {
        rewriteChildren(tree as unknown as TreeNode);
    };
}

function rewriteChildren(node: TreeNode): void {
    if (LITERAL_TEXT_TYPES.has(node.type) || !node.children) {
        return;
    }

    const rewritten = scanSequence(node.children);

    node.children = rewritten;

    // Recurse into the result so containers nested inside a spoiler body are
    // themselves scanned. Newly created spoiler nodes are visited too, which is
    // safe because their bodies no longer contain balanced delimiters.
    for (const child of rewritten) {
        if (child.children) {
            rewriteChildren(child);
        }
    }
}

/**
 * Walk a list of sibling nodes, lifting balanced spoiler regions out into
 * spoiler nodes and leaving everything else in document order.
 */
function scanSequence(children: TreeNode[]): TreeNode[] {
    const output: TreeNode[] = [];
    /** One frame per open spoiler, holding the nodes collected inside it. */
    const stack: { opener: string; nodes: TreeNode[] }[] = [];

    /**
     * Where nodes currently belong: the innermost open spoiler's body, or the
     * output array when no spoiler is open. This is what makes genuine nesting
     * work — an inner spoiler is emitted into its parent's body.
     */
    const current = (): TreeNode[] => {
        if (stack.length === 0) {
            return output;
        }
        return (stack[stack.length - 1] as { nodes: TreeNode[] }).nodes;
    };

    for (const child of children) {
        if (child.type !== "text") {
            current().push(child);
            continue;
        }

        for (const token of tokenizeSpoilerDelimiters(child.value ?? "")) {
            if (token.kind === "text") {
                if (token.value !== "") {
                    current().push({ type: "text", value: token.value });
                }
                continue;
            }

            if (token.kind === "open") {
                stack.push({ opener: token.value, nodes: [] });
                continue;
            }

            const frame = stack.pop();
            if (frame === undefined) {
                // A closer with no opener stays as literal text.
                current().push({ type: "text", value: token.value });
                continue;
            }

            // The finished spoiler becomes a child of whatever encloses it.
            current().push(createSpoilerNode(frame.nodes));
        }
    }

    // Any spoiler still open was never closed by the user. Restore its opening
    // delimiter as literal text so no authored content is silently dropped.
    while (stack.length > 0) {
        const frame = stack.pop() as { opener: string; nodes: TreeNode[] };
        current().push({ type: "text", value: frame.opener });
        current().push(...frame.nodes);
    }

    return output;
}

function createSpoilerNode(children: TreeNode[]): SpoilerNode {
    return {
        type: "spoiler",
        children,
        data: {
            hName: SPOILER_TAG_NAME,
            hProperties: { "data-spoiler": "true" },
        },
    } as SpoilerNode;
}

/**
 * Detect a possible spoiler region in raw text, without parsing Markdown.
 *
 * This is deliberately looser than {@link hasSpoilerSyntax}: a single
 * delimiter is enough to justify parsing, because an unmatched `[spoiler]` is
 * a common typo and the caller still needs the plugin in order to render it as
 * literal text rather than leaving a stray marker in the output.
 *
 * Consumers should use this to decide whether to opt into {@link remarkSpoiler}
 * at all, mirroring the fast path chat renderers use to avoid parsing Markdown
 * for plain messages.
 */
export function containsSpoilerSyntax(text: string): boolean {
    return text.includes(SPOILER_OPEN) || text.includes(SPOILER_CLOSE);
}

/** True when `node` is a spoiler produced by this plugin. */
export function isSpoilerNode(node: unknown): node is SpoilerNode {
    return (
        typeof node === "object" &&
        node !== null &&
        (node as { type?: unknown }).type === "spoiler"
    );
}
