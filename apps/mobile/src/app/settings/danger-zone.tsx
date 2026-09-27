import { router } from "expo-router";
import { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    deactivateAccount,
    deleteAccount,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

export default function DangerZoneScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken, signOut } = useFirepitBootstrap();
    const [password, setPassword] = useState("");
    const [confirmText, setConfirmText] = useState("");
    const [busy, setBusy] = useState<"deactivate" | "delete" | null>(null);
    const [error, setError] = useState<string | null>(null);

    const confirmDelete = confirmText.trim() === "DELETE";

    const handleDeactivate = () => {
        if (!instanceUrl || !accessToken) return;
        Alert.alert(
            "Deactivate account?",
            "Your account will be hidden and signed out everywhere. Signing back in brings it back.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Deactivate",
                    style: "destructive",
                    onPress: () => void runAction("deactivate"),
                },
            ],
        );
    };

    const handleDelete = () => {
        if (!instanceUrl || !accessToken || !confirmDelete) return;
        Alert.alert(
            "Permanently delete account?",
            "This cannot be undone. Your messages stay but this account and its profile will be removed forever.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete forever",
                    style: "destructive",
                    onPress: () => void runAction("delete"),
                },
            ],
        );
    };

    const runAction = async (kind: "deactivate" | "delete") => {
        if (!instanceUrl || !accessToken) return;
        setBusy(kind);
        setError(null);
        try {
            const result =
                kind === "deactivate"
                    ? await deactivateAccount(instanceUrl, accessToken, password)
                    : await deleteAccount(instanceUrl, accessToken, password);

            if (result.success) {
                await signOut();
                router.replace("/login");
                return;
            }
            setError(result.error ?? "Could not complete that action.");
        } catch (actionError) {
            setError(
                actionError instanceof Error
                    ? actionError.message
                    : "Could not complete that action.",
            );
        } finally {
            setBusy(null);
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
                                        <ThemedText type="smallBold">Back</ThemedText>
                                    </Pressable>
                                    <ThemedText type="smallBold">Danger zone</ThemedText>
                                    <View style={styles.headerButton} />
                                </View>

                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.copy}
                                >
                                    These actions are permanent and are not
                                    recoverable through the app.
                                </ThemedText>

                                <ThemedView
                                    type="card"
                                    style={[styles.card, { borderColor: theme.border }]}
                                >
                                    <ThemedText type="smallBold">Deactivate account</ThemedText>
                                    <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                        Hides your account and signs you out. Signing back in
                                        reactivates it.
                                    </ThemedText>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={busy !== null || password.length === 0}
                                        onPress={handleDeactivate}
                                        style={({ pressed }) => [
                                            styles.button,
                                            {
                                                borderColor: theme.border,
                                                backgroundColor: theme.secondary,
                                                opacity:
                                                    pressed || busy !== null || password.length === 0
                                                        ? 0.6
                                                        : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText type="smallBold" themeColor="foreground">
                                            {busy === "deactivate" ? "Deactivating…" : "Deactivate account"}
                                        </ThemedText>
                                    </Pressable>
                                </ThemedView>

                                <ThemedView
                                    type="card"
                                    style={[styles.card, { borderColor: theme.border }]}
                                >
                                    <ThemedText type="smallBold" themeColor="danger">
                                        Delete account
                                    </ThemedText>
                                    <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                        Permanently removes the account and wipes its profile,
                                        avatar, and background. This cannot be undone.
                                    </ThemedText>

                                    <TextInput
                                        autoCapitalize="none"
                                        autoCorrect={false}
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

                                    <TextInput
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        placeholder='Type "DELETE" to confirm'
                                        placeholderTextColor={theme.mutedForeground}
                                        value={confirmText}
                                        onChangeText={setConfirmText}
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
                                        disabled={busy !== null || !confirmDelete || password.length === 0}
                                        onPress={handleDelete}
                                        style={({ pressed }) => ({
                                            minHeight: 48,
                                            borderRadius: 999,
                                            alignItems: "center",
                                            justifyContent: "center",
                                            paddingHorizontal: Spacing.four,
                                            borderWidth: 1,
                                            borderColor: theme.danger,
                                            backgroundColor: "transparent",
                                            opacity:
                                                pressed ||
                                                busy !== null ||
                                                !confirmDelete ||
                                                password.length === 0
                                                    ? 0.5
                                                    : 1,
                                        })}
                                    >
                                        <ThemedText type="smallBold" themeColor="danger">
                                            {busy === "delete" ? "Deleting…" : "Delete my account forever"}
                                        </ThemedText>
                                    </Pressable>
                                </ThemedView>

                                {error ? (
                                    <ThemedText themeColor="danger" style={styles.errorText}>
                                        {error}
                                    </ThemedText>
                                ) : null}
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
    errorText: { fontSize: 13, lineHeight: 18 },
});