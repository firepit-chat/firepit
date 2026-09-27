import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useRetryOnReconnect } from "@/hooks/use-retry-on-reconnect";
import {
    fetchSessions,
    revokeOtherSessions,
    revokeSession,
    type SessionEntry,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

function deviceLabel(session: SessionEntry): string {
    const parts = [
        session.device,
        session.deviceModel,
        session.os ? (session.osVersion ? `${session.os} ${session.osVersion}` : session.os) : null,
        session.client,
    ].filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts[0] : "Unknown device";
}

function sessionSubLabel(session: SessionEntry): string {
    const parts = [
        session.client,
        session.os ? (session.osVersion ? `${session.os} ${session.osVersion}` : session.os) : null,
    ].filter(Boolean);
    return parts.join(" · ") || "Unknown client";
}

function formatTime(value?: string): string {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

export default function DevicesScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();

    const [sessions, setSessions] = useState<SessionEntry[]>([]);
    const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const loadSessions = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;
        setLoadState("loading");
        setLoadError(null);
        try {
            const result = await fetchSessions(instanceUrl, accessToken);
            setSessions(result);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error ? error.message : "Unable to load sessions",
            );
        }
    }, [accessToken, instanceUrl]);

    const handleRevoke = useCallback(
        async (sessionId: string) => {
            if (!instanceUrl || !accessToken) return;
            setRevokingId(sessionId);
            try {
                await revokeSession(instanceUrl, accessToken, sessionId);
                setSessions((prev) =>
                    prev.filter((session) => session.$id !== sessionId),
                );
            } catch (error) {
                alert(
                    error instanceof Error ? error.message : "Failed to revoke session",
                );
            } finally {
                setRevokingId(null);
            }
        },
        [accessToken, instanceUrl],
    );

    const handleRevokeOthers = useCallback(() => {
        if (!instanceUrl || !accessToken) return;
        Alert.alert(
            "Sign out all other devices?",
            "Every other session will be revoked. You'll stay signed in here.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sign out others",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await revokeOtherSessions(instanceUrl, accessToken);
                            setSessions((prev) =>
                                prev.filter((session) => session.current === true),
                            );
                        } catch (error) {
                            alert(
                                error instanceof Error
                                    ? error.message
                                    : "Failed to revoke other sessions",
                            );
                        }
                    },
                },
            ],
        );
    }, [accessToken, instanceUrl]);

    useEffect(() => {
        void loadSessions();
    }, [loadSessions]);

    useRetryOnReconnect(loadState === "error", loadSessions);

    const currentCount = sessions.filter((session) => session.current !== true).length;

    return (
        <AuthRouteGuard>
            <View style={[styles.root, { backgroundColor: theme.background }]}>
                <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
                    <ScrollView
                        style={{ width: "100%" }}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
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
                                <ThemedText type="smallBold">Devices</ThemedText>
                                <View style={styles.headerButton} />
                            </View>

                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.copy}
                            >
                                Every device signed in to your account. Revoke
                                any you don’t recognize.
                            </ThemedText>

                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                {loadState === "loading" ? (
                                    <View style={styles.loadingRow}>
                                        <ActivityIndicator color={theme.primary} />
                                        <ThemedText themeColor="mutedForeground">
                                            Loading sessions…
                                        </ThemedText>
                                    </View>
                                ) : null}

                                {loadError ? (
                                    <ThemedText themeColor="danger" style={styles.errorText}>
                                        {loadError}
                                    </ThemedText>
                                ) : null}

                                {loadState === "ready" && sessions.length === 0 ? (
                                    <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
                                        No sessions found.
                                    </ThemedText>
                                ) : null}

                                {sessions.map((session) => (
                                    <View key={session.$id} style={styles.sessionRow}>
                                        <View style={styles.sessionCopy}>
                                            <View style={styles.sessionTitleRow}>
                                                <ThemedText type="smallBold" numberOfLines={1}>
                                                    {deviceLabel(session)}
                                                </ThemedText>
                                                {session.current === true ? (
                                                    <ThemedText type="code" themeColor="accent">
                                                        this device
                                                    </ThemedText>
                                                ) : null}
                                            </View>
                                            <ThemedText themeColor="mutedForeground" style={styles.sessionMeta}>
                                                {sessionSubLabel(session)}
                                            </ThemedText>
                                            <ThemedText themeColor="mutedForeground" style={styles.sessionMeta}>
                                                Expires {formatTime(session.expiresAt)}
                                            </ThemedText>
                                        </View>
                                        {session.current === true ? null : (
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={revokingId === session.$id}
                                                onPress={() => {
                                                    if (session.$id) void handleRevoke(session.$id);
                                                }}
                                                style={({ pressed }) => ({
                                                    borderColor: theme.border,
                                                    borderWidth: 1,
                                                    borderRadius: 999,
                                                    paddingHorizontal: Spacing.three,
                                                    paddingVertical: Spacing.one,
                                                    opacity:
                                                        pressed || revokingId === session.$id ? 0.5 : 1,
                                                })}
                                            >
                                                <ThemedText type="smallBold">
                                                    {revokingId === session.$id ? "…" : "Revoke"}
                                                </ThemedText>
                                            </Pressable>
                                        )}
                                    </View>
                                ))}

                                {currentCount > 0 ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={handleRevokeOthers}
                                        style={({ pressed }) => ({
                                            borderColor: theme.border,
                                            borderWidth: 1,
                                            borderRadius: 999,
                                            paddingVertical: Spacing.two,
                                            alignItems: "center",
                                            opacity: pressed ? 0.7 : 1,
                                            marginTop: Spacing.two,
                                        })}
                                    >
                                        <ThemedText type="smallBold">
                                            Sign out all other devices
                                        </ThemedText>
                                    </Pressable>
                                ) : null}
                            </ThemedView>
                        </View>
                    </ScrollView>
                </SafeAreaView>
            </View>
        </AuthRouteGuard>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
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
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.two,
    },
    errorText: { fontSize: 13, lineHeight: 18 },
    emptyText: {
        fontSize: 14,
        lineHeight: 20,
        paddingVertical: Spacing.four,
        textAlign: "center",
    },
    sessionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.two,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(128,128,128,0.25)",
    },
    sessionCopy: { flex: 1, gap: 2 },
    sessionTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
    },
    sessionMeta: { fontSize: 12, lineHeight: 16 },
});