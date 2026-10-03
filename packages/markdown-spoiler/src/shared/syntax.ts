/**
 * The spoiler grammar. This module is the single source of truth for parsing
 * `[spoiler]...[/spoiler]` and is shared verbatim by both the web and the React
 * Native adapters. Neither adapter may re-implement this logic.
 */

/** Opening delimiter. */
export const SPOILER_OPEN = "[spoiler]";

/** Closing delimiter. */
export const SPOILER_CLOSE = "[/spoiler]";

/** Appended to truncated text to show that content was cut. */
const ELLIPSIS = "...";

/**
 * Matches a spoiler region. Group 1 is the body.
 *
 * Deliberately non-global: callers use `.exec` in a loop and must reset
 * `lastIndex` themselves, or should prefer {@link splitBySpoilers}.
 */
const SPOILER_PATTERN = /\[spoiler\]([\s\S]*?)\[\/spoiler\]/;

/**
 * True when `text` contains at least one well-formed spoiler region.
 *
 * Useful as a cheap gate to decide whether to invoke a spoiler-aware render
 * path at all, mirroring how chat renderers short-circuit on "is there any
 * Markdown here at all".
 */
export function hasSpoilerSyntax(text: string): boolean {
    return text.includes(SPOILER_OPEN) && text.includes(SPOILER_CLOSE);
}

export type SpoilerSegment =
    /** Literal text, rendered as-is. */
    | { type: "text"; value: string }
    /** A spoiler region whose body should be rendered as Markdown. */
    | { type: "spoiler"; value: string };

/** A single piece of a delimiter tokenized out of a raw text value. */
export type SpoilerToken =
    | { kind: "text"; value: string }
    | { kind: "open"; value: string }
    | { kind: "close"; value: string };

/**
 * Tokenize a raw text value on spoiler delimiters.
 *
 * This is the shared primitive: the web plugin lifts tokens into structural
 * nodes, and the React Native adapter renders them directly. Both therefore
 * agree on where every delimiter begins and ends.
 *
 * Delimiters are emitted in source order and are deliberately *not* matched
 * here. Deciding which delimiters pair up requires knowing the surrounding
 * node structure, which is the caller's concern.
 */
export function tokenizeSpoilerDelimiters(value: string): SpoilerToken[] {
    if (!value.includes(SPOILER_OPEN) && !value.includes(SPOILER_CLOSE)) {
        return [{ kind: "text", value }];
    }

    const tokens: SpoilerToken[] = [];
    let cursor = 0;

    for (;;) {
        const openIndex = value.indexOf(SPOILER_OPEN, cursor);
        const closeIndex = value.indexOf(SPOILER_CLOSE, cursor);

        if (openIndex === -1 && closeIndex === -1) {
            break;
        }

        // When both delimiters appear in the same run of text, the earlier one
        // wins and the other is found on a later iteration.
        const takeOpen =
            openIndex !== -1 && (closeIndex === -1 || openIndex < closeIndex);
        const index = takeOpen ? openIndex : closeIndex;

        if (index > cursor) {
            tokens.push({ kind: "text", value: value.slice(cursor, index) });
        }

        tokens.push({
            kind: takeOpen ? "open" : "close",
            value: takeOpen ? SPOILER_OPEN : SPOILER_CLOSE,
        });
        cursor = index + (takeOpen ? SPOILER_OPEN : SPOILER_CLOSE).length;
    }

    if (cursor < value.length) {
        tokens.push({ kind: "text", value: value.slice(cursor) });
    }

    return tokens;
}

/**
 * Split `text` into plain-text and spoiler segments.
 *
 * A `spoiler` segment's `value` is the raw inner body, which callers should
 * re-render through their own Markdown renderer so nested formatting, links and
 * images continue to work.
 *
 * Malformed input degrades to literal text rather than throwing or dropping
 * content, because message text is user-authored and untrusted:
 *
 * - An unclosed `[spoiler]` is emitted as plain text.
 * - A stray `[/spoiler]` is emitted as plain text.
 * - A spoiler that spans a blank line is still treated as a single spoiler,
 *   because splitting on paragraph boundaries is the caller's concern, not the
 *   tokenizer's.
 *
 * Regions are non-greedy, so `[spoiler]a[/spoiler]b[/spoiler]` yields two
 * spoilers. Genuine nesting (`[spoiler]a [spoiler]b[/spoiler] c[/spoiler]`) is
 * **not** supported and is treated as two sequential spoilers, matching how
 * BBCode-style parsers on chat platforms generally behave.
 */
