import * as Clipboard from "expo-clipboard";
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
    ensurePublishedDmEncryptionKey,
    exportDmEncryptionKey,
    importDmEncryptionKey,
} from "@/lib/firepit/dm-encryption";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

export default function EncryptionKeyScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken, currentUser } = useFirepitBootstrap();
    const userId = currentUser?.$id ?? currentUser?.userId ?? null;

    const [passphrase, setPassphrase] = useState("");
    const [backupText, setBackupText] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<"export" | "import" | null>(null);

    const canExport = passphrase.length >= 8 && !!userId && !busy;
    const canImport =
        passphrase.length >= 8 &&
        backupText.trim().length > 0 &&
        !!userId &&
        !!instanceUrl &&
        !!accessToken &&
        !busy;

    const handleExport = async () => {
        if (!userId) return;
        setBusy("export");
        setError(null);
        setMessage(null);
        try {
            const backup = await exportDmEncryptionKey(passphrase, userId);
            await Clipboard.setStringAsync(backup);
            setMessage(
                "Backup copied to the clipboard. Store it somewhere safe — anyone with it and the passphrase can read your DMs.",
            );
        } catch (exportError) {
            setError(
                exportError instanceof Error
                    ? exportError.message
                    : "Unable to export encryption key",
            );
        } finally {
            setBusy(null);
        }
    };

    const restore = async () => {
        if (!userId || !instanceUrl || !accessToken) return;
        setBusy("import");
        setError(null);
        setMessage(null);
        try {
            await importDmEncryptionKey(passphrase, backupText.trim(), userId);
            await ensurePublishedDmEncryptionKey(
                instanceUrl,
                accessToken,
                userId,
            );
            setBackupText("");
            setMessage("Encryption key restored and published for this device.");
        } catch (importError) {
            setError(
                importError instanceof Error
                    ? importError.message
                    : "Unable to restore encryption key",
            );
        } finally {
            setBusy(null);
        }
    };

    const handleImport = () => {
        if (!canImport) return;
        Alert.alert(
            "Replace encryption key?",
            "This replaces the key stored on this device. Messages encrypted to the old key will no longer be readable here.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Replace",
                    style: "destructive",
                    onPress: () => void restore(),
                },
            ],
        );
    };

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
                <SafeAreaView
                    style={styles.safeArea}
                    edges={["top", "left", "right"]}
                >
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
                                <View
                                    style={[
                                        styles.header,
                                        { borderBottomColor: theme.border },
                                    ]}
                                >
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
                                        Encryption key
                                    </ThemedText>
                                    <View style={styles.headerButton} />
                                </View>

                                <ThemedText
                                    themeColor="mutedForeground"
                                    style={styles.copy}
                                >
                                    Your encrypted DM key lives on this device.
                                    Back it up before reinstalling or switching
                                    phones, or you will lose access to older
                                    encrypted messages.
                                </ThemedText>

                                <ThemedView
                                    type="card"
                                    style={[
                                        styles.card,
                                        { borderColor: theme.border },
                                    ]}
                                >
                                    <ThemedText type="smallBold">
                                        Passphrase
                                    </ThemedText>
                                    <TextInput
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        placeholder="At least 8 characters"
                                        placeholderTextColor={
                                            theme.mutedForeground
                                        }
                                        secureTextEntry
                                        value={passphrase}
                                        onChangeText={setPassphrase}
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
                                        disabled={!canExport}
                                        onPress={() => void handleExport()}
                                        style={({ pressed }) => [
                                            styles.button,
                                            {
                                                backgroundColor: theme.primary,
                                                opacity:
                                                    pressed || !canExport
                                                        ? 0.6
                                                        : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText
                                            type="smallBold"
                                            themeColor="primaryForeground"
                                        >
                                            {busy === "export"
                                                ? "Exporting…"
                                                : "Export key"}
                                        </ThemedText>
                                    </Pressable>
                                </ThemedView>

                                <ThemedView
                                    type="card"
                                    style={[
                                        styles.card,
                                        { borderColor: theme.border },
                                    ]}
                                >
                                    <ThemedText type="smallBold">
                                        Restore from backup
                                    </ThemedText>
                                    <TextInput
                                        multiline
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        placeholder="Paste your backup JSON here"
                                        placeholderTextColor={
                                            theme.mutedForeground
                                        }
                                        value={backupText}
                                        onChangeText={setBackupText}
                                        style={[
                                            styles.input,
                                            styles.textarea,
                                            {
                                                backgroundColor: theme.card,
                                                borderColor: theme.input,
                                                color: theme.foreground,
                                            },
                                        ]}
                                    />
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={!canImport}
                                        onPress={handleImport}
                                        style={({ pressed }) => [
                                            styles.button,
                                            {
                                                backgroundColor: theme.primary,
                                                opacity:
                                                    pressed || !canImport
                                                        ? 0.6
                                                        : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText
                                            type="smallBold"
                                            themeColor="primaryForeground"
                                        >
                                            {busy === "import"
                                                ? "Restoring…"
                                                : "Restore key"}
                                        </ThemedText>
                                    </Pressable>
                                </ThemedView>

                                {message ? (
                                    <ThemedText style={styles.message}>
                                        {message}
                                    </ThemedText>
                                ) : null}
                                {error ? (
                                    <ThemedText
                                        themeColor="destructive"
                                        style={styles.errorText}
                                    >
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
        paddingTop: Spacing.two,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: Spacing.two,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerButton: { minWidth: 60 },
    copy: { lineHeight: 20 },
    card: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        fontSize: 15,
    },
    textarea: { minHeight: 120, textAlignVertical: "top" },
    button: {
        borderRadius: 8,
        paddingVertical: Spacing.two,
        alignItems: "center",
    },
    message: { lineHeight: 20 },
    errorText: { lineHeight: 20 },
});
