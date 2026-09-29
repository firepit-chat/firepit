import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
    Spacing,
    THEME_ACCENT_LABELS,
    THEME_ACCENTS,
    THEME_PALETTE_LABELS,
    THEME_PALETTES,
    buildTheme,
} from "@/constants/theme";
import { useThemePreference } from "@/providers/theme-preference-context";

/**
 * Palette and accent pickers for the app theme.
 *
 * Each swatch renders a real sample of the palette it represents by building
 * that palette's tokens directly, so there is no second copy of the colours to
 * keep in sync with `constants/theme`.
 */
export function AppThemePicker() {
    const { palette, accent, setPalette, setAccent } = useThemePreference();

    return (
        <View style={styles.wrapper}>
            <ThemedText type="smallBold">App theme</ThemedText>
            <ThemedText type="small" themeColor="mutedForeground">
                Pick a colour palette and the accent used for highlights.
            </ThemedText>

            <ThemedText type="small" themeColor="mutedForeground">
                Palette
            </ThemedText>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.row}
            >
                {THEME_PALETTES.map((name) => {
                    const selected = name === palette;
                    // Sample the palette with the accent the user already chose.
                    const preview = buildTheme(name, accent);
                    return (
                        <Pressable
                            key={name}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={THEME_PALETTE_LABELS[name]}
                            onPress={() => setPalette(name)}
                            style={[
                                styles.card,
                                {
                                    borderColor: selected
                                        ? preview.primary
                                        : preview.border,
                                },
                            ]}
                        >
                            <View style={styles.swatchRow}>
                                <View
                                    style={[
                                        styles.swatch,
                                        { backgroundColor: preview.background },
                                    ]}
                                />
                                <View
                                    style={[
                                        styles.swatch,
                                        { backgroundColor: preview.primary },
                                    ]}
                                />
                                <View
                                    style={[
                                        styles.swatch,
                                        { backgroundColor: preview.accent },
                                    ]}
                                />
                            </View>
                            <ThemedText type="small" themeColor="foreground">
                                {THEME_PALETTE_LABELS[name]}
                            </ThemedText>
                        </Pressable>
                    );
                })}
            </ScrollView>

            <ThemedText type="small" themeColor="mutedForeground">
                Accent
            </ThemedText>
            <View style={styles.accentGrid}>
                {THEME_ACCENTS.map((name) => {
                    const selected = name === accent;
                    const preview = buildTheme(palette, name);
                    return (
                        <Pressable
                            key={name}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={THEME_ACCENT_LABELS[name]}
                            onPress={() => setAccent(name)}
                            style={[
                                styles.accentChip,
                                {
                                    borderColor: selected
                                        ? preview.primary
                                        : preview.border,
                                },
                            ]}
                        >
                            <View
                                style={[
                                    styles.accentDot,
                                    { backgroundColor: preview.primary },
                                ]}
                            />
                            <ThemedText
                                type="small"
                                themeColor={selected ? "foreground" : "mutedForeground"}
                                numberOfLines={1}
                            >
                                {THEME_ACCENT_LABELS[name]}
                            </ThemedText>
                        </Pressable>
                    );
                })}
            </View>

            <ThemedView type="card" style={styles.previewCard}>
                <ThemedText type="smallBold" themeColor="foreground">
                    Preview
                </ThemedText>
                <PreviewTokens />
            </ThemedView>
        </View>
    );
}

/** Renders the current tokens so the effect of a pick is immediately visible. */
function PreviewTokens() {
    const { palette, accent } = useThemePreference();
    const theme = buildTheme(palette, accent);
    return (
        <View style={styles.previewRow}>
            {(
                [
                    ["Primary", theme.primary],
                    ["Accent", theme.accent],
                    ["Muted", theme.muted],
                    ["Border", theme.border],
                    ["Success", theme.success],
                    ["Warning", theme.warning],
                ] as const
            ).map(([label, value]) => (
                <View key={label} style={styles.previewItem}>
                    <View style={[styles.previewChip, { backgroundColor: value }]} />
                    <ThemedText type="small" themeColor="mutedForeground">
                        {label}
                    </ThemedText>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        gap: Spacing.two,
    },
    row: {
        gap: Spacing.two,
        paddingVertical: Spacing.one,
        paddingRight: Spacing.three,
    },
    card: {
        alignItems: "center",
        gap: Spacing.one,
        borderRadius: 12,
        borderWidth: 2,
        padding: Spacing.two,
    },
    swatchRow: {
        flexDirection: "row",
        overflow: "hidden",
        borderRadius: 8,
    },
    swatch: {
        width: 28,
        height: 36,
    },
    accentGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    accentChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
        borderRadius: 999,
        borderWidth: 2,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.one,
    },
    accentDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
    },
    previewCard: {
        gap: Spacing.two,
        borderRadius: 12,
        padding: Spacing.three,
    },
    previewRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.three,
    },
    previewItem: {
        alignItems: "center",
        gap: Spacing.one,
    },
    previewChip: {
        width: 44,
        height: 28,
        borderRadius: 6,
    },
});
