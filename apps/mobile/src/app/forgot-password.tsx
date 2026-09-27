import { router } from "expo-router";
import { useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { requestPasswordReset } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

export default function ForgotPasswordScreen() {
    const { instanceUrl } = useFirepitBootstrap();
    const theme = useTheme();
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!email.trim() || !instanceUrl) {
            setError("Enter your email address.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await requestPasswordReset(instanceUrl, email.trim());
            setSubmitted(true);
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Unable to send password reset",
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.screen, { backgroundColor: theme.background }]}>
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                    >
                        <ThemedView style={styles.shell}>
                            <ThemedView
                                type="card"
                                style={[styles.heroCard, { borderColor: theme.border }]}
                            >
                                <ThemedText type="code" themeColor="accent">
                                    Firepit
                                </ThemedText>
                                <ThemedText type="title">
                                    Reset password
                                </ThemedText>
                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.copy}
                                >
                                    Enter your email and we'll send you a link
                                    to reset your password.
                                </ThemedText>
                            </ThemedView>

                            <ThemedView
                                type="card"
                                style={[styles.panel, { borderColor: theme.border }]}
                            >
                                {submitted ? (
                                    <View style={styles.successBox}>
                                        <ThemedText type="smallBold">
                                            Check your inbox
                                        </ThemedText>
                                        <ThemedText
                                            themeColor="mutedForeground"
                                            style={styles.copy}
                                        >
                                            If that address is registered, a password
                                            reset link is on its way. Open it on any
                                            device to set a new password.
                                        </ThemedText>
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => router.replace("/login")}
                                            style={({ pressed }) => [
                                                styles.button,
                                                {
                                                    backgroundColor: theme.primary,
                                                    opacity: pressed ? 0.85 : 1,
                                                },
                                            ]}
                                        >
                                            <ThemedText
                                                type="smallBold"
                                                themeColor="primaryForeground"
                                            >
                                                Back to sign in
                                            </ThemedText>
                                        </Pressable>
                                    </View>
                                ) : (
                                    <>
                                        <TextInput
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            autoComplete="email"
                                            keyboardType="email-address"
                                            placeholder="Email address"
                                            placeholderTextColor={theme.mutedForeground}
                                            textContentType="emailAddress"
                                            value={email}
                                            onChangeText={setEmail}
                                            style={[
                                                styles.input,
                                                {
                                                    backgroundColor: theme.card,
                                                    borderColor: theme.input,
                                                    color: theme.foreground,
                                                },
                                            ]}
                                        />
                                        <Pressable
                                            accessibilityRole="button"
                                            disabled={loading}
                                            onPress={handleSubmit}
                                            style={({ pressed }) => [
                                                styles.button,
                                                {
                                                    backgroundColor: theme.primary,
                                                    opacity:
                                                        pressed || loading ? 0.85 : 1,
                                                },
                                            ]}
                                        >
                                            <ThemedText
                                                type="smallBold"
                                                themeColor="primaryForeground"
                                            >
                                                {loading
                                                    ? "Sending…"
                                                    : "Send reset link"}
                                            </ThemedText>
                                        </Pressable>
                                        {error ? (
                                            <ThemedText
                                                themeColor="danger"
                                                style={styles.metaText}
                                            >
                                                {error}
                                            </ThemedText>
                                        ) : null}
                                    </>
                                )}
                            </ThemedView>
                        </ThemedView>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    flex: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.three,
    },
    shell: {
        flex: 1,
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.four,
        paddingTop: Spacing.four,
    },
    heroCard: {
        borderRadius: 28,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    copy: { fontSize: 14, lineHeight: 20 },
    panel: {
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.three,
        borderWidth: 1,
    },
    successBox: {
        gap: Spacing.three,
    },
    input: {
        borderRadius: 16,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderWidth: 1,
        fontSize: 16,
    },
    button: {
        minHeight: 48,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.four,
        borderWidth: 1,
    },
    metaText: { fontSize: 13, lineHeight: 18 },
});