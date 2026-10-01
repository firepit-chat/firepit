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
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { changeAccountEmail } from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { AuthRouteGuard } from "@/components/auth-route-guard";

export default function ChangeEmailScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const canSubmit =
        email.trim().length > 0 && password.length > 0 && !loading;

    const handleSubmit = async () => {
        if (!instanceUrl || !accessToken) return;
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            const result = await changeAccountEmail(
                instanceUrl,
                accessToken,
                email.trim(),
                password,
            );
            if (result.success) {
                setMessage(
                    result.message ??
                        "Email updated. Check your inbox for a verification link.",
                );
                setEmail("");
                setPassword("");
            } else {
                setError(result.error ?? "Unable to change email");
            }
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Unable to change email",
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
                <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
                    <KeyboardAvoidingView
                        style={styles.flex}
                        behavior={Platform.OS === "ios" ? "padding" : undefined}
                    >
                        <ScrollView
                            style={{ width: "100%" }}
                            contentContainerStyle={styles.scrollContent}
                            keyboardShouldPersistTaps="handled"
                        >
                            <View style={styles.shell}>
                                <View style={styles.header}>
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={() => router.back()}
                                        style={styles.headerButton}
                                    >
                                        <ThemedText type="smallBold">
                                            Back
                                        </ThemedText>
                                    </Pressable>
                                    <ThemedText type="smallBold">
                                        Change email
                                    </ThemedText>
                                    <View style={styles.headerButton} />
                                </View>

                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.copy}
                                >
                                    Enter your new email and current password.
                                    If email verification is enabled, you’ll get
                                    a link to confirm the new address.
                                </ThemedText>

                                <ThemedView
                                    type="card"
                                    style={[styles.card, { borderColor: theme.border }]}
                                >
                                    <TextInput
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        autoComplete="email"
                                        keyboardType="email-address"
                                        placeholder="New email"
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
                                    <TextInput
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        autoComplete="password"
                                        placeholder="Current password"
                                        placeholderTextColor={theme.mutedForeground}
                                        secureTextEntry
                                        textContentType="password"
                                        value={password}
                                        onChangeText={setPassword}
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
                                        disabled={!canSubmit}
                                        onPress={handleSubmit}
                                        style={({ pressed }) => [
                                            styles.button,
                                            {
                                                backgroundColor: theme.primary,
                                                opacity:
                                                    pressed || !canSubmit ? 0.6 : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText
                                            type="smallBold"
                                            themeColor="primaryForeground"
                                        >
                                            {loading ? "Updating…" : "Update email"}
                                        </ThemedText>
                                    </Pressable>
                                    {message ? (
                                        <ThemedText style={styles.message}>
                                            {message}
                                        </ThemedText>
                                    ) : null}
                                    {error ? (
                                        <ThemedText
                                            themeColor="danger"
                                            style={styles.errorText}
                                        >
                                            {error}
                                        </ThemedText>
                                    ) : null}
                                </ThemedView>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    flex: { flex: 1 },
    safeArea: { flex: 1, paddingHorizontal: Spacing.two },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: BottomTabInset + Spacing.four,
    },
    shell: {
        width: "100%",
        maxWidth: MaxContentWidth,
        alignSelf: "center",
        gap: Spacing.three,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: Spacing.two,
    },
    headerButton: {
        paddingVertical: Spacing.one,
        paddingHorizontal: Spacing.two,
        minWidth: 60,
    },
    copy: { fontSize: 14, lineHeight: 20 },
    card: {
        borderRadius: 22,
        padding: Spacing.three,
        gap: Spacing.two,
        borderWidth: 1,
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
    message: { fontSize: 13, lineHeight: 18 },
    errorText: { fontSize: 13, lineHeight: 18 },
});