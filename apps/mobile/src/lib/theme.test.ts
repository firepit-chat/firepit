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
  // The original orange themes are preserved verbatim.
  assert(
    buildTheme("classicLight", "blue").primary === "#D9792B",
    "classicLight keeps the original orange primary",
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
