/**
 * Calendar-day helpers for message lists.
 *
 * Ported from the web app's `lib/chat-dates.ts` so a date divider reads the
 * same on both clients.
 *
 * Day comparisons go through a UTC ordinal of the local Y/M/D rather than
 * dividing elapsed milliseconds by 86_400_000, so a daylight-saving boundary
 * cannot shift a message into the wrong day.
 */

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "numeric",
  year: "2-digit",
});

function toMillis(value: string | number | Date | null | undefined): number | null {
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
  const ordinal = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((ordinal(nowDate) - ordinal(valueDate)) / 86_400_000);
}

/**
 * A date divider's label. "Today" and "Yesterday" for the two most recent
 * days, the short date for anything older.
 */
export function formatDayDividerLabel(
  value: string | number | Date,
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

export type DayRow<T> =
  | { kind: "item"; id: string; item: T }
  | { kind: "divider"; id: string; label: string };

/**
 * Interleaves a day divider into a newest-first message list.
 *
 * Both message lists render through an `inverted` FlatList, so `items` is
 * newest-first and the next entry is the chronologically older one. The
 * divider belongs on the older side of the oldest message of each day — i.e.
 * emitted *after* that message in array order, which is *above* it on screen.
 * The final message is always the oldest, so it always closes its day.
 *
 * `getId` must be stable: these ids become FlatList keys.
 */
export function insertDayDividers<T extends { $createdAt?: string | null }>(
  items: readonly T[],
  getId: (item: T, index: number) => string,
): DayRow<T>[] {
  const rows: DayRow<T>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = getId(item, i);
    rows.push({ kind: "item", id, item });
    const older = items[i + 1];
    if (!older || localDayKey(item.$createdAt ?? "") !== localDayKey(older.$createdAt ?? "")) {
      const label = formatDayDividerLabel(item.$createdAt ?? "");
      if (label) {
        rows.push({ kind: "divider", id: `divider:${id}`, label });
      }
    }
  }
  return rows;
}
