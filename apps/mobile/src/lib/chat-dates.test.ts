import { calendarDaysAgo, formatDayDividerLabel, localDayKey } from "@/lib/chat-dates";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

if (import.meta.main) {
  // Fixed clock so "Today"/"Yesterday" cannot drift with the wall clock.
  const now = new Date(2026, 2, 15, 12, 0, 0).getTime();
  const today = new Date(2026, 2, 15, 9, 30, 0).getTime();
  const yesterday = new Date(2026, 2, 14, 23, 59, 0).getTime();
  const older = new Date(2026, 2, 10, 8, 0, 0).getTime();

  assert(formatDayDividerLabel(today, now) === "Today", "today");
  assert(formatDayDividerLabel(yesterday, now) === "Yesterday", "yesterday");
  assert(
    formatDayDividerLabel(older, now) === new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "numeric",
      year: "2-digit",
    }).format(older),
    "older falls back to the short date",
  );

  // Grouping key: same instant, two spellings, one day.
  assert(localDayKey(today) === "2026-3-15", "day key");
  assert(
    localDayKey(new Date(2026, 2, 15, 0, 0, 1).getTime()) ===
      localDayKey(new Date(2026, 2, 15, 23, 59, 59).getTime()),
    "midnight to end of day is one group",
  );
  assert(
    localDayKey(new Date(2026, 2, 15, 23, 59, 59).getTime()) !==
      localDayKey(new Date(2026, 2, 16, 0, 0, 1).getTime()),
    "day boundary splits groups",
  );
  assert(localDayKey("not a date") === "", "unparseable input");
  assert(localDayKey("") === "", "empty input");

  // A 23-hour DST day must still count as one calendar day, which is why the
  // web compares a UTC ordinal of the local Y/M/D instead of dividing by 86.4e6.
  const springForward = new Date(2026, 2, 8, 12, 0, 0);
  const nextDay = new Date(2026, 2, 9, 12, 0, 0);
  assert(
    calendarDaysAgo(springForward, nextDay.getTime()) === 1,
    "adjacent calendar days are one day apart regardless of DST",
  );

  assert(calendarDaysAgo("nope", now) === null, "unparseable value");
  assert(formatDayDividerLabel("nope", now) === "", "unparseable divider label");

  console.log("chat-dates.test.ts: all assertions passed");
}
