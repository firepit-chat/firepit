/**
 * Where the DM encryption preference lives, and how to read it safely.
 *
 * `dmEncryptionEnabled` used to live on `notification_settings`. It is now on
 * `profiles`, beside `dmEncryptionPublicKey` — the setting it is meaningless
 * without, and the same validation that gates publishing a key already gates
 * turning encryption on. Notification settings are the wrong layer for a
 * per-user capability.
 *
 * Two rules keep this move invisible to existing accounts:
 *
 *  - **Reads prefer the profile, then fall back** to `notification_settings`.
 *    Accounts that enabled encryption before the column existed have no
 *    `profiles.dmEncryptionEnabled`, so falling back is what stops their DMs
 *    silently downgrading to plaintext. `resolveDmEncryptionEnabled` is the
 *    single place that precedence is decided.
 *  - **Writes go to both**, with the profile canonical. Keeping
 *    `notification_settings` in sync means a rollback to the previous release
 *    does not lose the setting. The duplicated column is dropped in 2.6, once
 *    federation reads the profile directly.
 *
 * Callers that already hold a profile should pass it to
 * `resolveDmEncryptionEnabled` rather than calling `readDmEncryptionEnabled`,
 * so the DM send path — which loads the peer's profile anyway for
 * `dmEncryptionPublicKey` — does not add a query.
 */

import { getUserProfile } from "@/lib/appwrite-profiles";
import { getNotificationSettings } from "@/lib/notification-settings";
import { logger } from "@/lib/posthog-utils";

type DmEncryptionSource = {
    dmEncryptionEnabled?: boolean | null;
} | null;

/**
 * Single source of truth for precedence. A boolean on the profile wins,
 * including an explicit `false` — only an absent value falls back.
 */
export function resolveDmEncryptionEnabled(
    profile: DmEncryptionSource,
    settings: DmEncryptionSource,
): boolean {
    if (typeof profile?.dmEncryptionEnabled === "boolean") {
        return profile.dmEncryptionEnabled;
    }
    if (typeof settings?.dmEncryptionEnabled === "boolean") {
        return settings.dmEncryptionEnabled;
    }
    return false;
}

/**
 * Reads the preference for one user. `knownProfile` avoids a second profile
 * fetch when the caller already has one — the DM send path always does.
 */
export async function readDmEncryptionEnabled(
    userId: string,
    knownProfile?: DmEncryptionSource,
): Promise<boolean> {
    const profile =
        knownProfile !== undefined
            ? knownProfile
            : await getUserProfile(userId).catch((error) => {
                  logger.warn("Failed to load profile for DM encryption flag", {
                      error:
                          error instanceof Error ? error.message : String(error),
                      userId,
                  });
                  return null;
              });

    if (typeof profile?.dmEncryptionEnabled === "boolean") {
        return profile.dmEncryptionEnabled;
    }

    // Only pay for the settings read when the profile has no value, which is
    // the pre-migration case.
    const settings = await getNotificationSettings(userId).catch((error) => {
        logger.warn(
            "Failed to load notification settings for DM encryption fallback",
            {
                error: error instanceof Error ? error.message : String(error),
                userId,
            },
        );
        return null;
    });

    return resolveDmEncryptionEnabled(profile, settings);
}
