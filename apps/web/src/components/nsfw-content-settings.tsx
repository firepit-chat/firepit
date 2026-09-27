"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";

import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

export function NsfwContentSettings() {
    const [isMounted, setIsMounted] = useState(false);
    const { userData } = useAuth();
    const userId = userData?.userId ?? null;
    const {
        isLoaded,
        isSaving,
        navigationPreferences,
        updateNavigationPreferences,
    } = useDeveloperMode(userId);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    const isDisabled = !isLoaded || !userId || isSaving;

    return (
        <div className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-primary" />
                        <Label
                            className="text-base font-semibold text-foreground"
                            htmlFor="skip-nsfw-warning"
                        >
                            Show 18+ channels without a warning
                        </Label>
                    </div>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        When disabled, opening an 18+ channel asks you to confirm
                        before showing its messages. Turn this on to skip that
                        confirmation and enter age-restricted channels directly.
                    </p>
                </div>

                <Switch
                    checked={navigationPreferences.skipNsfwWarning}
                    disabled={isDisabled}
                    id="skip-nsfw-warning"
                    onCheckedChange={(checked) =>
                        updateNavigationPreferences({
                            skipNsfwWarning: checked,
                        })
                    }
                />
            </div>
    );
}