"use client";

import { ThemeProvider as TeispaceThemeProvider } from "@teispace/next-themes";
import { useState } from "react";
import type * as React from "react";

import { THEME_NAMES, DEFAULT_THEME, DARK_DEFAULT_THEME } from "@/lib/themes";

/**
 * Wraps `@teispace/next-themes`.
 *
 * The default `attribute` for that library is already `data-theme` and the
 * default storage is cookie-backed `hybrid`, which is what removes the launch
 * flash. The palette list comes from `@/lib/themes` so it cannot drift from the
 * `[data-theme]` blocks in `index.css`.
 */
export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof TeispaceThemeProvider>) {
    // Must agree with the pre-paint script in the root layout, which seeds the
    // theme cookie from this same OS preference. If the provider disagreed, it
    // would overwrite the attribute on mount and undo the script. `enableSystem`
    // stays off because the library resolves "system" to the literal string
    // "system", which matches no palette and so has no CSS.
    const [defaultTheme] = useState<string>(() => {
        if (typeof window === "undefined") {
            return DEFAULT_THEME;
        }
        return window.matchMedia?.("(prefers-color-scheme: dark)").matches
            ? DARK_DEFAULT_THEME
            : DEFAULT_THEME;
    });

    return (
        <TeispaceThemeProvider
            themes={[...THEME_NAMES]}
            defaultTheme={defaultTheme}
            enableSystem={false}
            {...props}
        >
            {children}
        </TeispaceThemeProvider>
    );
}
