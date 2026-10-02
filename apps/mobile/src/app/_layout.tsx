import { DarkTheme, DefaultTheme, Stack, ThemeProvider , router } from "expo-router";
import { useCallback, useMemo } from "react";
import { View } from "react-native";

import { isDarkPalette } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
    ThemePreferenceProvider,
    useThemePreference,
} from "@/providers/theme-preference-context";
import { FirepitProvider } from "@/providers/firepit-provider";
import { UpdateProvider , useUpdate } from "@/providers/update-provider";
import { CacheSettingsProvider } from "@/providers/cache-settings-context";
import { OrientationGate } from "@/components/orientation-gate";
import { UpdatePromptModal } from "@/components/update/update-prompt-modal";
import { OfflineBanner } from "@/components/offline-banner";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { initSentry, Sentry } from "@/lib/sentry";

initSentry();

function UpdatePromptGate() {
  const { showPrompt, result, dismissPrompt } = useUpdate();

  const handleSettings = useCallback(() => {
    dismissPrompt(false);
    router.push("/settings/updates" as never);
  }, [dismissPrompt]);

  if (!showPrompt) return null;

  return (
    <UpdatePromptModal
      result={result}
      onDismiss={dismissPrompt}
      onSettings={handleSettings}
    />
  );
}

function TabLayoutContent() {
    const palette = useTheme();
    const { palette: paletteName } = useThemePreference();
    const { isConnected } = useNetworkStatus();
    const dark = isDarkPalette(paletteName);

    const navigationTheme = useMemo(
        () => ({
            ...(dark ? DarkTheme : DefaultTheme),
            dark,
            colors: {
                ...(dark ? DarkTheme.colors : DefaultTheme.colors),
                background: palette.background,
                card: palette.card,
                text: palette.foreground,
                border: palette.border,
                primary: palette.primary,
                notification: palette.destructive,
            },
        }),
        [palette, dark],
    );

    return (
        <ThemeProvider value={navigationTheme}>
            <AppErrorBoundary palette={palette}>
            <OrientationGate>
                <FirepitProvider>
                    <CacheSettingsProvider>
                        <UpdateProvider>
                            <View style={{ flex: 1, backgroundColor: palette.background }}>
                                {isConnected === false && <OfflineBanner />}
                                <Stack screenOptions={{ headerShown: false }}>
                                    <Stack.Screen name="index" />
                                    <Stack.Screen name="login" />
                                    <Stack.Screen name="(tabs)" />
                                    <Stack.Screen name="explore" />
                                    <Stack.Screen name="search" />
                                    <Stack.Screen name="friends" />
                                    <Stack.Screen name="create-server" />
                                    <Stack.Screen name="invite/[inviteCode]" />
                                    <Stack.Screen name="server/[serverId]" />
                                    <Stack.Screen name="server/messages/[serverId]/[channelId]" />
                                    <Stack.Screen name="thread/[serverId]/[channelId]/[messageId]" />
                                    <Stack.Screen name="thread/[conversationId]/[messageId]" />
                                    <Stack.Screen name="dm/[conversationId]" />
                                    <Stack.Screen name="settings/notifications" />
                                    <Stack.Screen name="settings/updates" />
                                    <Stack.Screen name="settings/appearance" />
                                    <Stack.Screen name="settings/privacy" />
                                </Stack>
                            </View>
                        <UpdatePromptGate />
                        </UpdateProvider>
                    </CacheSettingsProvider>
                </FirepitProvider>
            </OrientationGate>
            </AppErrorBoundary>
        </ThemeProvider>
    );
}

function TabLayout() {
    // Mounted above the content that reads the preference, so the first render
    // already has the default palette rather than flashing unthemed.
    return (
        <ThemePreferenceProvider>
            <TabLayoutContent />
        </ThemePreferenceProvider>
    );
}

export default Sentry.wrap(TabLayout);
