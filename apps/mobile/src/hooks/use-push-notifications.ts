import { useEffect, useRef, useCallback } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { router } from "expo-router";

import { saveNotificationToken } from "@/lib/firepit/persistence";
import { authHeaders } from "@/lib/firepit/http";

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Register notification categories with action buttons (iOS)
async function registerNotificationCategories() {
  if (Platform.OS !== "ios") return;
  await Notifications.setNotificationCategoryAsync("message", [
    {
      identifier: "open",
      buttonTitle: "Open",
      options: { opensAppToForeground: true },
    },
  ]);
}

// Create Android notification channel (required for Android 8+)
async function registerAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("firepit-messages", {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    showBadge: true,
  });
}

// Call once at startup
void registerNotificationCategories();
void registerAndroidChannel();

/**
 * Push notification data payload sent from the server.
 */
export type PushNotificationData = {
  type: "message" | "mention" | "dm" | "thread_reply";
  serverId?: string;
  channelId?: string;
  conversationId?: string;
  messageId?: string;
};

/**
 * Hook to handle incoming push notifications.
 * Call once at the app root level.
 */
export function usePushNotificationHandler() {
  const lastDataRef = useRef<PushNotificationData | null>(null);
  // Notification ids we have already routed to. On a cold start the stored
  // response is drained explicitly *and* the response listener can fire for the
  // very same tap, so dedupe on the per-push identifier to avoid navigating
  // twice (and pushing the same route onto the stack two entries deep).
  const handledIdsRef = useRef<Set<string>>(new Set());

  const navigateTo = useCallback((data: PushNotificationData) => {
    // Channel-scoped payloads cover plain messages, mentions and thread
    // replies — they all land on the same thread route, so they share a
    // branch. The server also omits messageId on some of these, so fall back
    // to the channel itself rather than dropping the tap.
    const isChannelScoped =
      data.type === "message" ||
      data.type === "mention" ||
      data.type === "thread_reply";
    if (isChannelScoped && data.serverId && data.channelId) {
      router.push(
        (data.messageId
          ? `/thread/${data.serverId}/${data.channelId}/${data.messageId}`
          : `/server/messages/${data.serverId}/${data.channelId}`) as never,
      );
      return;
    }
    if (data.type === "dm" && data.conversationId) {
      router.push(
        (data.messageId
          ? `/thread/${data.conversationId}/${data.messageId}`
          : `/dm/${data.conversationId}`) as never,
      );
    }
  }, []);

  useEffect(() => {
    const routeResponse = (response: {
      notification: { request: { identifier?: string; content: { data?: unknown } } };
    }) => {
      const data = response.notification.request.content.data as
        | PushNotificationData
        | undefined;
      if (!data) return;

      const id = response.notification.request.identifier;
      if (id) {
        if (handledIdsRef.current.has(id)) return;
        handledIdsRef.current.add(id);
      }

      if (data.type === "message") {
        lastDataRef.current = data;
      }
      navigateTo(data);
    };

    // A tap on the notification that cold-launched the app never reaches
    // addNotificationResponseReceivedListener, so the stored response has to be
    // drained explicitly on startup or the tap is silently swallowed.
    //
    // getLastNotificationResponse() is NOT self-clearing: it persists across
    // launches, so it must be cleared once drained or every subsequent cold
    // start would replay the same navigation.
    try {
      const response = Notifications.getLastNotificationResponse();
      if (response) {
        routeResponse(response);
        Notifications.clearLastNotificationResponse();
      }
    } catch {
      // no stored response, or the native module is unavailable
    }

    // Foreground: notification received while app is open
    const notifSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data as
          | PushNotificationData
          | undefined;
        if (data) {
          lastDataRef.current = data;
        }
      },
    );

    // Background/killed: user tapped the notification
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        routeResponse(response);
      },
    );

    return () => {
      notifSub.remove();
      responseSub.remove();
    };
  }, [navigateTo]);

  return { lastDataRef };
}

/**
 * Register the device for push notifications and store the token server-side.
 */
export async function registerPushToken(
  instanceUrl: string,
  accessToken: string,
): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Store locally
    await saveNotificationToken(token);

    // Store server-side
    try {
      await fetch(`${instanceUrl}/api/notifications/register-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(accessToken),
        },
        body: JSON.stringify({ token }),
      });
    } catch {
      // token is still returned even if server-side registration fails
    }

    return token;
  } catch {
    return null;
  }
}
