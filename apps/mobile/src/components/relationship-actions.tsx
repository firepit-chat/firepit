import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useRelationship } from "@/hooks/use-relationship";
import type { RelationshipStatus } from "@/lib/firepit/types";

type RelationshipActionsProps = {
    targetUserId: string;
};

type ActionButtonProps = {
    label: string;
    onPress: () => void;
    tone?: "primary" | "secondary" | "destructive" | "ghost";
    disabled?: boolean;
};

function ActionPill({ label, onPress, tone = "primary", disabled }: ActionButtonProps) {
    const theme = useTheme();
    const bg = {
        primary: theme.primary,
        secondary: theme.secondary,
        destructive: theme.destructive,
        ghost: theme.muted,
    }[tone];
    const fg = {
        primary: theme.primaryForeground,
        secondary: theme.foreground,
        destructive: theme.destructiveForeground,
        ghost: theme.foreground,
    }[tone];

    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => ({
                backgroundColor: bg,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: Spacing.three,
                paddingVertical: Spacing.one + 2,
                opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
        >
            <ThemedText type="smallBold" style={{ color: fg }}>
                {label}
            </ThemedText>
        </Pressable>
    );
}

type StatusTone = "neutral" | "success" | "warning" | "destructive";

/**
 * The single most relevant thing to say about a relationship.
 *
 * This used to render one pill per fact, so a blocked outgoing request could
 * put "Friend", "Incoming request", "Blocked" and "Friends-only DMs" in a
 * wrapped row of badges. A row of pills for one subject reads as clutter and
 * undercuts the rest of the UI; one line of text reads as a status.
 */
function statusFor(relationship: RelationshipStatus): {
    label: string;
    tone: StatusTone;
} | null {
    if (relationship.blockedMe) return { label: "Blocked you", tone: "destructive" };
    if (relationship.blockedByMe) return { label: "Blocked", tone: "destructive" };
    if (relationship.incomingRequest) return { label: "Incoming request", tone: "warning" };
    if (relationship.outgoingRequest) return { label: "Request sent", tone: "neutral" };
    if (relationship.isFriend) return { label: "Friends", tone: "success" };
    return null;
}

function StatusLine({ label, tone }: { label: string; tone: StatusTone }) {
    const theme = useTheme();
    const dot = {
        neutral: theme.mutedForeground,
        success: theme.success,
        warning: theme.warning,
        destructive: theme.destructive,
    }[tone];

    return (
        <View style={styles.statusLine}>
            <View style={[styles.statusDot, { backgroundColor: dot }]} />
            <ThemedText type="code" themeColor="mutedForeground">
                {label}
            </ThemedText>
        </View>
    );
}

export function RelationshipActions({
    targetUserId,
}: RelationshipActionsProps) {
    const {
        relationship,
        loading,
        actionLoading,
        error,
        isSelf,
        sendFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        removeFriendship,
        blockUser,
        unblockUser,
    } = useRelationship(targetUserId);

    const [blockConfirming, setBlockConfirming] = useState(false);

    if (isSelf) return null;
    if (loading && !relationship) {
        return (
            <ThemedText themeColor="mutedForeground" type="code">
                Loading…
            </ThemedText>
        );
    }

    const disabled = loading || actionLoading;

    return (
        <View style={styles.container}>
            {relationship ? (
                <View style={styles.statusGroup}>
                    {statusFor(relationship) ? (
                        <StatusLine
                            {...(statusFor(relationship) as {
                                label: string;
                                tone: StatusTone;
                            })}
                        />
                    ) : null}
                    {/* A privacy setting, not a status, so it reads as a note
                        rather than competing with the relationship state. */}
                    {relationship.directMessagePrivacy === "friends" &&
                    !relationship.isFriend ? (
                        <ThemedText
                            type="code"
                            themeColor="mutedForeground"
                        >
                            Friends-only DMs
                        </ThemedText>
                    ) : null}
                </View>
            ) : null}

            <View style={styles.buttonRow}>
                {relationship?.incomingRequest ? (
                    <>
                        <ActionPill
                            label="Accept"
                            onPress={() => void acceptFriendRequest()}
                            disabled={disabled}
                            tone="primary"
                        />
                        <ActionPill
                            label="Decline"
                            onPress={() => void declineFriendRequest()}
                            disabled={disabled}
                            tone="ghost"
                        />
                    </>
                ) : relationship?.isFriend ? (
                    <ActionPill
                        label="Remove Friend"
                        onPress={() => void removeFriendship()}
                        disabled={disabled}
                        tone="secondary"
                    />
                ) : relationship?.outgoingRequest ? (
                    <ActionPill
                        label="Cancel Request"
                        onPress={() => void removeFriendship()}
                        disabled={disabled}
                        tone="secondary"
                    />
                ) : relationship?.canReceiveFriendRequest ? (
                    <ActionPill
                        label="Add Friend"
                        onPress={() => void sendFriendRequest()}
                        disabled={disabled}
                        tone="primary"
                    />
                ) : null}

                {relationship?.blockedByMe ? (
                    <ActionPill
                        label="Unblock"
                        onPress={() => void unblockUser()}
                        disabled={disabled}
                        tone="secondary"
                    />
                ) : blockConfirming ? (
                    <>
                        <ActionPill
                            label="Confirm Block"
                            onPress={() => {
                                void blockUser();
                                setBlockConfirming(false);
                            }}
                            disabled={disabled}
                            tone="destructive"
                        />
                        <ActionPill
                            label="Cancel"
                            onPress={() => setBlockConfirming(false)}
                            disabled={disabled}
                            tone="ghost"
                        />
                    </>
                ) : (
                    <ActionPill
                        label="Block"
                        onPress={() => setBlockConfirming(true)}
                        disabled={disabled || relationship?.blockedMe}
                        tone="destructive"
                    />
                )}
            </View>

            {error ? (
                <ThemedText themeColor="destructive" type="code">
                    {error}
                </ThemedText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: Spacing.two,
    },
    statusGroup: {
        gap: Spacing.half,
    },
    statusLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.one,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    buttonRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: Spacing.one,
    },
});
