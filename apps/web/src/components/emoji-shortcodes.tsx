"use client";

import * as emoji from "node-emoji";
import type { CustomEmoji } from "@/lib/types";

type EmojiShortcodesProps = {
    customEmojis: CustomEmoji[];
    text: string;
};

/**
 * The `:shortcode:` half of EmojiRenderer.
 *
 * Split out because `node-emoji` inlines the whole emojilib dataset (~190 KB raw,
 * ~29 KB gzip) and this component is the only consumer. Most messages contain no
 * shortcode at all, so `EmojiRenderer` only loads this when the text actually
 * matches one, keeping the dataset out of the initial chat payload.
 *
 * The pattern below must stay in sync with the gate in `emoji-renderer.tsx`.
 */
export function EmojiShortcodes({ customEmojis, text }: EmojiShortcodesProps) {
    const parts: Array<string | React.JSX.Element> = [];
    let lastIndex = 0;
    let match;

    const emojiPattern = /:([a-zA-Z0-9_+-]+):/g;

    while ((match = emojiPattern.exec(text)) !== null) {
        const [fullMatch, emojiName] = match;
        const matchIndex = match.index;

        // Add text before the emoji
        if (matchIndex > lastIndex) {
            parts.push(text.slice(lastIndex, matchIndex));
        }

        // First, try to find matching custom emoji
        const customEmoji = customEmojis.find((e) => e.name === emojiName);

        if (customEmoji) {
            // Render as custom emoji image
            parts.push(
                <img
                    key={`${customEmoji.fileId}-${matchIndex}`}
                    src={customEmoji.url}
                    alt={`:${emojiName}:`}
                    title={`:${emojiName}:`}
                    className="inline-block size-5 align-middle"
                    loading="lazy"
                    decoding="async"
                    crossOrigin="anonymous"
                />,
            );
        } else {
            // Try to convert to standard emoji using node-emoji
            const standardEmoji = emoji.get(emojiName);

            if (standardEmoji && standardEmoji !== `:${emojiName}:`) {
                // Found a standard emoji, render as Unicode character
                parts.push(standardEmoji);
            } else {
                // Not found in either custom or standard, keep original text
                parts.push(fullMatch);
            }
        }

        lastIndex = matchIndex + fullMatch.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return <>{parts}</>;
}
