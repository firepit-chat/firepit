/**
 * Theme tokens for the mobile app.
 *
 * Four Catppuccin palettes (Latte light, Frappe/Macchiato/Mocha dark) plus the
 * two original Firepit themes (Classic Light / Classic Dark), and a
 * user-selectable accent. React Native has no `oklch()` support, so these are
 * hex; the values are the same colours the web app ships in `index.css`.
 *
 * The original themes keep their orange primary in the default accent slot, so
 * picking one with no accent chosen reproduces the pre-Catppuccin look.
 *
 * Accent fills are adjusted so that `primaryForeground` clears 4.5:1 against
 * them. Latte's canonical accents are authored to be read as text on `base`
 * and cannot serve as fills unmodified, so they are lightened to pair with
 * Latte's dark `text`; the dark palettes already clear 5.3:1 as-is.
 *
 * `useTheme()` returns the flat 40-token shape below, so call sites are
 * unaffected by the palette count.
 */

export const THEME_PALETTES = [
  "latte",
  "frappe",
  "macchiato",
  "mocha",
  "classicLight",
  "classicDark",
] as const;

/**
 * Palettes that render dark. The three dark Catppuccin flavours plus the
 * original dark theme; anything not listed is light, which keeps
 * `isDarkPalette` correct as palettes are added.
 */
const DARK_PALETTES: ReadonlySet<ThemePalette> = new Set([
  "frappe",
  "macchiato",
  "mocha",
  "classicDark",
]);
export type ThemePalette = (typeof THEME_PALETTES)[number];

