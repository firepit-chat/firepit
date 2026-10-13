import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type EmptyStateProps = {
    icon?: ReactNode;
    title: string;
    /** One short line explaining what would put something here. */
    description?: string;
    /** Optional call to action, e.g. a button that opens a picker. */
    action?: ReactNode;
};

/**
 * Placeholder for a list with nothing in it.
 *
 * These were a lone line of muted text, which reads as a loading failure
 * rather than an empty list. A tinted disc plus a title gives the state a
 * shape and makes the reason legible at a glance.
 */
export function EmptyState({
    icon,
    title,
    description,
    action,
}: EmptyStateProps) {
    const theme = useTheme();

    return (
        <View style={styles.container}>
            {icon ? (
                <View
                    style={[styles.disc, { backgroundColor: theme.muted }]}
                >
                    {icon}
                </View>
            ) : null}
            <ThemedText type="smallBold" style={styles.title}>
                {title}
            </ThemedText>
            {description ? (
                <ThemedText
                    themeColor="mutedForeground"
                    style={styles.description}
                >
                    {description}
                </ThemedText>
            ) : null}
            {action ? <View style={styles.action}>{action}</View> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: "center",
        justifyContent: "center",
        gap: Spacing.one,
        paddingVertical: Spacing.four,
        paddingHorizontal: Spacing.three,
    },
    disc: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: Spacing.one,
    },
    title: {
        textAlign: "center",
    },
    description: {
        textAlign: "center",
        fontSize: 13,
        lineHeight: 19,
        maxWidth: 280,
    },
    action: {
        marginTop: Spacing.two,
    },
});