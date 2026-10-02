import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * Colours the spoiler needs. Deliberately structural rather than tied to any
 * one app's theme type, so a consumer can pass its own token object directly.
 */
export type SpoilerTheme = {
    readonly text: string;
    readonly backgroundElement: string;
    readonly border: string;
    readonly primary: string;
    readonly accentForeground: string;
};

export type SpoilerProps = {
    /** The spoiler body. Not mounted at all while collapsed. */
    readonly children?: ReactNode;
    /** Visible text drawn on the collapsed control. */
    readonly placeholder?: string;
    /** Visible text drawn on the control once revealed, to hide it again. */
    readonly hideLabel?: string;
    /** Start revealed. */
    readonly defaultRevealed?: boolean;
    /** Controlled reveal state. */
    readonly revealed?: boolean;
    readonly onRevealedChange?: (revealed: boolean) => void;
    readonly theme: SpoilerTheme;
};

const DEFAULT_HIDE_LABEL = "Hide spoiler";
const DEFAULT_PLACEHOLDER = "Tap to reveal";

/**
 * A tap-to-reveal spoiler for React Native.
 *
 * Mirrors the web component's contract: while collapsed the body is unmounted
 * rather than hidden, so VoiceOver and TalkBack never encounter the text and
 * there is no blur layer or animation to pay for while scrolling a long
 * transcript.
 */
export function Spoiler({
    children,
    placeholder = DEFAULT_PLACEHOLDER,
    hideLabel = DEFAULT_HIDE_LABEL,
    defaultRevealed = false,
    revealed,
    onRevealedChange,
    theme,
}: SpoilerProps) {
    const [internalRevealed, setInternalRevealed] = useState(defaultRevealed);
    const isControlled = revealed !== undefined;
    const isRevealed = isControlled ? revealed : internalRevealed;

    const toggle = () => {
        const next = !isRevealed;
        if (!isControlled) {
            setInternalRevealed(next);
        }
        onRevealedChange?.(next);
    };

    return (
        <View style={styles.root}>
            <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isRevealed }}
                accessibilityLabel={isRevealed ? hideLabel : placeholder}
                onPress={toggle}
                style={({ pressed }) => [
                    styles.trigger,
                    {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.border,
                        opacity: pressed ? 0.7 : 1,
                    },
                ]}
            >
                <Text
                    numberOfLines={1}
                    style={[styles.triggerLabel, { color: theme.text }]}
                >
                    {isRevealed ? hideLabel : placeholder}
                </Text>
            </Pressable>
            {isRevealed ? <View style={styles.content}>{children}</View> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        marginVertical: 2,
    },
    trigger: {
        alignSelf: "flex-start",
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: "hidden",
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    triggerLabel: {
        fontSize: 13,
        fontWeight: "600",
    },
    content: {
        marginTop: 4,
    },
});

export { DEFAULT_HIDE_LABEL, DEFAULT_PLACEHOLDER };
