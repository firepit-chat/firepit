import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/hooks/use-theme";
import { cacheManager } from "@/lib/cache/CacheManager";

type CacheState = {
  requestedUri: string;
  cachedUri: string | null;
  loadFailed: boolean;
};

const EMPTY_CACHE_STATE: CacheState = {
  requestedUri: "",
  cachedUri: null,
  loadFailed: false,
};

// The frame box is fixed at the requested size, so this bounds how small the
// portrait may get inside a frame with a deep opening.
const MIN_PORTRAIT_FRACTION = 0.5;

// An unframed portrait would otherwise fill its whole slot, which looks heavier
// than a framed one beside it — the frame's artwork fills the space the portrait
// gives up. Pulling the plain portrait down to the typical framed opening (most
// frames measure 64%) keeps a mixed row even.
const PLAIN_PORTRAIT_FRACTION = 0.66;

export function Avatar({
  uri,
  size = 40,
  initials,
  frameUrl,
  frameInset = 12,
}: {
  uri?: string | null;
  size?: number;
  initials?: string;
  frameUrl?: string;
  /** Percentage 0-45; 0 means an overlay frame. Measured from the artwork. */
  frameInset?: number;
}) {
  const colors = useTheme();
  const [cacheState, setCacheState] = useState<CacheState>(EMPTY_CACHE_STATE);

  useEffect(() => {
    const requested = uri?.trim() ?? "";
    setCacheState({ requestedUri: requested, cachedUri: null, loadFailed: false });

    if (!requested || !cacheManager.shouldCacheProfilePictures()) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const cached = await cacheManager.getCachedImage(requested);
        if (cancelled) return;
        if (cached) {
          setCacheState((prev) =>
            prev.requestedUri === requested ? { ...prev, cachedUri: cached } : prev,
          );
          return;
        }
        const downloaded = await cacheManager.cacheImage(requested);
        if (!cancelled) {
          setCacheState((prev) =>
            prev.requestedUri === requested ? { ...prev, cachedUri: downloaded } : prev,
          );
        }
      } catch {
        // Leave cachedUri null for the fresh URI; nothing to reset here.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri]);

  const requestedUri = uri?.trim() ?? "";
  const stateMatches = cacheState.requestedUri === requestedUri;
  const sourceUri =
    stateMatches && cacheState.cachedUri ? cacheState.cachedUri : uri;
  const loadFailed = stateMatches && cacheState.loadFailed;

  const hasFrame = Boolean(frameUrl && frameUrl.length > 0);
  // `frameInset: 0` is the wire signal for an overlay frame: the artwork
  // crosses the centre, so the portrait is full-bleed with the artwork drawn
  // over it rather than nested inside a ring. Insets are measured from the
  // artwork and several genuinely need ~40%, so the ceiling is generous.
  const isOverlayFrame = hasFrame && frameInset <= 0;
  const insetPercent =
    hasFrame && !isOverlayFrame ? Math.max(0, Math.min(frameInset, 45)) : 0;

  // The frame box is always the requested size, so a list of people lines up no
  // matter which frames they picked. Inside it, the portrait fills the frame's
  // opening when the opening is big enough, and is floored at
  // MIN_PORTRAIT_FRACTION otherwise — it is then drawn over the frame's inner
  // edge, which reads as a portrait sitting in front of the frame rather than a
  // hole that does not line up.
  //
  // Growing the box instead would keep every portrait identical but make the
  // element up to 4x wider for a deep frame, which is far more disruptive.
  const openFraction = Math.max(0.1, 1 - 2 * (insetPercent / 100));
  const openingSize = size * openFraction;
  const innerSize =
    hasFrame && !isOverlayFrame
      ? Math.round(Math.max(openingSize, size * MIN_PORTRAIT_FRACTION))
      : isOverlayFrame
        ? size
        : Math.round(size * PLAIN_PORTRAIT_FRACTION);
  const offsetPx = Math.round((size - innerSize) / 2);

  const getInitials = (): string => {
    if (!initials) return "?";
    const trimmed = initials.trim();
    if (!trimmed) return "?";
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  const avatarContent =
    sourceUri && sourceUri.trim() !== "" && !loadFailed ? (
      <Image
        source={{ uri: sourceUri }}
        style={{ width: innerSize, height: innerSize }}
        contentFit="cover"
        transition={150}
        onError={() =>
          setCacheState((prev) =>
            prev.requestedUri === requestedUri ? { ...prev, loadFailed: true } : prev,
          )
        }
      />
    ) : (
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          backgroundColor: colors.muted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: innerSize * 0.38,
            fontWeight: "600",
          }}
        >
          {getInitials()}
        </Text>
      </View>
    );

  if (frameUrl) {
    const frameImage = (
      <Image
        source={{ uri: frameUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
      />
    );

    if (isOverlayFrame) {
      // Full-bleed portrait with the artwork on top: this frame has no
      // opening for the portrait to nest inside.
      return (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: "hidden",
          }}
        >
          {avatarContent}
          {frameImage}
        </View>
      );
    }

    return (
      <View style={{ width: size, height: size }}>
        {/* Frame image — fills entire container */}
        {frameImage}
        {/* Avatar inset within frame */}
        <View
          style={{
            position: "absolute",
            left: offsetPx,
            top: offsetPx,
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            overflow: "hidden",
          }}
        >
          {avatarContent}
        </View>
      </View>
    );
  }

  // Unframed: still reserves the full slot so rows line up with the framed
  // avatars beside it, but draws the portrait at PLAIN_PORTRAIT_FRACTION.
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: "absolute",
          left: offsetPx,
          top: offsetPx,
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          overflow: "hidden",
        }}
      >
        {avatarContent}
      </View>
    </View>
  );
}

export default Avatar;
