import { useCallback, useEffect, useState } from "react";
import {
    fetchPreferences,
    updatePreferences,
    type UserPreferences,
} from "@/lib/firepit/preferences";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

const PREFS_CACHE_TTL = 30_000;
const prefsCache = new Map<
    string,
    { data: UserPreferences; cachedAt: number }
>();

function prefsCacheKey(instanceUrl: string, accountId: string): string {
    return `${instanceUrl}|${accountId}`;
}

export function useUserPreferences() {
    const { instanceUrl, accessToken, currentUser } = useFirepitBootstrap();
    const accountId = currentUser?.$id ?? currentUser?.userId;
    const key =
        instanceUrl && accountId
            ? prefsCacheKey(instanceUrl, accountId)
            : null;
    const [preferences, setPreferences] = useState<UserPreferences>(
        () => prefsCache.get(key ?? "")?.data ?? {},
    );
    const [loading, setLoading] = useState(false);

    const refetch = useCallback(async () => {
        if (!instanceUrl || !accessToken || !accountId) {
            return;
        }
        const cacheKey = prefsCacheKey(instanceUrl, accountId);
        setLoading(true);
        try {
            const data = await fetchPreferences(instanceUrl, accessToken);
            prefsCache.set(cacheKey, { data, cachedAt: Date.now() });
            setPreferences(data);
        } catch {
            // Keep whatever we have (empty defaults are used by callers).
        } finally {
            setLoading(false);
        }
    }, [accessToken, accountId, instanceUrl]);

    useEffect(() => {
        if (!key) {
            return;
        }
        const cached = prefsCache.get(key);
        if (cached && Date.now() - cached.cachedAt < PREFS_CACHE_TTL) {
            setPreferences(cached.data);
            return;
        }
        void refetch();
    }, [key, refetch]);

    const update = useCallback(
        async (patch: Partial<UserPreferences>) => {
            if (!instanceUrl || !accessToken || !accountId) {
                return;
            }
            const data = await updatePreferences(instanceUrl, accessToken, patch);
            prefsCache.set(prefsCacheKey(instanceUrl, accountId), {
                data,
                cachedAt: Date.now(),
            });
            setPreferences(data);
        },
        [accessToken, accountId, instanceUrl],
    );

    return { preferences, loading, refetch, update };
}