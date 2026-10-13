import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_PALETTE,
  THEME_ACCENTS,
  THEME_PALETTES,
  buildTheme,
  isDarkPalette,
  isThemeAccent,
  isThemePalette,
} from "@/constants/theme-palettes";
import { withAlpha } from "@/constants/theme-alpha";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

const HEX = /^#[0-9A-F]{6}([0-9A-F]{2})?$/;

if (import.meta.main) {
  const reference = Object.keys(buildTheme("latte", "blue")).sort().join(",");

  // Every palette/accent pair must expose the same 40 tokens, all valid hex,
  // or call sites that index a token by name will break at runtime.
  for (const palette of THEME_PALETTES) {
    for (const accent of THEME_ACCENTS) {
      const theme = buildTheme(palette, accent);
      const label = `${palette}/${accent}`;
      assert(
        Object.keys(theme).sort().join(",") === reference,
        `${label}: token set differs from latte/blue`,
      );
      for (const [key, value] of Object.entries(theme)) {
        assert(HEX.test(value), `${label}: ${key} is not hex (${value})`);
      }
    }
  }

  // The accent-dependent tokens must all track `primary`; if one drifts the UI
  // goes inconsistent (a teal ring around a blue button).
  const teal = buildTheme("mocha", "teal");
  assert(teal.primary !== buildTheme("mocha", "blue").primary, "accent changes primary");
  assert(teal.ring === teal.primary, "ring tracks primary");
  assert(teal.sidebarPrimary === teal.primary, "sidebarPrimary tracks primary");
  assert(teal.sidebarRing === teal.primary, "sidebarRing tracks primary");
  assert(teal.chart1 === teal.primary, "chart1 tracks primary");
  assert(
    teal.sidebarPrimaryForeground === teal.primaryForeground,
    "sidebarPrimaryForeground tracks primaryForeground",
  );
  assert(teal.accentSoft === `${teal.primary}33`, "accentSoft is primary at 20% alpha");

  assert(
    buildTheme("latte", "blue").background !== buildTheme("mocha", "blue").background,
    "palettes differ",
  );
  // The classic themes keep their orange primary in the default accent slot.
  // Classic Light's is darkened from the original #D9792B, which only reached
  // 2.95:1 under its cream foreground; Classic Dark's already passed.
  assert(
    buildTheme("classicLight", "blue").primary === "#AF5900",
    "classicLight keeps an orange primary, darkened for contrast",
  );
  assert(
    buildTheme("classicDark", "blue").primary === "#E08B3D",
    "classicDark keeps the original orange primary",
  );
  // The default accent slot carries the original orange, so an untouched
  // classic theme reproduces the original exactly. Picking an explicit accent
  // still overrides it, same as every other palette.
  assert(
    buildTheme("classicLight", "blue").primary !== buildTheme("latte", "blue").primary,
    "classicLight default slot is not the Catppuccin blue",
  );
  assert(
    buildTheme("classicLight", "teal").primary === buildTheme("latte", "teal").primary,
    "an explicit accent overrides the classic default",
  );
  assert(
    buildTheme("frappe", "pink") === buildTheme("frappe", "pink"),
    "buildTheme is memoised",
  );

  // Latte and Classic Light are the light palettes; everything else is dark.
  assert(!isDarkPalette("latte"), "latte is light");
  assert(!isDarkPalette("classicLight"), "classicLight is light");
  assert(isDarkPalette("frappe"), "frappe is dark");
  assert(isDarkPalette("macchiato"), "macchiato is dark");
  assert(isDarkPalette("mocha"), "mocha is dark");
  assert(isDarkPalette("classicDark"), "classicDark is dark");

  assert(!isThemePalette("nope"), "unknown palette rejected");
  assert(!isThemePalette(undefined), "undefined palette rejected");
  assert(!isThemeAccent("nope"), "unknown accent rejected");
  assert(!isThemeAccent(null), "null accent rejected");
  // The old two-mode names are no longer valid palette values.
  assert(!isThemePalette("light"), '"light" is not a palette');
  assert(!isThemePalette("dark"), '"dark" is not a palette');

  assert(DEFAULT_THEME_PALETTE === "latte", "default palette is latte");
  assert(DEFAULT_THEME_ACCENT === "blue", "default accent is blue");

  console.log("theme.test.ts: all assertions passed");
}

// Every pairing the UI actually renders. The status pills put `foreground` on
// a solid `success`/`warning`/`danger` fill, which is exactly the combination
// that used to render at 1.03:1 on Mocha — invisible text on a pale green
// pill. Pinning the ratios here is what stops a palette edit from silently
// reintroducing it.
const relLum = (hex: string) => {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  );
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

