/**
 * Returns the flat token object for the active palette and accent.
 *
 * The return shape is unchanged — the same 40 keys `Colors.light` used to
 * provide — so the ~66 call sites are unaffected by there now being four
 * palettes and twelve accents instead of two modes.
 *
 * Rendered outside `ThemePreferenceProvider` this falls back to the default
 * palette rather than throwing, so isolated components and tests keep working.
 */

import { buildTheme, DEFAULT_THEME_ACCENT, DEFAULT_THEME_PALETTE } from "@/constants/theme";
import { useThemePreference } from "@/providers/theme-preference-context";

export function useTheme() {
  const preference = useThemePreference();
  return buildTheme(preference.palette, preference.accent);
}

export { DEFAULT_THEME_ACCENT, DEFAULT_THEME_PALETTE };
