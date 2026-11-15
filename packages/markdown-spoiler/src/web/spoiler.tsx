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
    /**
     * Render the trigger as a focusable `<span role="button">` instead of a
     * real `<button>`.
     *
     * HTML forbids interactive content inside a `<button>`, so a spoiler
     * rendered inside one — a search result row, for example — would otherwise
     * produce invalid markup and a React hydration error. The span form keeps
     * the same role, expanded state and keyboard handling.
     *
     * Prefer the default real button everywhere else.
     */
    readonly inlineTrigger?: boolean;
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
    inlineTrigger = false,
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
            <Trigger
                inline={inlineTrigger}
                expanded={isRevealed}
                controls={contentId}
                className={classNames?.trigger}
                label={isRevealed ? hideLabel : placeholder}
                onActivate={() => {
                    setRevealed(!isRevealed);
                }}
            />
            {isRevealed ? (
                <span className={classNames?.content} id={contentId}>
                    {children}
                </span>
            ) : null}
        </span>
    );
}

type TriggerProps = {
    inline: boolean;
    expanded: boolean;
    controls: string;
    className?: string;
    label: string;
    onActivate: () => void;
};

/**
 * The reveal control.
 *
 * A real `<button>` by default. The inline variant exists only because HTML
 * forbids interactive content inside a `<button>`, so a spoiler rendered within
 * one needs a non-button element that still exposes the same semantics.
 */
function Trigger({
    inline,
    expanded,
    controls,
    className,
    label,
    onActivate,
}: TriggerProps) {
    if (inline) {
        return (
            <span
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-controls={controls}
                className={className}
                onClick={onActivate}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onActivate();
                    }
                }}
            >
                {label}
            </span>
        );
    }

    return (
        <button
            type="button"
            aria-expanded={expanded}
            aria-controls={controls}
            className={className}
            onClick={onActivate}
        >
            {label}
        </button>
    );
}