if (import.meta.main) {
  for (const palette of THEME_PALETTES) {
    const theme = buildTheme(palette, DEFAULT_THEME_ACCENT);
    const pairs: [string, string, string][] = [
      // Button fills: label sits on the fill.
      ["destructive/destructiveForeground", theme.destructive, theme.destructiveForeground],
      // Status pills: `foreground` sits on a solid status fill.
      ["success/foreground", theme.success, theme.foreground],
      ["warning/foreground", theme.warning, theme.foreground],
      ["danger/foreground", theme.danger, theme.foreground],
      ["muted/mutedForeground", theme.muted, theme.mutedForeground],
      // Coloured text and error text on the two surfaces they land on.
      ["mutedForeground/background", theme.mutedForeground, theme.background],
      ["successText/background", theme.successText, theme.background],
      ["successText/card", theme.successText, theme.card],
      ["warningText/background", theme.warningText, theme.background],
      ["warningText/card", theme.warningText, theme.card],
      ["destructive/background", theme.destructive, theme.background],
      ["destructive/card", theme.destructive, theme.card],
    ];
    for (const [label, bg, fg] of pairs) {
      const ratio = contrast(bg, fg);
      assert(
        ratio >= 4.5,
        `${palette}: ${label} is ${ratio.toFixed(2)}:1, below the 4.5:1 minimum`,
      );
    }

    // `primary` is the one fill that changes with the accent, so it has to be
    // checked against every accent rather than the default one.
    for (const accent of THEME_ACCENTS) {
      const { primary, primaryForeground } = buildTheme(palette, accent);
      const ratio = contrast(primary, primaryForeground);
      assert(
        ratio >= 4.5,
        `${palette}/${accent}: primary/primaryForeground is ${ratio.toFixed(2)}:1, below the 4.5:1 minimum`,
      );
    }
  }

  console.log("theme contrast: all pairings clear 4.5:1");
}

// withAlpha replaces the hand-written `theme.x + "40"` tints, so its output
// shape matters: a 6-digit token gains an alpha pair, an 8-digit one keeps its
// colour channels.
if (import.meta.main) {
  assert(withAlpha("#A4C4FE", 1) === "#A4C4FEFF", "full alpha");
  assert(withAlpha("#A4C4FE", 0) === "#A4C4FE00", "zero alpha");
  assert(withAlpha("#A4C4FE", 0.12).length === 9, "8-digit output");
  assert(
    withAlpha("#A4C4FE", 0.12).startsWith("#A4C4FE"),
    "colour channels unchanged",
  );
  // accentSoft is already 8-digit; only the alpha pair may change.
  assert(
    withAlpha("#A4C4FE33", 1) === "#A4C4FEFF",
    "8-digit input keeps its channels",
  );
  assert(
    withAlpha("#A4C4FEFF", 0.5) === "#A4C4FE80",
    "re-alpha replaces the existing alpha",
  );
  assert(withAlpha("#A4C4FE", -1) === "#A4C4FE00", "clamps below zero");
  assert(withAlpha("#A4C4FE", 5) === "#A4C4FEFF", "clamps above one");

  console.log("theme alpha: all assertions passed");
}

// The pre-2.2 theme system followed the OS light/dark setting. Defaulting to a
// fixed light palette would hand every existing dark-mode user a light app on
// upgrade, so the OS-derived default is worth pinning.
const schemeFor = (scheme: string | null | undefined) =>
  scheme === "dark" ? "mocha" : DEFAULT_THEME_PALETTE;

if (import.meta.main) {
  assert(
    schemeFor("dark") === "mocha",
    "OS dark defaults to a dark palette, not a light one",
  );
  assert(
    schemeFor("light") === DEFAULT_THEME_PALETTE,
    "OS light defaults to Latte",
  );
  // React Native reports "unspecified" before it resolves, and null on web
  // before hydration; neither may be treated as an explicit dark preference.
  assert(schemeFor(null) !== "mocha", "null scheme is not dark");
  assert(schemeFor("unspecified") !== "mocha", "unspecified is not dark");
  assert(
    isDarkPalette(schemeFor("dark")),
    "the OS dark default must actually be a dark palette",
  );
  assert(
    !isDarkPalette(schemeFor("light")),
    "the OS light default must actually be a light palette",
  );

  console.log("theme defaults: all assertions passed");
}
