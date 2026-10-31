"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Client boundary that code-splits `NotificationSettings`.
 *
 * The settings page is a server component, where `next/dynamic` with
 * `ssr: false` is not allowed, so the split has to live on this side of the
 * boundary. The panel is ~1400 lines and sits well below the fold, so keeping
 * it out of the initial payload is worth the extra hop.
 */
const NotificationSettings = dynamic(
    () =>
        import("@/components/notification-settings").then((mod) => ({
            default: mod.NotificationSettings,
        })),
    {
        ssr: false,
        loading: () => (
            <div className="space-y-4" data-testid="notification-settings-loading">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        ),
    },
);

export function NotificationSettingsLazy() {
    return <NotificationSettings />;
}