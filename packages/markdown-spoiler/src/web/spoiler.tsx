"use client";

import { useId, useState } from "react";

/**
 * Styling hooks. The package ships no CSS and hard-codes no colours, so a
 * consumer can theme a spoiler with its own design tokens without overriding
 * anything.
 */
export type SpoilerClassNames = {
    /** Wrapper around the whole thing, collapsed or revealed. */
    readonly root?: string;
    /** The collapsed placeholder button. */
    readonly trigger?: string;
    /** The revealed content wrapper. */
    readonly content?: string;
};

export type SpoilerProps = {
    /**
     * The spoiler body, already rendered as React nodes by the caller's
     * Markdown renderer. Not rendered at all while collapsed.
     */
    readonly children: React.ReactNode;
    /** Visible text drawn on the collapsed button. */
    readonly placeholder?: string;
    /** Visible text drawn on the button once revealed, to hide it again. */
    readonly hideLabel?: string;
    /** Start revealed. Useful for previews, quotes and search results. */
    readonly defaultRevealed?: boolean;
    /** Controlled reveal state. When set, `onRevealedChange` is required. */
    readonly revealed?: boolean;
    readonly onRevealedChange?: (revealed: boolean) => void;
    readonly classNames?: SpoilerClassNames;
};

const DEFAULT_HIDE_LABEL = "Hide spoiler";
const DEFAULT_PLACEHOLDER = "Click to reveal";

/**
 * A click-to-reveal spoiler.
 *
 * While collapsed, the body is **not rendered**. There is no blurred copy, no
 * `filter: blur()` layer and no decorative animation, which means hidden text is
 * genuinely absent from the DOM: screen readers cannot read ahead into it,
 * hidden links are never in the tab order, and a spoiler costs one button to
 * render rather than a composited blur pass over arbitrary content.
 */
export function Spoiler({
    children,
    placeholder = DEFAULT_PLACEHOLDER,
    hideLabel = DEFAULT_HIDE_LABEL,
    defaultRevealed = false,
    revealed,
    onRevealedChange,
    classNames,
}: SpoilerProps) {
    const [internalRevealed, setInternalRevealed] = useState(defaultRevealed);
    const isControlled = revealed !== undefined;
    const isRevealed = isControlled ? revealed : internalRevealed;
    const contentId = useId();

    const setRevealed = (next: boolean) => {
        if (!isControlled) {
            setInternalRevealed(next);
        }
        onRevealedChange?.(next);
    };

    return (
        <span
            className={classNames?.root}
            data-spoiler="true"
            data-revealed={isRevealed ? "true" : "false"}
        >
            <button
                type="button"
                aria-expanded={isRevealed}
                aria-controls={contentId}
                className={classNames?.trigger}
                onClick={() => {
                    setRevealed(!isRevealed);
                }}
            >
                {isRevealed ? hideLabel : placeholder}
            </button>
            {isRevealed ? (
                <span className={classNames?.content} id={contentId}>
                    {children}
                </span>
            ) : null}
        </span>
    );
}
