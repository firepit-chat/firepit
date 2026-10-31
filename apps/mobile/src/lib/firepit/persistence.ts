import type { BootstrapSnapshot } from "@/lib/firepit/types";
import {
    deleteSecureItem,
    deleteJsonValue,
    getJsonValue,
    getSecureItem,
    setJsonValue,
    setSecureItem,
} from "@/lib/storage/secure-store";

const keys = {
    instanceUrl: "firepit.instance-url",
    bootstrapSnapshot: "firepit.bootstrap-snapshot",
    bearerToken: "firepit.bearer-token",
    appwriteConfig: "firepit.appwrite-config",
    notificationToken: "firepit.notification-token",
    notificationPreferences: "firepit.notification-preferences",
} as const;

export async function loadStoredInstanceUrl() {
    return getJsonValue<string>(keys.instanceUrl);
}

export async function saveStoredInstanceUrl(instanceUrl: string) {
    await setJsonValue(keys.instanceUrl, instanceUrl);
}

export async function clearStoredInstanceUrl() {
    await deleteJsonValue(keys.instanceUrl);
}

export async function loadBootstrapSnapshot() {
    return getJsonValue<BootstrapSnapshot>(keys.bootstrapSnapshot);
}

export async function saveBootstrapSnapshot(snapshot: BootstrapSnapshot) {
    await setJsonValue(keys.bootstrapSnapshot, snapshot);
}

export async function clearBootstrapSnapshot() {
    await deleteJsonValue(keys.bootstrapSnapshot);
}

export async function loadStoredAppwriteConfig() {
    return getJsonValue<{ endpoint: string; project: string }>(
        keys.appwriteConfig,
    );
}

export async function saveStoredAppwriteConfig(config: {
    endpoint: string;
    project: string;
}) {
    await setJsonValue(keys.appwriteConfig, config);
}

export async function clearStoredAppwriteConfig() {
    await deleteJsonValue(keys.appwriteConfig);
}

export async function loadBearerToken() {
    const token = await getSecureItem(keys.bearerToken);
    return token;
}

export async function saveBearerToken(token: string) {
    await setSecureItem(keys.bearerToken, token);
}

export async function clearBearerToken() {
    await deleteSecureItem(keys.bearerToken);
}

export async function clearFirepitPersistence() {
    await Promise.all([
        clearBearerToken(),
        deleteSecureItem(keys.notificationToken),
    ]);
    // SecureStore cannot be enumerated on native, so clearJsonStorage can only
    // delete keys it happens to have in this process's memory cache — which is
    // empty after a restart. Name every JSON key explicitly, or "disconnect this
    // instance" leaves the instance URL, Appwrite config and the bootstrap
    // snapshot (which embeds the current user) on disk and the app silently
    // reconnects to the instance the user just left.
    await Promise.all([
        clearStoredInstanceUrl(),
        clearBootstrapSnapshot(),
        clearStoredAppwriteConfig(),
    ]);
}

// Notification helpers

export type NotificationPreferences = {
    enabled: boolean;
    dmNotifications: boolean;
    mentionNotifications: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string; // HH:mm format
    quietHoursEnd: string;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
    enabled: true,
    dmNotifications: true,
    mentionNotifications: true,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
};

export async function saveNotificationToken(token: string) {
    await setSecureItem(keys.notificationToken, token);
}

export async function loadNotificationPreferences() {
    return getJsonValue<NotificationPreferences>(keys.notificationPreferences);
}

export async function saveNotificationPreferences(
    prefs: NotificationPreferences,
) {
    await setJsonValue(keys.notificationPreferences, prefs);
}