export function splitBySpoilers(text: string): SpoilerSegment[] {
    if (!hasSpoilerSyntax(text)) {
        return [{ type: "text", value: text }];
    }

    const segments: SpoilerSegment[] = [];
    const pattern = new RegExp(SPOILER_PATTERN.source, "g");
    let cursor = 0;
    let match = pattern.exec(text);

    while (match !== null) {
        if (match.index > cursor) {
            segments.push({
                type: "text",
                value: text.slice(cursor, match.index),
            });
        }

        segments.push({ type: "spoiler", value: match[1] ?? "" });
        cursor = match.index + match[0].length;
        match = pattern.exec(text);
    }

    if (cursor === 0) {
        // `hasSpoilerSyntax` passed but nothing matched: e.g. the closing tag
        // appears before the opening one. Preserve the original text verbatim.
        return [{ type: "text", value: text }];
    }

    if (cursor < text.length) {
        segments.push({ type: "text", value: text.slice(cursor) });
    }

    return segments;
}

/**
 * Remove spoiler delimiters, leaving the revealed body inline.
 *
 * Intended for surfaces that must not leak hidden content into a spoiler —
 * search indexing, notification bodies, and reply-preview snippets.
 *
 * Note this intentionally does not attempt to redact the *body*: a spoiler
 * guards against glance-reading, not against a user who deliberately searches
 * for the text.
 */
export function stripSpoilerSyntax(text: string): string {
    if (!text.includes(SPOILER_OPEN) && !text.includes(SPOILER_CLOSE)) {
        return text;
    }

    // Each delimiter is stripped independently rather than as a matched pair.
    // A truncated message can easily contain only one half of the pair, and a
    // stray `[spoiler]` leaking into a notification body or a reply preview is
    // exactly the kind of raw syntax this function exists to prevent.
    return text.split(SPOILER_OPEN).join("").split(SPOILER_CLOSE).join("");
}

/**
 * Truncate `text` for a surface that renders **Markdown**, keeping spoilers
 * intact so the reader gets a real, revealable spoiler control.
 *
 * Slicing the raw string is unsafe here. A cut that lands inside a spoiler
 * leaves an unclosed `[spoiler]`, which every renderer treats as literal text —
 * so a 150-character preview would render the first 150 characters of a hidden
 * spoiler in plain sight, exactly what a spoiler exists to prevent.
 *
 * So a spoiler the cut lands inside is dropped, while every complete spoiler
 * before it is preserved with both delimiters intact. This is the right helper
 * for search results, where the message body is Markdown and a spoiler should
 * read as a spoiler.
 */
export function truncateMarkdown(text: string, maxLength: number): string {
    const budget = Math.max(maxLength - ELLIPSIS.length, 0);
    const window = text.slice(0, budget);
    const opens = countOccurrences(window, SPOILER_OPEN);
    const closes = countOccurrences(window, SPOILER_CLOSE);

    if (opens > closes) {
        // The cut landed inside a spoiler. Keep the text before its opener and
        // close the spoiler off, so what remains is still valid Markdown that a
        // renderer can show with an intact spoiler in it.
        return `${window.slice(0, window.lastIndexOf(SPOILER_OPEN))}${SPOILER_CLOSE}`;
    }

    return text.length <= maxLength ? text : `${window}${ELLIPSIS}`;
}

/**
 * Truncate `text` for a surface that renders **plain text**, such as a
 * notification body or a reply-preview snippet.
 *
 * There is no spoiler control on those surfaces, so delimiters are removed with
 * {@link stripSpoilerSyntax} and any spoiler the cut lands inside is dropped
 * rather than leaked.
 *
 * Note this keeps the revealed body of a *complete* spoiler. That is
 * intentional: these are context snippets, and the alternative — showing
 * `[spoiler]` to a user who cannot act on it — is worse than showing the text.
 */
export function truncatePlainText(text: string, maxLength: number): string {
    if (maxLength <= 0) {
        return "";
    }

    if (text.length <= maxLength) {
        return stripSpoilerSyntax(text);
    }

    const window = text.slice(0, Math.max(maxLength - ELLIPSIS.length, 0));

    if (
        countOccurrences(window, SPOILER_OPEN) >
        countOccurrences(window, SPOILER_CLOSE)
    ) {
        return stripSpoilerSyntax(
            window.slice(0, window.lastIndexOf(SPOILER_OPEN)),
        );
    }

    return `${stripSpoilerSyntax(window)}${ELLIPSIS}`;
}

function countOccurrences(haystack: string, needle: string): number {
    let count = 0;
    let index = haystack.indexOf(needle);

    while (index !== -1) {
        count += 1;
        index = haystack.indexOf(needle, index + needle.length);
    }

    return count;
}
