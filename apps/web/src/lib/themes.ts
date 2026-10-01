/**
 * The single source of truth for theme and accent identifiers.
 *
 * `data-theme` values must match the palette blocks in `src/index.css`, and
 * `data-accent` values must match the `[data-accent]` blocks there. Keeping the
 * lists here means adding a palette or an accent is one edit in one file, and
 * the provider, header menu, and settings page all stay in step automatically.
 */

export const THEME_NAMES = [
    "latte",
    "frappe",
    "macchiato",
    "mocha",
    "classicLight",
    "classicDark",
] as const;

/**
 * Palettes that render dark. The four Catppuccin dark flavours plus the
 * original dark theme. Anything not listed here is light, which keeps
 * `isDarkTheme` correct as palettes are added.
 */
const DARK_THEMES: ReadonlySet<ThemeName> = new Set([
    "frappe",
    "macchiato",
    "mocha",
    "classicDark",
]);

export type ThemeName = (typeof THEME_NAMES)[number];

export const ACCENT_NAMES = [
    "blue",
    "mauve",
    "teal",
    "green",
    "yellow",
    "peach",
    "maroon",
    "pink",
    "flamingo",
    "rosewater",
    "sapphire",
    "sky",
] as const;

export type AccentName = (typeof ACCENT_NAMES)[number];

export const DEFAULT_THEME: ThemeName = "latte";
export const DEFAULT_ACCENT: AccentName = "blue";

/**
 * Cookie holding the accent choice.
 *
 * This lives here rather than next to the provider because the root layout is
 * a server component and inlines the cookie name into a pre-paint script;
 * importing it from a "use client" module would make it a client reference and
 * inline `undefined` instead of the name.
 */
export const ACCENT_COOKIE = "firepit-accent";

/**
 * Cookie holding the palette choice.
 *
 * `"theme"` is the library's own default `storageKey`, which the app does not
 * override. The pre-paint script in the root layout writes this cookie from the
 * OS preference on a first visit, because the library cannot resolve `system`
 * onto custom palette names. Declared here so the two are not renamed apart.
 */
export const THEME_COOKIE = "theme";

/**
 * Palette used for a first visit when the OS reports dark mode.
 *
 * Mocha rather than the other dark flavours because it is the Catppuccin one
 * people recognise. `DEFAULT_THEME` is the light counterpart. Both are used in
 * two places that must agree: the pre-paint script in the root layout, and the
 * provider's `defaultTheme`.
 */
export const DARK_DEFAULT_THEME: ThemeName = "mocha";

/** Human labels for the theme picker. */
export const THEME_LABELS: Record<ThemeName, string> = {
    latte: "Latte",
    frappe: "Frappé",
    macchiato: "Macchiato",
    mocha: "Mocha",
    classicLight: "Classic Light",
    classicDark: "Classic Dark",
};

export const ACCENT_LABELS: Record<AccentName, string> = {
    blue: "Blue",
    mauve: "Mauve",
    teal: "Teal",
    green: "Green",
    yellow: "Yellow",
    peach: "Peach",
    maroon: "Maroon",
    pink: "Pink",
    flamingo: "Flamingo",
    rosewater: "Rosewater",
    sapphire: "Sapphire",
    sky: "Sky",
};

export function isThemeName(value: unknown): value is ThemeName {
    return typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value);
}

export function isAccentName(value: unknown): value is AccentName {
    return typeof value === "string" && (ACCENT_NAMES as readonly string[]).includes(value);
}

export function isDarkTheme(value: unknown): boolean {
    return isThemeName(value) && DARK_THEMES.has(value);
}
