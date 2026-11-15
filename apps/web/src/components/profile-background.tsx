"use client";
import Image from "next/image";
import { getPresetFrameById } from "@/lib/preset-frames";
import { Avatar } from "@/components/ui/avatar";

type ProfileBackgroundProps = {
    backgroundColor?: string;
    backgroundGradient?: string;
    height?: "sm" | "md" | "lg" | "xl" | "auto";
    className?: string;
    children?: React.ReactNode;
};

const heightClasses = {
    sm: "h-16",
    md: "h-24",
    lg: "h-32",
    xl: "h-40",
    auto: "min-h-0",
};

function ProfileBackground({
    backgroundColor,
    backgroundGradient,
    height = "lg",
    className = "",
    children,
}: ProfileBackgroundProps) {
    const backgroundStyle = {
        background: backgroundGradient ?? backgroundColor ?? "transparent",
    };

    return (
        <div
            className={`relative z-0 w-full overflow-hidden rounded-t-xl ${heightClasses[height]} ${className}`}
            style={backgroundStyle}
        >
            {children && (
                <div className="absolute inset-0 z-20 flex items-end overflow-visible px-6 pb-3">
                    {children}
                </div>
            )}
        </div>
    );
}

type AvatarWithFrameProps = {
    avatarUrl?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
    displayName: string;
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
};

const sizeClasses = {
    sm: { container: 40, avatarPx: 40 },
    md: { container: 64, avatarPx: 64 },
    lg: { container: 80, avatarPx: 80 },
    xl: { container: 112, avatarPx: 112 },
};

export function AvatarWithFrame({
    avatarUrl,
    avatarFramePreset,
    avatarFrameUrl,
    displayName,
    size = "lg",
    className = "",
}: AvatarWithFrameProps) {
    const sizes = sizeClasses[size];
    const presetFrame = avatarFramePreset
        ? getPresetFrameById(avatarFramePreset)
        : null;
    const resolvedFrameUrl =
        avatarFrameUrl?.trim() || presetFrame?.imageUrl?.trim() || "";
    const hasFrameAsset = resolvedFrameUrl.length > 0;
    const frameEmoji = getFrameEmoji(avatarFramePreset);

    // Frame geometry lives in the shared Avatar so a frame is padded the same
    // way here as in chat, the header and the member list. This used to be a
    // second copy of it, which is why the profile hero rendered frames
    // differently from everywhere else.
    if (hasFrameAsset || !frameEmoji) {
        return (
            <Avatar
                alt={displayName}
                className={className}
                fallback={displayName.trim().charAt(0).toUpperCase() || "?"}
                framePreset={avatarFramePreset ?? undefined}
                frameUrl={resolvedFrameUrl || undefined}
                sizePx={sizes.container}
                src={avatarUrl}
            />
        );
    }

    // Preset chosen but no artwork yet: show the portrait with a themed ring
    // and the frame's emoji, so the choice is still visible.
    const frameBorderStyle = presetFrame?.borderStyle || "solid";
    const frameColor = presetFrame?.color || "#6366f1";

    return (
        <div
            className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ${className}`}
            style={{
                borderColor: frameColor,
                borderStyle: frameBorderStyle,
                borderWidth: 3,
                height: sizes.container,
                width: sizes.container,
            }}
        >
            {avatarUrl ? (
                <Image
                    alt={displayName}
                    className="object-cover"
                    fill
                    sizes={`${sizes.avatarPx}px`}
                    src={avatarUrl}
                    unoptimized
                />
            ) : (
                <span className="font-semibold text-foreground/70">
                    {(displayName.trim().charAt(0) || "?").toUpperCase()}
                </span>
            )}
            <span
                aria-hidden="true"
                className="absolute -bottom-1 -right-1 z-10 flex size-5 items-center justify-center rounded-full bg-background text-xs"
            >
                {frameEmoji}
            </span>
            <span className="sr-only">{`Frame: ${presetFrame?.name || "Custom"}`}</span>
        </div>
    );
}

const FRAME_EMOJI_LOOKUP = [
    ["star", "⭐"],
    ["diamond", "💎"],
    ["square", "⬜"],
    ["round", "⚪"],
    ["spring", "🌸"],
    ["summer", "☀️"],
    ["fall", "🍂"],
    ["winter", "❄️"],
] as const;

function getFrameEmoji(framePreset?: string): string | null {
    if (!framePreset) {
        return null;
    }
    const normalizedPreset = framePreset.toLowerCase();

    for (const [presetKey, emoji] of FRAME_EMOJI_LOOKUP) {
        if (normalizedPreset.includes(presetKey)) {
            return emoji;
        }
    }

    return "✨";
}
