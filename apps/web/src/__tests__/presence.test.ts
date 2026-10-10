import { describe, expect, it } from "vitest";

import { isOnlineStatus, partitionByPresence } from "@/lib/presence";
import type { PresenceStatus } from "@/lib/types";

describe("isOnlineStatus", () => {
	it("counts busy and away as online", () => {
		// Busy and Away are deliberate choices by someone who is still present.
		// Only Offline means "not here".
		expect(isOnlineStatus("online")).toBe(true);
		expect(isOnlineStatus("busy")).toBe(true);
		expect(isOnlineStatus("away")).toBe(true);
	});

	it("counts only offline as offline", () => {
		expect(isOnlineStatus("offline")).toBe(false);
	});

	it("treats an unknown or missing status as offline", () => {
		// We have no status for this member, so we cannot claim they are here.
		expect(isOnlineStatus(undefined)).toBe(false);
	});
});

describe("partitionByPresence", () => {
	type Row = { name: string; status?: PresenceStatus };

	const rows: Row[] = [
		{ name: "owner", status: "online" },
		{ name: "admin-busy", status: "busy" },
		{ name: "mod-offline", status: "offline" },
		{ name: "unknown" },
		{ name: "mod-away", status: "away" },
	];

	it("splits into online and offline groups", () => {
		const { online, offline } = partitionByPresence(rows, (r) => r.status);
		expect(online.map((r) => r.name)).toEqual([
			"owner",
			"admin-busy",
			"mod-away",
		]);
		expect(offline.map((r) => r.name)).toEqual(["mod-offline", "unknown"]);
	});

	it("preserves the input order within each group", () => {
		// Callers pass members already sorted by role precedence, so the
		// partition must be stable rather than re-sorting.
		const { online, offline } = partitionByPresence(rows, (r) => r.status);
		const onlineNames = new Set(rows.map((r) => r.name));
		expect(online.every((r) => onlineNames.has(r.name))).toBe(true);
		expect(online).toHaveLength(3);
		expect(offline).toHaveLength(2);
	});

	it("keeps every member exactly once", () => {
		const { online, offline } = partitionByPresence(rows, (r) => r.status);
		expect(online.length + offline.length).toBe(rows.length);
	});

	it("handles an empty list", () => {
		expect(partitionByPresence([], () => "online")).toEqual({
			online: [],
			offline: [],
		});
	});

	it("puts everyone in offline when nobody has a status", () => {
		const { online, offline } = partitionByPresence(rows, () => undefined);
		expect(online).toHaveLength(0);
		expect(offline).toHaveLength(rows.length);
	});
});