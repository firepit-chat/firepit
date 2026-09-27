import { firepitRequest } from "@/lib/firepit/http";

export type UserPreferences = {
  showDocsInNavigation?: boolean;
  showFriendsInNavigation?: boolean;
  showSettingsInNavigation?: boolean;
  showAddFriendInHeader?: boolean;
  telemetryEnabled?: boolean;
  skipNsfwWarning?: boolean;
  navigationItemOrder?: string[];
};

export async function fetchPreferences(
  baseUrl: string,
  token: string,
): Promise<UserPreferences> {
  return firepitRequest<UserPreferences>({
    baseUrl,
    path: "/api/me/preferences",
    token,
  });
}

export async function updatePreferences(
  baseUrl: string,
  token: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  return firepitRequest<UserPreferences>({
    baseUrl,
    path: "/api/me/preferences",
    method: "PATCH",
    token,
    body: patch,
  });
}