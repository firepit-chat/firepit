"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import {
    ACCENT_COOKIE,
    ACCENT_NAMES,
    DEFAULT_ACCENT,
    isAccentName,
    type AccentName,
} from "@/lib/themes";

type AccentContextValue = {
    accent: AccentName;
    setAccent: (next: AccentName) => void;
};

const AccentContext = createContext<AccentContextValue | null>(null);

/**
 * Applies the accent as a `data-accent` attribute on <html>, which is what the
 * `[data-accent]` blocks in `index.css` key off.
 *
 * The initial value comes from the attribute that the blocking bootstrap script
 * in the root layout already wrote from the cookie, so there is no flash and no
 * need to read cookies in the layout (which would opt the app out of static
 * rendering). This provider only owns subsequent changes.
 */
export function AccentProvider({ children }: { children: ReactNode }) {
    const [accent, setAccentState] = useState<AccentName>(() => {
        if (typeof document === "undefined") {
            return DEFAULT_ACCENT;
        }
        const applied = document.documentElement.dataset.accent;
        return isAccentName(applied) ? applied : DEFAULT_ACCENT;
    });

    const setAccent = useCallback((next: AccentName) => {
        setAccentState(next);
        if (typeof document !== "undefined") {
            document.documentElement.dataset.accent = next;
            // One year, matching the theme cookie, so the choice survives
            // closing the browser.
            document.cookie = `${ACCENT_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        }
    }, []);

    const value = useMemo(() => ({ accent, setAccent }), [accent, setAccent]);

    return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
    const context = useContext(AccentContext);
    if (!context) {
        // Rendering outside the provider should not blank the accent, so fall
        // back to the default rather than throwing.
        return { accent: DEFAULT_ACCENT, setAccent: () => {} };
    }
    return context;
}

export { ACCENT_COOKIE, ACCENT_NAMES };
