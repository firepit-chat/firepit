/**
 * Emoji filtering for the composer's `:shortcode:` autocomplete.
 *
 * Lives in lib rather than in the component so it can be exercised without
 * pulling in react-native.
 */

export type AutocompleteEmoji = {
    shortcode: string;
    unicode?: string;
    customUrl?: string;
};

// `Object.entries` on the standard-emoji table allocates a tuple per entry, and
// the filter then allocates a lowercased string per entry. The table has ~320
// entries and this runs on every keystroke in the composer, so cache the
// prepared pairs against the table object. Keyed by reference, so a different
// table simply gets its own entry.
const standardEmojiCache = new WeakMap<
    Record<string, string>,
    { shortcode: string; unicode: string; lower: string }[]
>();

function preparedStandardEmojis(standardEmojis: Record<string, string>) {
    const cached = standardEmojiCache.get(standardEmojis);
    if (cached) return cached;
    const prepared = Object.entries(standardEmojis).map(
        ([shortcode, unicode]) => ({
            shortcode,
            unicode,
            lower: shortcode.toLowerCase(),
        }),
    );
    standardEmojiCache.set(standardEmojis, prepared);
    return prepared;
}

export function filterEmojis(
    query: string,
    standardEmojis: Record<string, string>,
    customEmojis: AutocompleteEmoji[],
): AutocompleteEmoji[] {
    const q = query.toLowerCase().trim();
    const standard = preparedStandardEmojis(standardEmojis);

    if (!q) {
        return [
            ...customEmojis.slice(0, 20),
            ...standard
                .slice(0, 20)
                .map(({ shortcode, unicode }) => ({ shortcode, unicode })),
        ];
    }

    const custom: AutocompleteEmoji[] = customEmojis
        .filter((e) => e.shortcode.toLowerCase().includes(q))
        .slice(0, 10)
        .map((e) => ({
            shortcode: e.shortcode,
            unicode: e.unicode,
            customUrl: e.customUrl,
        }));

    const standardMatches: AutocompleteEmoji[] = [];
    for (const entry of standard) {
        if (standardMatches.length >= 10) break;
        if (entry.lower.includes(q)) {
            standardMatches.push({
                shortcode: entry.shortcode,
                unicode: entry.unicode,
            });
        }
    }

    return [...custom, ...standardMatches];
}
