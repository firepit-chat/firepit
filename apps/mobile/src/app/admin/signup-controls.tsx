import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
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
    actOnSignup,
    fetchSignupControls,
    setSignupPolicy,
    type PendingSignup,
    type SignupPolicy,
} from "@/lib/firepit";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

const POLICY_OPTIONS: {
    value: SignupPolicy;
    label: string;
    desc: string;
}[] = [
    {
        value: "open",
        label: "Open",
        desc: "Anyone can join immediately",
    },
    {
        value: "approval",
        label: "Approval",
        desc: "New accounts wait for admin approval",
    },
    {
        value: "disabled",
        label: "Disabled",
        desc: "No new signups accepted",
    },
];

function formatTime(value?: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

export default function SignupControlsScreen() {
    const theme = useTheme();
    const { instanceUrl, accessToken } = useFirepitBootstrap();
    const [policy, setPolicy] = useState<SignupPolicy | null>(null);
    const [pending, setPending] = useState<PendingSignup[]>([]);
    const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [actingId, setActingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!instanceUrl || !accessToken) return;
        setLoadState("loading");
        setLoadError(null);
        try {
            const res = await fetchSignupControls(instanceUrl, accessToken);
            setPolicy(res.policy ?? null);
            setPending(res.pending ?? []);
            setLoadState("ready");
        } catch (error) {
            setLoadState("error");
            setLoadError(
                error instanceof Error ? error.message : "Unable to load signup controls",
            );
        }
    }, [accessToken, instanceUrl]);

    const handlePolicyChange = useCallback(
        async (value: SignupPolicy) => {
            if (!instanceUrl || !accessToken || value === policy) return;
            setSavingPolicy(true);
            setLoadError(null);
            try {
                await setSignupPolicy(instanceUrl, accessToken, value);
                setPolicy(value);
            } catch (error) {
                setLoadError(
                    error instanceof Error ? error.message : "Unable to update signup policy",
                );
            } finally {
                setSavingPolicy(false);
            }
        },
        [accessToken, instanceUrl, policy],
    );

    const handleAction = useCallback(
        async (userId: string, action: "approve" | "reject") => {
            if (!instanceUrl || !accessToken) return;
            setActingId(`${action}:${userId}`);
            setLoadError(null);
            try {
                await actOnSignup(instanceUrl, accessToken, userId, action);
                setPending((prev) => prev.filter((entry) => entry.userId !== userId));
            } catch (error) {
                setLoadError(
                    error instanceof Error
                        ? error.message
                        : `Unable to ${action} signup`,
                );
            } finally {
                setActingId(null);
            }
        },
        [accessToken, instanceUrl],
    );

    useEffect(() => {
        void load();
    }, [load]);

    useRetryOnReconnect(loadState === "error", load);

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
                                <ThemedText type="smallBold">Signup controls</ThemedText>
                                <View style={styles.headerButton} />
                            </View>

                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <ThemedText type="smallBold">Signup policy</ThemedText>
                                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                    Control how new accounts are accepted on this instance.
                                </ThemedText>
                                <View style={styles.policyRow}>
                                    {POLICY_OPTIONS.map((option) => {
                                        const selected = policy === option.value;
                                        return (
                                            <Pressable
                                                key={option.value}
                                                accessibilityRole="button"
                                                disabled={savingPolicy || loadState !== "ready"}
                                                onPress={() => void handlePolicyChange(option.value)}
                                                style={({ pressed }) => [
                                                    styles.policyOption,
                                                    {
                                                        borderColor: selected
                                                            ? theme.primary
                                                            : theme.border,
                                                        backgroundColor: selected
                                                            ? theme.secondary
                                                            : theme.card,
                                                        opacity: pressed || savingPolicy ? 0.7 : 1,
                                                    },
                                                ]}
                                            >
                                                <ThemedText type="smallBold">
                                                    {option.label}
                                                </ThemedText>
                                                <ThemedText themeColor="mutedForeground" style={styles.policyDesc}>
                                                    {option.desc}
                                                </ThemedText>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </ThemedView>

                            <ThemedView
                                type="card"
                                style={[styles.card, { borderColor: theme.border }]}
                            >
                                <ThemedText type="smallBold">
                                    Pending approvals
                                </ThemedText>
                                <ThemedText themeColor="mutedForeground" style={styles.copy}>
                                    Accounts waiting to be let in.
                                </ThemedText>

                                {loadState === "loading" ? (
                                    <View style={styles.loadingRow}>
                                        <ActivityIndicator color={theme.primary} />
                                        <ThemedText themeColor="mutedForeground">
                                            Loading pending signups…
                                        </ThemedText>
                                    </View>
                                ) : null}

                                {loadState === "ready" && pending.length === 0 ? (
                                    <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
                                        No pending signups.
                                    </ThemedText>
                                ) : null}

                                {pending.map((entry) => {
                                    const isActing = actingId === `approve:${entry.userId}` || actingId === `reject:${entry.userId}`;
                                    return (
                                        <View key={entry.userId} style={styles.pendingRow}>
                                            <View style={styles.pendingCopy}>
                                                <ThemedText type="smallBold" numberOfLines={1}>
                                                    {entry.name || "Unnamed user"}
                                                </ThemedText>
                                                <ThemedText themeColor="mutedForeground" style={styles.pendingMeta}>
                                                    {entry.email}
                                                </ThemedText>
                                                <ThemedText themeColor="mutedForeground" style={styles.pendingMeta}>
                                                    Requested {formatTime(entry.createdAt)}
                                                </ThemedText>
                                            </View>
                                            <View style={styles.pendingActions}>
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={isActing}
                                                    onPress={() => {
                                                        if (entry.userId) void handleAction(entry.userId, "approve");
                                                    }}
                                                    style={({ pressed }) => ({
                                                        backgroundColor: theme.secondary,
                                                        borderRadius: 999,
                                                        paddingHorizontal: Spacing.two,
                                                        paddingVertical: Spacing.one,
                                                        opacity: pressed || isActing ? 0.6 : 1,
                                                    })}
                                                >
                                                    <ThemedText type="smallBold">
                                                        {isActing ? "…" : "Approve"}
                                                    </ThemedText>
                                                </Pressable>
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={isActing}
                                                    onPress={() => {
                                                        if (entry.userId) void handleAction(entry.userId, "reject");
                                                    }}
                                                    style={({ pressed }) => ({
                                                        borderColor: theme.border,
                                                        borderWidth: 1,
                                                        borderRadius: 999,
                                                        paddingHorizontal: Spacing.two,
                                                        paddingVertical: Spacing.one,
                                                        opacity: pressed || isActing ? 0.6 : 1,
                                                    })}
                                                >
                                                    <ThemedText type="smallBold" themeColor="danger">
                                                        Reject
                                                    </ThemedText>
                                                </Pressable>
                                            </View>
                                        </View>
                                    );
                                })}

                                {loadError ? (
                                    <ThemedText themeColor="danger" style={styles.errorText}>
                                        {loadError}
                                    </ThemedText>
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
    policyRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.two,
    },
    policyOption: {
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 120,
        borderRadius: 14,
        borderWidth: 1,
        padding: Spacing.two,
        gap: Spacing.half,
    },
    policyDesc: { fontSize: 12, lineHeight: 16 },
    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.two,
    },
    emptyText: {
        fontSize: 14,
        lineHeight: 20,
        paddingVertical: Spacing.four,
        textAlign: "center",
    },
    pendingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.two,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(128,128,128,0.25)",
    },
    pendingCopy: { flex: 1, gap: 2 },
    pendingMeta: { fontSize: 12, lineHeight: 16 },
    pendingActions: {
        flexDirection: "row",
        gap: Spacing.one,
        alignItems: "center",
    },
    errorText: { fontSize: 13, lineHeight: 18 },
});