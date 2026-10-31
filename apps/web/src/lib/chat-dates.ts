/**
 * Calendar-day helpers for message lists.
 *
 * Day comparisons go through a UTC ordinal of the local Y/M/D rather than
 * dividing elapsed milliseconds by 86_400_000, so a daylight-saving boundary
 * cannot shift a message into the wrong day.
 */

const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
});

function toMillis(
    value: string | number | Date | null | undefined,
): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    const ms =
        value instanceof Date
            ? value.getTime()
            : typeof value === "number"
              ? value
              : Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
}

/** Whole calendar days between the value's day and `now`'s day. */
export function calendarDaysAgo(
    value: string | number | Date,
    now: number = Date.now(),
): number | null {
    const ms = toMillis(value);
    if (ms === null) {
        return null;
    }
    const valueDate = new Date(ms);
    const nowDate = new Date(now);
    const ordinal = (d: Date) =>
        Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((ordinal(nowDate) - ordinal(valueDate)) / 86_400_000);
}

/**
 * A list row's timestamp: the clock time today, "Yesterday" for the day before,
 * and the date for anything older.
 */
export function formatListTimestamp(
    value: string | Date,
    now: number = Date.now(),
): string {
    const ms = toMillis(value);
    if (ms === null) {
        return "";
    }

    const daysAgo = calendarDaysAgo(ms, now);
    if (daysAgo === 0) {
        return timeFormatter.format(ms);
    }
    if (daysAgo === 1) {
        return "Yesterday";
    }
    return dateFormatter.format(ms);
}

/**
 * A date divider's label. Same rule as a list row, plus "Today" so the first
 * divider in a conversation reads as today rather than a bare date.
 */
export function formatDayDividerLabel(
    value: string | Date,
    now: number = Date.now(),
): string {
    const ms = toMillis(value);
    if (ms === null) {
        return "";
    }

    const daysAgo = calendarDaysAgo(ms, now);
    if (daysAgo === 0) {
        return "Today";
    }
    if (daysAgo === 1) {
        return "Yesterday";
    }
    return dateFormatter.format(ms);
}

/** The local calendar day a timestamp falls on, for grouping comparisons. */
export function localDayKey(value: string | number | Date): string {
    const ms = toMillis(value);
    if (ms === null) {
        return "";
    }
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
