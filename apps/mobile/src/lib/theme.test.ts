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
