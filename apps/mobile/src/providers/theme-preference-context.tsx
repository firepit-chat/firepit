import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_PALETTE,
  isThemeAccent,
  isThemePalette,
  type ThemeAccent,
  type ThemePalette,
} from "@/constants/theme";

const PALETTE_KEY = "@firepit_theme_palette";
const ACCENT_KEY = "@firepit_theme_accent";

type ThemePreferenceContextValue = {
  palette: ThemePalette;
  accent: ThemeAccent;
  setPalette: (next: ThemePalette) => void;
  setAccent: (next: ThemeAccent) => void;
  /** False until the stored preference has been read back from storage. */
  hydrated: boolean;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue>({
  palette: DEFAULT_THEME_PALETTE,
  accent: DEFAULT_THEME_ACCENT,
  setPalette: () => {},
  setAccent: () => {},
  hydrated: false,
});

/**
 * Stores the chosen palette and accent.
 *
 * The defaults are returned synchronously so the first render already has a
 * complete theme; the stored preference replaces them once storage resolves.
 * Persisting the choice is best-effort: a failed write leaves the in-memory
 * value in place rather than reverting the user's choice.
 */
export function ThemePreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [palette, setPaletteState] = useState<ThemePalette>(
    DEFAULT_THEME_PALETTE,
  );
  const [accent, setAccentState] = useState<ThemeAccent>(DEFAULT_THEME_ACCENT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedPalette, savedAccent] = await Promise.all([
          AsyncStorage.getItem(PALETTE_KEY),
          AsyncStorage.getItem(ACCENT_KEY),
        ]);
        if (cancelled) return;
        if (isThemePalette(savedPalette)) setPaletteState(savedPalette);
        if (isThemeAccent(savedAccent)) setAccentState(savedAccent);
      } catch {
        // fall back to the defaults
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPalette = useCallback((next: ThemePalette) => {
    setPaletteState(next);
    void AsyncStorage.setItem(PALETTE_KEY, next).catch(() => {});
  }, []);

  const setAccent = useCallback((next: ThemeAccent) => {
    setAccentState(next);
    void AsyncStorage.setItem(ACCENT_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ palette, accent, setPalette, setAccent, hydrated }),
    [palette, accent, setPalette, setAccent, hydrated],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemePreferenceContext);
}
