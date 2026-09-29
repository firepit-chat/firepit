"use client";

import { ThemeProvider as TeispaceThemeProvider } from "@teispace/next-themes";
import type * as React from "react";

import { THEME_NAMES, DEFAULT_THEME } from "@/lib/themes";

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
    return (
        <TeispaceThemeProvider
            themes={[...THEME_NAMES]}
            defaultTheme={DEFAULT_THEME}
            enableSystem={false}
            {...props}
        >
            {children}
        </TeispaceThemeProvider>
    );
}
