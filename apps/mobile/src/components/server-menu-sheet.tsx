import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import {
    Hash,
    Shield,
    Users,
    VolumeX,
    Volume2,
    Settings2,
} from "lucide-react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFirepitBootstrap } from "@/providers/firepit-provider";
import { muteServer } from "@/lib/firepit/messages";
import { captureError } from "@/lib/sentry";

type ServerMenuSheetProps = {
    visible: boolean;
    onClose: () => void;
    /** Opens the member sheet. Members are a sheet rather than a route, so the
     *  menu closes and hands over to it. */
    onOpenMembers: () => void;
    serverId: string;
    serverName?: string | null;
    channelName?: string | null;
    /** Shown under the channel name; moved here from the chat header, where
     *  it was truncated to nothing. */
    channelTopic?: string | null;
    /** Mirrors the deleted server page: any role grants access to these. */
    canManageServer: boolean;
};

/**
 * The server controls that used to live on the dedicated server page.
 *
 * Reached from the chat page so browsing channels and administering the server
 * are the same surface rather than two pages reached through the home tab.
 */
export function ServerMenuSheet({
    visible,
    onClose,
    onOpenMembers,
    serverId,
    serverName,
    channelName,
    channelTopic,
    canManageServer,
}: ServerMenuSheetProps) {
    const theme = useTheme();
    const { instanceUrl, accessToken, mutes, setMutedOverride } =
        useFirepitBootstrap();
    // Server mute state comes from the provider rather than a local boolean.
    // It used to start false and never be read, so a server muted earlier — or
    // on another device — showed "Mute server" and the first tap was a silent
    // no-op that needed a second tap to actually unmute.
    const muted = mutes.servers.has(serverId);
    const [busy, setBusy] = useState(false);

    const go = useCallback(
        (path: string) => {
            onClose();
            router.push(path as never);
        },
        [onClose],
    );

    const toggleMute = useCallback(async () => {
        if (!instanceUrl || !accessToken || busy) return;
        setBusy(true);
        try {
            const res = await muteServer(
                instanceUrl,
                accessToken,
                serverId,
                !muted,
            );
            setMutedOverride("servers", serverId, Boolean(res.muted));
        } catch (error) {
            captureError(
                error instanceof Error ? error : new Error(String(error)),
                {
                    handler: "serverMenu:muteServer",
                },
            );
        } finally {
            setBusy(false);
        }
    }, [accessToken, busy, instanceUrl, muted, serverId, setMutedOverride]);

    const openMembers = useCallback(() => {
        onClose();
        onOpenMembers();
    }, [onClose, onOpenMembers]);

    const items: {
        key: string;
        label: string;
        hint?: string;
        icon: React.ReactNode;
        onPress: () => void;
        destructive?: boolean;
    }[] = [
        {
            key: "members",
            label: "Members",
            icon: <Users size={16} color={theme.foreground} />,
            onPress: openMembers,
        },
        ...(canManageServer
            ? [
                  {
                      key: "channels",
                      label: "Manage channels",
                      icon: <Hash size={16} color={theme.foreground} />,
                      onPress: () => go(`/server/${serverId}/channels`),
                  },
                  {
                      key: "roles",
                      label: "Roles & permissions",
                      icon: <Shield size={16} color={theme.foreground} />,
                      onPress: () => go(`/server/${serverId}/roles`),
                  },
              ]
            : []),
        {
            key: "mute",
            label: muted ? "Unmute server" : "Mute server",
            icon: muted ? (
                <Volume2 size={16} color={theme.foreground} />
            ) : (
                <VolumeX size={16} color={theme.foreground} />
            ),
            onPress: () => {
                void toggleMute();
            },
        },
    ];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View
                style={[
                    styles.sheet,
                    { backgroundColor: theme.card, borderColor: theme.border },
                ]}
            >
                <View
                    style={[styles.grabber, { backgroundColor: theme.border }]}
                />
                <View style={styles.header}>
                    <Settings2 size={16} color={theme.mutedForeground} />
                    <View style={styles.headerText}>
                        <ThemedText type="smallBold" numberOfLines={1}>
                            {serverName || "Server"}
                        </ThemedText>
                        {channelName ? (
                            <ThemedText
                                type="code"
                                themeColor="mutedForeground"
                                numberOfLines={1}
                            >
                                {channelName}
                            </ThemedText>
                        ) : null}
                        {channelTopic?.trim() ? (
                            <ThemedText
                                themeColor="mutedForeground"
                                numberOfLines={3}
                            >
                                {channelTopic}
                            </ThemedText>
                        ) : null}
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Close server menu"
                        onPress={onClose}
                        hitSlop={8}
                    >
                        <ThemedText type="code" themeColor="mutedForeground">
                            Close
                        </ThemedText>
                    </Pressable>
                </View>

                {items.map((item) => (
                    <Pressable
                        key={item.key}
                        accessibilityRole="button"
                        onPress={item.onPress}
                        style={({ pressed }) => [
                            styles.item,
                            pressed && styles.itemPressed,
                        ]}
                    >
                        {item.icon}
                        <View style={styles.itemText}>
                            <ThemedText type="small">{item.label}</ThemedText>
                            {item.hint ? (
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                    numberOfLines={1}
                                >
                                    {item.hint}
                                </ThemedText>
                            ) : null}
                        </View>
                    </Pressable>
                ))}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFill,
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        paddingBottom: Spacing.four,
    },
    grabber: {
        alignSelf: "center",
        width: 36,
        height: 4,
        borderRadius: 2,
        marginTop: Spacing.two,
        marginBottom: Spacing.one,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
    },
    headerText: {
        flex: 1,
        minWidth: 0,
    },
    item: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
    },
    itemPressed: {
        opacity: 0.6,
    },
    itemText: {
        flex: 1,
        minWidth: 0,
    },
});
