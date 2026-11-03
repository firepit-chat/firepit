"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getPresetFrameById } from "@/lib/preset-frames";
import {
    clampAvatarInsetPercent,
    resolvePortraitSize,
} from "@/lib/avatar-geometry";

type AvatarProps = {
    src?: string | null;
    alt: string;
    fallback?: string;
    size?: "sm" | "md" | "lg";
    /**
     * Explicit pixel size, for surfaces whose scale is not one of the three
     * defaults (the profile hero, for example). Overrides `size`.
     */
    sizePx?: number;
    /** Extra classes for the outermost element. */
    className?: string;
    framePreset?: string;
    frameUrl?: string;
    /**
     * Server-resolved inset for callers with no preset catalogue. Ignored
     * when `framePreset` resolves, since the catalogue value is measured.
     */
    frameInsetPercent?: number;
};

const sizePx = {
    sm: 24,
    md: 32,
    lg: 48,
} as const;

const WHITESPACE_REGEX = /\s+/;

// Used only when a frame declares no inset of its own.
const DEFAULT_AVATAR_INSET_PERCENT = 12;

export function Avatar({
    src,
    alt,
    fallback,
    size = "md",
    sizePx: sizePxProp,
    className,
    framePreset,
    frameUrl,
    frameInsetPercent,
}: AvatarProps) {
    const boxPx = sizePxProp ?? sizePx[size];
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        setImageError(false);
    }, [src]);

    const presetFrame = framePreset ? getPresetFrameById(framePreset) : null;
    // An explicit `frameUrl` may come from a client that has no preset
    // catalogue and passes the server-resolved inset separately; when the
    // preset is known, its measured inset wins.
    const candidateFrameUrl = frameUrl ?? presetFrame?.imageUrl;
    const trimmedFrameUrl =
        typeof candidateFrameUrl === "string"
            ? candidateFrameUrl.trim()
            : undefined;
    const resolvedFrameUrl =
        trimmedFrameUrl && trimmedFrameUrl.length > 0
            ? trimmedFrameUrl
            : undefined;
    const hasFrameAsset = Boolean(resolvedFrameUrl);
    // Frames are drawn as a ring with an opening, except for the overlay
    // designs (a snowflake, a wreath) whose art crosses the centre. Those have
    // no opening to sit in, so the portrait is full-bleed and the artwork is
    // drawn on top of it instead.
    const isOverlayFrame =
        hasFrameAsset &&
        (framePreset
            ? presetFrame?.frameStyle === "overlay"
            : frameInsetPercent === 0);
    // Measured from the artwork; see scripts/measure-avatar-frames.ts.
    const configuredInset =
        presetFrame?.avatarInsetPercent ??
        frameInsetPercent ??
        DEFAULT_AVATAR_INSET_PERCENT;
    const insetPercent = hasFrameAsset
        ? isOverlayFrame
            ? 0
            : clampAvatarInsetPercent(
                  configuredInset,
                  DEFAULT_AVATAR_INSET_PERCENT,
              )
        : 0;

    // The frame box is always the requested size, so a row of members lines up
    // no matter which frames they picked; see lib/avatar-geometry.
    const portraitSize = boxPx;
    const actualAvatarSize = resolvePortraitSize(portraitSize, {
        hasFrame: hasFrameAsset,
        isOverlayFrame,
        insetPercent,
    });
    const avatarOffsetPx = Math.round((portraitSize - actualAvatarSize) / 2);

    // Fallback to initials or first letter
    const normalizedFallback = fallback?.trim() || alt.trim();
    const initials = normalizedFallback
        ? normalizedFallback
              .split(WHITESPACE_REGEX)
              .slice(0, 2)
              .map((segment) => segment.charAt(0))
              .join("")
              .toUpperCase()
        : "?";

    const avatarContent =
        src && src.trim() !== "" && !imageError ? (
            <Image
                alt={alt}
                className="h-full w-full object-cover"
                height={actualAvatarSize}
                loading="lazy"
                src={src}
                width={actualAvatarSize}
                onError={() => setImageError(true)}
            />
        ) : (
            <span
                aria-label={alt}
                className="font-medium text-muted-foreground"
                role="img"
                style={{ fontSize: actualAvatarSize * 0.45 }}
            >
                {initials}
            </span>
        );

    if (resolvedFrameUrl) {
        const frameImage = (
            <Image
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0"
                fill
                sizes={`${portraitSize}px`}
                src={resolvedFrameUrl}
                unoptimized
            />
        );

        return (
            <div
                className={`relative inline-flex shrink-0 overflow-visible ${className ?? ""}`}
                style={{ height: portraitSize, width: portraitSize }}
            >
                {isOverlayFrame ? (
                    <>
                        {/* Full-bleed portrait with the artwork on top: this
                            frame has no opening to nest the portrait in. */}
                        <div
                            className="absolute flex items-center justify-center overflow-hidden rounded-full bg-muted"
                            style={{ inset: 0 }}
                        >
                            {avatarContent}
                        </div>
                        {frameImage}
                    </>
                ) : (
                    <>
                        {frameImage}
                        <div
                            className="absolute flex items-center justify-center overflow-hidden rounded-full bg-muted"
                            style={{
                                left: avatarOffsetPx,
                                top: avatarOffsetPx,
                                width: actualAvatarSize,
                                height: actualAvatarSize,
                            }}
                        >
                            {avatarContent}
                        </div>
                    </>
                )}
            </div>
        );
    }

    // Unframed: still reserves the full slot so rows line up with the framed
    // avatars beside it, but draws the portrait at PLAIN_PORTRAIT_FRACTION.
    return (
        <div
            className={`relative inline-flex shrink-0 overflow-visible ${className ?? ""}`}
            style={{ height: boxPx, width: boxPx }}
        >
            <div
                className="absolute flex items-center justify-center overflow-hidden rounded-full bg-muted"
                style={{
                    left: avatarOffsetPx,
                    top: avatarOffsetPx,
                    width: actualAvatarSize,
                    height: actualAvatarSize,
                }}
            >
                {avatarContent}
            </div>
        </div>
    );
}
