/**
 * How big the portrait is drawn inside the frame box.
 *
 * The box is always the size the caller asked for, whatever frame is worn, so a
 * row of people lines up. Only the portrait inside it varies.
 */

/** Floor for a frame whose opening is too deep to seat a usable portrait. */
const MIN_PORTRAIT_FRACTION = 0.5;

/**
 * An unframed portrait would otherwise fill its whole box and look heavier than a
 * framed one next to it — the frame's artwork fills the space the portrait gives
 * up. Most frames' openings measure ~64%, so an unframed portrait uses the same
 * and a mixed row stays even.
 */
const PLAIN_PORTRAIT_FRACTION = 0.66;

/** Insets are measured from the artwork; several genuinely need ~40%. */
export const MAX_AVATAR_INSET_PERCENT = 45;

/** Coerce a wire inset into the range the renderer accepts. */
export function clampAvatarInsetPercent(
    insetPercent: number,
    fallbackPercent: number,
): number {
    const value = Number.isFinite(insetPercent)
        ? insetPercent
        : fallbackPercent;
    return Math.max(0, Math.min(value, MAX_AVATAR_INSET_PERCENT));
}

/**
 * Portrait diameter in px for a `boxPx` frame box.
 *
 * Fills the frame's opening when the opening is big enough, and is floored at
 * `MIN_PORTRAIT_FRACTION` otherwise — the portrait is then drawn over the
 * frame's inner edge, which reads as a portrait sitting in front of the frame
 * rather than a hole that does not line up.
 *
 * Growing the box instead would keep every portrait identical but make the
 * element up to 4x wider for a deep frame (the star's opening is a quarter of
 * its canvas), which is far more disruptive than a small size difference.
 */
export function resolvePortraitSize(
    boxPx: number,
    options: {
        hasFrame: boolean;
        isOverlayFrame: boolean;
        insetPercent: number;
    },
): number {
    const { hasFrame, isOverlayFrame, insetPercent } = options;

    if (!hasFrame) {
        return Math.round(boxPx * PLAIN_PORTRAIT_FRACTION);
    }
    // An overlay frame's artwork crosses the centre, so the portrait is
    // full-bleed with the artwork drawn over it.
    if (isOverlayFrame) {
        return boxPx;
    }

    const openFraction = Math.max(0.1, 1 - 2 * (insetPercent / 100));
    const openingSize = boxPx * openFraction;
    return Math.round(Math.max(openingSize, boxPx * MIN_PORTRAIT_FRACTION));
}
