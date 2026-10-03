import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";

import { SPOILER_CLOSE, SPOILER_OPEN } from "../shared/syntax.js";

/**
 * `markdown-it` token type for a spoiler region.
 *
 * The app consumes this through `rules.spoiler` in
 * `react-native-markdown-display`.
 */
export const SPOILER_TOKEN_TYPE = "spoiler";

/** Marker so the rule is only ever registered once per parser instance. */
const INSTALLED = "__firepitSpoilerInstalled";

type SpoilerCapableMarkdownIt = MarkdownIt & { [INSTALLED]?: boolean };

/**
 * Register the `[spoiler]` inline rule on a `markdown-it` instance.
 *
 * The rule runs before `emphasis`, which is what lets a spoiler wrap Markdown
 * formatting: `**bold**` inside a spoiler is still tokenized as emphasis rather
 * than swallowed as literal text.
 *
 * Requires `markdown-it` to be installed in the consuming app. It already comes
 * with `react-native-markdown-display`, but relying on a transitive install is
 * fragile, so it is declared as an optional peer.
 */
export function registerSpoilerRule(markdownit: MarkdownIt): MarkdownIt {
    const capable = markdownit as SpoilerCapableMarkdownIt;

    if (capable[INSTALLED] === true) {
        return markdownit;
    }

    markdownit.inline.ruler.before(
        "emphasis",
        "firepit_spoiler",
        scanSpoilerDelimiters,
    );

    capable[INSTALLED] = true;

    return markdownit;
}

/**
 * Consume a balanced spoiler region at `state.pos`, if one starts there.
 */
function scanSpoilerDelimiters(state: StateInline, silent: boolean): boolean {
    const { src, pos, posMax } = state;

    if (!src.startsWith(SPOILER_OPEN, pos)) {
        return false;
    }

    const bodyStart = pos + SPOILER_OPEN.length;
    const bodyEnd = src.indexOf(SPOILER_CLOSE, bodyStart);

    // An unclosed opener is not a spoiler. Returning false leaves it as literal
    // text, so a typo renders visibly instead of swallowing the rest of the
    // message.
    if (bodyEnd === -1 || bodyEnd > posMax) {
        return false;
    }

    if (!silent) {
        // `state.push` rather than `state.tokens.push`: push flushes any pending
        // text token first, so the spoiler lands in the right document order.
        //
        // A spoiler carries no inline children of its own — its body is raw
        // Markdown that the app re-parses — so no closing token is emitted.
        // `react-native-markdown-display` strips `_open`/`_close` from token
        // types before dispatching to a rule (`getTokenTypeByToken`), so a
        // `spoiler_close` token would map back to `spoiler` and render a second,
        // empty spoiler. A single unclosed token is what that renderer expects.
        const token = state.push(SPOILER_TOKEN_TYPE, "", 0);
        token.content = src.slice(bodyStart, bodyEnd);
    }

    state.pos = bodyEnd + SPOILER_CLOSE.length;

    return true;
}

/**
 * Build a `markdown-it` instance with spoiler support enabled.
 *
 * Convenience wrapper for the common case and for tests. An app that already
 * owns its parser configuration should call {@link registerSpoilerRule} on its
 * existing instance instead.
 */
export function createSpoilerMarkdownIt(
    MarkdownItCtor: new (options?: Record<string, unknown>) => MarkdownIt,
    options?: { typographer?: boolean },
): MarkdownIt {
    return registerSpoilerRule(new MarkdownItCtor(options));
}

export { SPOILER_CLOSE, SPOILER_OPEN };