export const THEME_ACCENTS = [
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
export type ThemeAccent = (typeof THEME_ACCENTS)[number];

export const DEFAULT_THEME_PALETTE: ThemePalette = "latte";
export const DEFAULT_THEME_ACCENT: ThemeAccent = "blue";

export const THEME_PALETTE_LABELS: Record<ThemePalette, string> = {
  latte: "Latte",
  frappe: "Frappé",
  macchiato: "Macchiato",
  mocha: "Mocha",
  classicLight: "Classic Light",
  classicDark: "Classic Dark",
};

export const THEME_ACCENT_LABELS: Record<ThemeAccent, string> = {
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

export function isThemePalette(value: unknown): value is ThemePalette {
  return (
    typeof value === "string" &&
    (THEME_PALETTES as readonly string[]).includes(value)
  );
}

export function isThemeAccent(value: unknown): value is ThemeAccent {
  return (
    typeof value === "string" &&
    (THEME_ACCENTS as readonly string[]).includes(value)
  );
}

export function isDarkPalette(value: unknown): boolean {
  return isThemePalette(value) && DARK_PALETTES.has(value);
}

/**
 * Accent colours per palette. Only the two genuinely accent-specific tokens
 * are stored; `ring`, `sidebarPrimary`, `sidebarRing`, `chart1` and
 * `accentSoft` are all derived from `primary` in `buildTheme`.
 */
const ACCENT_COLORS: Record<
  ThemePalette,
  Record<ThemeAccent, { primary: string; primaryForeground: string }>
> = {
  latte: {
    blue: { primary: "#A4C4FE", primaryForeground: "#4C4F69" },
    mauve: { primary: "#CDB9FF", primaryForeground: "#4C4F69" },
    teal: { primary: "#60D6C9", primaryForeground: "#4C4F69" },
    green: { primary: "#79D967", primaryForeground: "#4C4F69" },
    yellow: { primary: "#FEB561", primaryForeground: "#4C4F69" },
    peach: { primary: "#FFB193", primaryForeground: "#4C4F69" },
    maroon: { primary: "#FFAFAD", primaryForeground: "#4C4F69" },
    pink: { primary: "#FFA7E5", primaryForeground: "#4C4F69" },
    flamingo: { primary: "#FFAFAD", primaryForeground: "#4C4F69" },
    rosewater: { primary: "#FEAF9E", primaryForeground: "#4C4F69" },
    sapphire: { primary: "#61D2E9", primaryForeground: "#4C4F69" },
    sky: { primary: "#74CCFF", primaryForeground: "#4C4F69" },
  },
  frappe: {
    blue: { primary: "#8CAAEE", primaryForeground: "#303446" },
    mauve: { primary: "#CA9EE6", primaryForeground: "#303446" },
    teal: { primary: "#94E2D5", primaryForeground: "#303446" },
    green: { primary: "#A6D189", primaryForeground: "#303446" },
    yellow: { primary: "#E5C890", primaryForeground: "#303446" },
    peach: { primary: "#EF9F76", primaryForeground: "#303446" },
    maroon: { primary: "#EA999C", primaryForeground: "#303446" },
    pink: { primary: "#F4B8E4", primaryForeground: "#303446" },
    flamingo: { primary: "#EEBEBE", primaryForeground: "#303446" },
    rosewater: { primary: "#F2CDCD", primaryForeground: "#303446" },
    sapphire: { primary: "#74C7EC", primaryForeground: "#303446" },
    sky: { primary: "#89DCEB", primaryForeground: "#303446" },
  },
  macchiato: {
    blue: { primary: "#8AADF4", primaryForeground: "#24273A" },
    mauve: { primary: "#C6A0F6", primaryForeground: "#24273A" },
    teal: { primary: "#8BD5CA", primaryForeground: "#24273A" },
    green: { primary: "#A6DA95", primaryForeground: "#24273A" },
    yellow: { primary: "#EED49F", primaryForeground: "#24273A" },
    peach: { primary: "#F5A97F", primaryForeground: "#24273A" },
    maroon: { primary: "#EE99A0", primaryForeground: "#24273A" },
    pink: { primary: "#F5BDE6", primaryForeground: "#24273A" },
    flamingo: { primary: "#F0C6C6", primaryForeground: "#24273A" },
    rosewater: { primary: "#F2D5CF", primaryForeground: "#24273A" },
    sapphire: { primary: "#74C7EC", primaryForeground: "#24273A" },
    sky: { primary: "#91D7E3", primaryForeground: "#24273A" },
  },
  mocha: {
    blue: { primary: "#89B4FA", primaryForeground: "#1E1E2E" },
    mauve: { primary: "#CBA6F7", primaryForeground: "#1E1E2E" },
    teal: { primary: "#94E2D5", primaryForeground: "#1E1E2E" },
    green: { primary: "#A6E3A1", primaryForeground: "#1E1E2E" },
    yellow: { primary: "#F9E2AF", primaryForeground: "#1E1E2E" },
    peach: { primary: "#FAB387", primaryForeground: "#1E1E2E" },
    maroon: { primary: "#EBA0AC", primaryForeground: "#1E1E2E" },
    pink: { primary: "#F5C2E7", primaryForeground: "#1E1E2E" },
    flamingo: { primary: "#F2CDCD", primaryForeground: "#1E1E2E" },
    rosewater: { primary: "#F5E0DC", primaryForeground: "#1E1E2E" },
    sapphire: { primary: "#74C7EC", primaryForeground: "#1E1E2E" },
    sky: { primary: "#89DCEB", primaryForeground: "#1E1E2E" },
  },
  classicLight: {
    blue: { primary: "#D9792B", primaryForeground: "#FBF8F2" },
    mauve: { primary: "#CDB9FF", primaryForeground: "#4C4F69" },
    teal: { primary: "#60D6C9", primaryForeground: "#4C4F69" },
    green: { primary: "#79D967", primaryForeground: "#4C4F69" },
    yellow: { primary: "#FEB561", primaryForeground: "#4C4F69" },
    peach: { primary: "#FFB193", primaryForeground: "#4C4F69" },
    maroon: { primary: "#FFAFAD", primaryForeground: "#4C4F69" },
    pink: { primary: "#FFA7E5", primaryForeground: "#4C4F69" },
    flamingo: { primary: "#FFAFAD", primaryForeground: "#4C4F69" },
    rosewater: { primary: "#FEAF9E", primaryForeground: "#4C4F69" },
    sapphire: { primary: "#61D2E9", primaryForeground: "#4C4F69" },
    sky: { primary: "#74CCFF", primaryForeground: "#4C4F69" },
  },
  classicDark: {
    blue: { primary: "#E08B3D", primaryForeground: "#1A140F" },
    mauve: { primary: "#CBA6F7", primaryForeground: "#1E1E2E" },
    teal: { primary: "#94E2D5", primaryForeground: "#1E1E2E" },
    green: { primary: "#A6E3A1", primaryForeground: "#1E1E2E" },
    yellow: { primary: "#F9E2AF", primaryForeground: "#1E1E2E" },
    peach: { primary: "#FAB387", primaryForeground: "#1E1E2E" },
    maroon: { primary: "#EBA0AC", primaryForeground: "#1E1E2E" },
    pink: { primary: "#F5C2E7", primaryForeground: "#1E1E2E" },
    flamingo: { primary: "#F2CDCD", primaryForeground: "#1E1E2E" },
    rosewater: { primary: "#F5E0DC", primaryForeground: "#1E1E2E" },
    sapphire: { primary: "#74C7EC", primaryForeground: "#1E1E2E" },
    sky: { primary: "#89DCEB", primaryForeground: "#1E1E2E" },
  },
};

export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  success: string;
  warning: string;
  danger: string;
  backgroundElement: string;
  backgroundSelected: string;
  text: string;
  textSecondary: string;
  accentSoft: string;
};

export type ThemeColor = keyof ThemeTokens;

const BASE_TOKENS: Record<ThemePalette, Omit<ThemeTokens, "primary" | "primaryForeground">> = {
  latte: {
    background: "#EFF1F5",
    foreground: "#4C4F69",
    card: "#E6E9EF",
    cardForeground: "#4C4F69",
    popover: "#E6E9EF",
    popoverForeground: "#4C4F69",
    secondary: "#CCD0DA",
    secondaryForeground: "#4C4F69",
    muted: "#CCD0DA",
    mutedForeground: "#6C6F85",
    accent: "#BCC0CC",
    accentForeground: "#4C4F69",
    destructive: "#E64553",
    destructiveForeground: "#EFF1F5",
    border: "#CCD0DA",
    input: "#CCD0DA",
    ring: "#A4C4FE",
    sidebar: "#E6E9EF",
    sidebarForeground: "#4C4F69",
    sidebarPrimary: "#A4C4FE",
    sidebarPrimaryForeground: "#4C4F69",
    sidebarAccent: "#BCC0CC",
    sidebarAccentForeground: "#4C4F69",
    sidebarBorder: "#CCD0DA",
    sidebarRing: "#A4C4FE",
    chart1: "#A4C4FE",
    chart2: "#60D6C9",
    chart3: "#40A02B",
    chart4: "#DF8E1D",
    chart5: "#E64553",
    success: "#40A02B",
    warning: "#DF8E1D",
    danger: "#E64553",
    backgroundElement: "#E6E9EF",
    backgroundSelected: "#BCC0CC",
    text: "#4C4F69",
    textSecondary: "#6C6F85",
    accentSoft: "#A4C4FE33",
  },
  frappe: {
    background: "#303446",
    foreground: "#C6D0F5",
    card: "#292C3C",
    cardForeground: "#C6D0F5",
    popover: "#292C3C",
    popoverForeground: "#C6D0F5",
    secondary: "#414559",
    secondaryForeground: "#C6D0F5",
    muted: "#414559",
    mutedForeground: "#A5ADCE",
    accent: "#51576D",
    accentForeground: "#C6D0F5",
    destructive: "#E78284",
    destructiveForeground: "#303446",
    border: "#414559",
    input: "#414559",
    ring: "#8CAAEE",
    sidebar: "#292C3C",
    sidebarForeground: "#C6D0F5",
    sidebarPrimary: "#8CAAEE",
    sidebarPrimaryForeground: "#303446",
    sidebarAccent: "#51576D",
    sidebarAccentForeground: "#C6D0F5",
    sidebarBorder: "#414559",
    sidebarRing: "#8CAAEE",
    chart1: "#8CAAEE",
    chart2: "#94E2D5",
    chart3: "#A6D189",
    chart4: "#E5C890",
    chart5: "#E78284",
    success: "#A6D189",
    warning: "#E5C890",
    danger: "#E78284",
    backgroundElement: "#292C3C",
    backgroundSelected: "#51576D",
    text: "#C6D0F5",
    textSecondary: "#A5ADCE",
    accentSoft: "#8CAAEE33",
  },
  macchiato: {
    background: "#24273A",
    foreground: "#CAD3F5",
    card: "#1E2030",
    cardForeground: "#CAD3F5",
    popover: "#1E2030",
    popoverForeground: "#CAD3F5",
    secondary: "#363A4F",
    secondaryForeground: "#CAD3F5",
    muted: "#363A4F",
    mutedForeground: "#A8ADF0",
    accent: "#494D64",
    accentForeground: "#CAD3F5",
    destructive: "#ED8796",
    destructiveForeground: "#24273A",
    border: "#363A4F",
    input: "#363A4F",
    ring: "#8AADF4",
    sidebar: "#1E2030",
    sidebarForeground: "#CAD3F5",
    sidebarPrimary: "#8AADF4",
    sidebarPrimaryForeground: "#24273A",
    sidebarAccent: "#494D64",
    sidebarAccentForeground: "#CAD3F5",
    sidebarBorder: "#363A4F",
    sidebarRing: "#8AADF4",
    chart1: "#8AADF4",
    chart2: "#8BD5CA",
    chart3: "#A6DA95",
    chart4: "#EED49F",
    chart5: "#ED8796",
    success: "#A6DA95",
    warning: "#EED49F",
    danger: "#ED8796",
    backgroundElement: "#1E2030",
    backgroundSelected: "#494D64",
    text: "#CAD3F5",
    textSecondary: "#A8ADF0",
    accentSoft: "#8AADF433",
  },
  mocha: {
    background: "#1E1E2E",
    foreground: "#CDD6F4",
    card: "#181825",
    cardForeground: "#CDD6F4",
    popover: "#181825",
    popoverForeground: "#CDD6F4",
    secondary: "#313244",
    secondaryForeground: "#CDD6F4",
    muted: "#313244",
    mutedForeground: "#A6ADC8",
    accent: "#45475A",
    accentForeground: "#CDD6F4",
    destructive: "#F38BA8",
    destructiveForeground: "#1E1E2E",
    border: "#313244",
    input: "#313244",
    ring: "#89B4FA",
    sidebar: "#181825",
    sidebarForeground: "#CDD6F4",
    sidebarPrimary: "#89B4FA",
    sidebarPrimaryForeground: "#1E1E2E",
    sidebarAccent: "#45475A",
    sidebarAccentForeground: "#CDD6F4",
    sidebarBorder: "#313244",
    sidebarRing: "#89B4FA",
    chart1: "#89B4FA",
    chart2: "#94E2D5",
    chart3: "#A6E3A1",
    chart4: "#F9E2AF",
    chart5: "#F38BA8",
    success: "#A6E3A1",
    warning: "#F9E2AF",
    danger: "#F38BA8",
    backgroundElement: "#181825",
    backgroundSelected: "#45475A",
    text: "#CDD6F4",
    textSecondary: "#A6ADC8",
    accentSoft: "#89B4FA33",
  },
  classicLight: {
    background: "#FBF8F2",
    foreground: "#3A2D25",
    card: "#FFFDFB",
    cardForeground: "#3A2D25",
    popover: "#FFFDFB",
    popoverForeground: "#3A2D25",
    secondary: "#F2E8D7",
    secondaryForeground: "#3A2D25",
    muted: "#EDE3D3",
    mutedForeground: "#7A6657",
    accent: "#EBDCC3",
    accentForeground: "#3A2D25",
    destructive: "#C94A36",
    destructiveForeground: "#FBF8F2",
    border: "#E4D8C8",
    input: "#E4D8C8",
    ring: "#D9792B",
    sidebar: "#FFF9F0",
    sidebarForeground: "#3A2D25",
    sidebarPrimary: "#D9792B",
    sidebarPrimaryForeground: "#FBF8F2",
    sidebarAccent: "#F5EEE2",
    sidebarAccentForeground: "#3A2D25",
    sidebarBorder: "#E4D8C8",
    sidebarRing: "#D9792B",
    chart1: "#D9792B",
    chart2: "#4E8A86",
    chart3: "#5E6F90",
    chart4: "#D18A37",
    chart5: "#A45E4D",
    success: "#DCEFE7",
    warning: "#F5E5C3",
    danger: "#F8E0DA",
    backgroundElement: "#FFFDFB",
    backgroundSelected: "#F1E8D8",
    text: "#3A2D25",
    textSecondary: "#7A6657",
    accentSoft: "#EBDCC3",
  },
  classicDark: {
    background: "#1A1512",
    foreground: "#F8F2E8",
    card: "#241D18",
    cardForeground: "#F8F2E8",
    popover: "#241D18",
    popoverForeground: "#F8F2E8",
    secondary: "#2A231D",
    secondaryForeground: "#F8F2E8",
    muted: "#2F2720",
    mutedForeground: "#CBB9A8",
    accent: "#322821",
    accentForeground: "#F8F2E8",
    destructive: "#D86A57",
    destructiveForeground: "#1A140F",
    border: "#3A3027",
    input: "#45362C",
    ring: "#E08B3D",
    sidebar: "#1F1914",
    sidebarForeground: "#F8F2E8",
    sidebarPrimary: "#E08B3D",
    sidebarPrimaryForeground: "#1A140F",
    sidebarAccent: "#2A231D",
    sidebarAccentForeground: "#F8F2E8",
    sidebarBorder: "#3A3027",
    sidebarRing: "#E08B3D",
    chart1: "#E08B3D",
    chart2: "#72A7A1",
    chart3: "#C9A46C",
    chart4: "#A272D7",
    chart5: "#CC7F64",
    success: "#21463F",
    warning: "#4B361F",
    danger: "#452522",
    backgroundElement: "#241D18",
    backgroundSelected: "#2A231D",
    text: "#F8F2E8",
    textSecondary: "#CBB9A8",
    accentSoft: "#322821",
  },
};

/**
 * Composes the flat token object for a palette/accent pair. The result is
 * memoised because `useTheme()` runs in ~66 call sites and rebuilds on every
 * theme change otherwise.
 */
const CACHE = new Map<string, ThemeTokens>();

export function buildTheme(
  palette: ThemePalette,
  accent: ThemeAccent,
): ThemeTokens {
  const cacheKey = `${palette}:${accent}`;
  const cached = CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const accentColors = ACCENT_COLORS[palette][accent];
  const theme = {
    ...BASE_TOKENS[palette],
    primary: accentColors.primary,
    primaryForeground: accentColors.primaryForeground,
    ring: accentColors.primary,
    sidebarPrimary: accentColors.primary,
    sidebarPrimaryForeground: accentColors.primaryForeground,
    sidebarRing: accentColors.primary,
    chart1: accentColors.primary,
    // 20% alpha so the tint follows the accent over any surface.
    accentSoft: `${accentColors.primary}33`,
  } as ThemeTokens;

  CACHE.set(cacheKey, theme);
  return theme;
}
