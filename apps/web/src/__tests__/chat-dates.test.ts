import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    calendarDaysAgo,
    formatDayDividerLabel,
    formatListTimestamp,
    localDayKey,
} from "@/lib/chat-dates";

/** Fixed local noon so DST shifts cannot move a test across a day boundary. */
const NOW = new Date(2026, 2, 10, 12, 0, 0).getTime();

const at = (day: number, month = 2, hour = 9, minute = 5) =>
    new Date(2026, month, day, hour, minute, 0).toISOString();

describe("chat-dates", () => {
    describe("calendarDaysAgo", () => {
        it("counts whole calendar days, not 24-hour chunks", () => {
            expect(calendarDaysAgo(at(10, 2, 23), NOW)).toBe(0);
            expect(calendarDaysAgo(at(9, 2, 1), NOW)).toBe(1);
            expect(calendarDaysAgo(at(8, 2, 23), NOW)).toBe(2);
        });

        it("returns null for unparseable input", () => {
            expect(calendarDaysAgo("not a date", NOW)).toBeNull();
            expect(
                calendarDaysAgo(undefined as unknown as string, NOW),
            ).toBeNull();
        });
    });

    describe("formatListTimestamp", () => {
        it("shows the clock time for today", () => {
            const label = formatListTimestamp(at(10, 2, 15, 30), NOW);
            expect(label).not.toBe("Yesterday");
            expect(label).toMatch(/\d/);
        });

        // The rule the user asked for: yesterday by name, anything older by date,
        // and never a stale "Yesterday" once the day rolls over.
        it("shows Yesterday only for the day before", () => {
            expect(formatListTimestamp(at(9, 2, 15, 30), NOW)).toBe(
                "Yesterday",
            );
            expect(formatListTimestamp(at(8, 2, 15, 30), NOW)).not.toBe(
                "Yesterday",
            );
        });

        it("falls back to a numeric date beyond yesterday", () => {
            expect(formatListTimestamp(at(4, 1, 15, 30), NOW)).toBe("2/4/26");
        });

        it("shows a date for a clock skewed into the future", () => {
            expect(formatListTimestamp(at(12, 2, 15, 30), NOW)).toBe("3/12/26");
        });

        it("returns an empty string for unparseable input", () => {
            expect(formatListTimestamp("nope", NOW)).toBe("");
        });
    });

    describe("formatDayDividerLabel", () => {
        it("names today, yesterday, then the date", () => {
            expect(formatDayDividerLabel(at(10, 2, 15), NOW)).toBe("Today");
            expect(formatDayDividerLabel(at(9, 2, 15), NOW)).toBe("Yesterday");
            expect(formatDayDividerLabel(at(4, 1, 15), NOW)).toBe("2/4/26");
        });

        it("tracks the calendar as time passes", () => {
            // Same message, two days later: what was "Today" becomes a date.
            const message = at(10, 2, 9);
            expect(formatDayDividerLabel(message, NOW)).toBe("Today");
            expect(
                formatDayDividerLabel(
                    message,
                    new Date(2026, 2, 11, 12, 0, 0).getTime(),
                ),
            ).toBe("Yesterday");
            expect(
                formatDayDividerLabel(
                    message,
                    new Date(2026, 2, 12, 12, 0, 0).getTime(),
                ),
            ).toBe("3/10/26");
        });
    });

    describe("localDayKey", () => {
        it("groups by local calendar day, including across midnight", () => {
            expect(localDayKey(at(10, 2, 23, 59))).toBe(
                localDayKey(at(10, 2, 0, 1)),
            );
            expect(localDayKey(at(10, 2, 23, 59))).not.toBe(
                localDayKey(at(9, 2, 23, 59)),
            );
        });
    });
});

describe("DST safety", () => {
    beforeEach(() => {
        // 2026-03-08 is a US DST spring-forward. Local midnight jumps to 01:00.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 2, 8, 12, 0, 0).getTime());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("still counts the day before as exactly one day ago", () => {
        const yesterday = new Date(2026, 2, 7, 23, 0, 0).toISOString();
        expect(calendarDaysAgo(yesterday, Date.now())).toBe(1);
        expect(formatDayDividerLabel(yesterday, Date.now())).toBe("Yesterday");
    });
});
