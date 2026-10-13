/**
 * Applies an opacity to a theme colour.
 *
 * The token table is 6-digit hex, so tinting has always meant appending a hex
 * alpha by hand — `theme.muted + "40"`, `theme.primary + "1F"` — and the same
 * tints were spelled slightly differently across a dozen files. Naming the
 * alpha keeps the intent readable and makes the ramps comparable.
 *
 * Kept free of React Native imports so it can be unit tested directly; re-
 * exported from `./theme` alongside the tokens that use it.
 */
export function withAlpha(color: string, alpha: number): string {
  const clamped = Math.min(1, Math.max(0, alpha));
  const pair = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  // Already 8-digit (e.g. accentSoft), so only the alpha pair is replaced.
  if (/^#[0-9A-Fa-f]{8}$/.test(color)) {
    return color.slice(0, 7) + pair;
  }
  return color + pair;
}