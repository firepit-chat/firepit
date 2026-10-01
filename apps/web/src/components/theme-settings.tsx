"use client";

import { Check } from "lucide-react";
import { useTheme } from "@teispace/next-themes";

import { useAccent } from "@/components/accent-provider";
import {
    ACCENT_LABELS,
    ACCENT_NAMES,
    DEFAULT_ACCENT,
    DEFAULT_THEME,
    THEME_LABELS,
    THEME_NAMES,
    isAccentName,
    isThemeName,
} from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * Theme and accent pickers.
 *
 * The previews do not hardcode any colours: each swatch carries its own
 * `data-theme` / `data-accent` pair, so the `[data-theme]` and `[data-accent]`
 * blocks in index.css resolve inside that swatch and it renders a real sample
 * of the palette the user is about to pick.
 */
export function ThemeSettings() {
    const { resolvedTheme, setTheme } = useTheme();
    const { accent, setAccent } = useAccent();

    // Before hydration the library has not resolved, so fall back rather than
    // rendering every swatch unchecked.
    const currentTheme = isThemeName(resolvedTheme) ? resolvedTheme : DEFAULT_THEME;
    const currentAccent = isAccentName(accent) ? accent : DEFAULT_ACCENT;

    return (
        <div className="grid gap-6">
            <div className="grid gap-3">
                <p className="text-sm font-medium">Palette</p>
                <div
                    className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                    role="radiogroup"
                    aria-label="Colour palette"
                >
                    {THEME_NAMES.map((name) => {
                        const selected = name === currentTheme;
                        return (
                            <button
                                key={name}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setTheme(name)}
                                className={cn(
                                    "flex flex-col gap-2 rounded-xl border p-2 text-left transition-colors",
                                    "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    selected
                                        ? "border-primary"
                                        : "border-border",
                                )}
                            >
                                {/*
                                 * These swatches are styled inline on purpose.
                                 * The Tailwind arbitrary-value shorthand for
                                 * "background from a CSS variable" compiles to
                                 * nothing in this setup, which shipped blank
                                 * swatches, and writing that shorthand in a
                                 * comment is itself a trap: the scanner reads
                                 * raw text and will happily generate a rule
                                 * from it, breaking the CSS parse at build
                                 * time. So keep variable-driven colours inline
                                 * and out of the source text.
                                 *
                                 * The palette comes from the data-theme and
                                 * data-accent pair on this element, so the
                                 * variables resolve per swatch.
                                 */}
                                <span
                                    data-theme={name}
                                    data-accent={currentAccent}
                                    aria-hidden="true"
                                    className="flex h-14 w-full overflow-hidden rounded-lg border border-border/60"
                                >
                                    <span
                                        className="flex-1"
                                        style={{ backgroundColor: "var(--background)" }}
                                    />
                                    <span
                                        className="flex-1"
                                        style={{ backgroundColor: "var(--primary)" }}
                                    />
                                    <span
                                        className="flex-1"
                                        style={{ backgroundColor: "var(--accent)" }}
                                    />
                                </span>
                                <span className="flex items-center justify-between gap-2 px-0.5 text-sm">
                                    {THEME_LABELS[name]}
                                    {selected ? (
                                        <Check
                                            aria-hidden="true"
                                            className="h-4 w-4 text-primary"
                                        />
                                    ) : null}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid gap-3">
                <p className="text-sm font-medium">Accent</p>
                <div
                    className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
                    role="radiogroup"
                    aria-label="Accent colour"
                >
                    {ACCENT_NAMES.map((name) => {
                        const selected = name === currentAccent;
                        return (
                            <button
                                key={name}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                aria-label={ACCENT_LABELS[name]}
                                title={ACCENT_LABELS[name]}
                                onClick={() => setAccent(name)}
                                className={cn(
                                    "flex items-center gap-2 rounded-lg border px-2 py-2 text-sm transition-colors",
                                    "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    selected
                                        ? "border-primary"
                                        : "border-border",
                                )}
                            >
                                <span
                                    data-theme={currentTheme}
                                    data-accent={name}
                                    aria-hidden="true"
                                    className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/10"
                                    style={{ backgroundColor: "var(--primary)" }}
                                />
                                <span className="truncate">
                                    {ACCENT_LABELS[name]}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
