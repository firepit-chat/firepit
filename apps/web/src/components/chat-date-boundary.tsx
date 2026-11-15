"use client";

import { formatDayDividerLabel } from "@/lib/chat-dates";

/**
 * Divider shown above the first message of a calendar day, so timestamps can be
 * grouped by day instead of repeating a full date on every message.
 */
export function ChatDateBoundary({ date }: { date: string }) {
    const label = formatDayDividerLabel(date);
    if (!label) {
        return null;
    }

    return (
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {label}
            <span className="h-px flex-1 bg-border" />
        </div>
    );
}
