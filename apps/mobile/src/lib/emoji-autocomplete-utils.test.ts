import { filterEmojis } from "@/lib/emoji-autocomplete-utils";
import type { AutocompleteEmoji } from "@/lib/emoji-autocomplete-utils";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

// A small stand-in for the real ~320-entry table.
const table: Record<string, string> = {
  smile: "😄",
  smirk: "😏",
  heart: "❤️",
  thumbsup: "👍",
  fire: "🔥",
  party: "🎉",
};

if (import.meta.main) {
  // --- empty query: custom emoji first, then the head of the table ---
  const custom: AutocompleteEmoji[] = [
    { shortcode: "cat", customUrl: "https://example.com/cat.png" },
  ];
  const blank = filterEmojis("", table, custom);
  assert(
    blank.length === 7,
    `expected 1 custom + 6 standard, got ${blank.length}`,
  );
  assert(
    blank[0].shortcode === "cat" && blank[0].customUrl !== undefined,
    "custom emoji must come first on an empty query",
  );
  assert(
    blank[1].shortcode === "smile",
    `expected the first table entry to follow, got ${blank[1].shortcode}`,
  );

  // --- matching is case-insensitive and substring based ---
  assert(
    filterEmojis("SMIL", table, []).some((e) => e.shortcode === "smile"),
    "query should match case-insensitively",
  );
  assert(
    filterEmojis("art", table, []).some((e) => e.shortcode === "heart"),
    "query should match a substring of the shortcode",
  );

  // --- custom emoji are searched alongside the standard table ---
  const withCustom = filterEmojis("ca", table, custom);
  assert(
    withCustom.some((e) => e.shortcode === "cat"),
    "custom emoji must be searchable",
  );

  // --- a match at the end of the table must still be found ---
  // Regression guard for the early-exit scan: it used to filter the whole
  // table, so replacing that with a bounded scan must not drop later matches.
  const wide: Record<string, string> = {};
  for (let i = 0; i < 40; i++) wide[`e${i}`] = "x";
  wide.zzz = "🎯";
  const tail = filterEmojis("zzz", wide, []);
  assert(
    tail.length === 1 && tail[0].shortcode === "zzz",
    "a match late in the table must be returned",
  );

  // --- results are capped at 10 standard matches ---
  const many: Record<string, string> = {};
  for (let i = 0; i < 50; i++) many[`x${i}`] = "y";
  assert(
    filterEmojis("x", many, []).length === 10,
    "standard matches must be capped at 10",
  );

  // --- no match returns nothing ---
  assert(
    filterEmojis("qqqq", table, []).length === 0,
    "a query matching nothing must return an empty list",
  );

  console.log("emoji-autocomplete-utils.test.ts: all assertions passed");
}