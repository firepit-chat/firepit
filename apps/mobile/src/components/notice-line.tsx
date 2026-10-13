import { TriangleAlert } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { withAlpha } from "@/constants/theme-alpha";

/**
 * One line, shown only when something actually needs attention.
 *
 * Connection and version state used to be reported as a row of pills —
 * "online", "compatible", and the instance version number — sitting above the
 * page content. In the normal case all three restate things that are simply
 * true, so the row carried no information while reading like a status board.
 * Healthy is now silent; a genuine problem gets a single, specific line.
 */
export function NoticeLine({
    children,
    tone = "warning",
}: {
    children: string;
    tone?: "warning" | "danger";
}) {
    const theme = useTheme();
    const accent = tone === "danger" ? theme.destructive : theme.warning;

    return (
        <View
            style={[
                styles.row,
                {
                    backgroundColor: withAlpha(accent, 0.12),
                    borderColor: withAlpha(accent, 0.3),
                },
            ]}
        >
            <TriangleAlert size={14} color={accent} />
            <ThemedText themeColor="mutedForeground" style={styles.text}>
                {children}
            </ThemedText>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
        alignSelf: "flex-start",
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
    },
    text: {
        fontSize: 13,
        lineHeight: 18,
        flexShrink: 1,
    },
});