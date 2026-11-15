"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import type { CustomEmoji } from "@/lib/types";

type EmojiRendererProps = {
    text: string;
    customEmojis?: CustomEmoji[];
};

// Gate for the `:shortcode:` path. Must stay in sync with the pattern in
// `emoji-shortcodes.tsx`, which only loads when this matches.
const SHORTCODE_PATTERN = /:([a-zA-Z0-9_+-]+):/;

const EmojiShortcodes = dynamic(() =>
    import("@/components/emoji-shortcodes").then((m) => m.EmojiShortcodes),
);

/**
 * Renders text with custom emoji and standard emoji support.
 * Converts :emoji-name: syntax to custom emoji images or standard Unicode emojis.
 */
export const EmojiRenderer = memo(function EmojiRenderer({
    text,
    customEmojis = [],
}: EmojiRendererProps) {
    // Fast path: no `:shortcode:` in the text, so `node-emoji`'s ~29 KB gzip
    // emojilib dataset is never loaded.
    if (!SHORTCODE_PATTERN.test(text)) {
        return <span>{text}</span>;
    }

    return (
        <span>
            <EmojiShortcodes customEmojis={customEmojis} text={text} />
        </span>
    );
});
