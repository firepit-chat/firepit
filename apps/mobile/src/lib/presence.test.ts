import { isOnlineStatus, partitionByPresence } from "@/lib/presence";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

type Row = { name: string; status?: string };

if (import.meta.main) {
  // --- Busy and Away are online; only Offline is offline ---
  assert(isOnlineStatus("online"), "online counts as online");
  assert(isOnlineStatus("busy"), "busy counts as online");
  assert(isOnlineStatus("away"), "away counts as online");
  assert(!isOnlineStatus("offline"), "offline does not count as online");
  assert(!isOnlineStatus(undefined), "an unknown status is not online");

  // --- the aliases the profile screen has always displayed ---
  assert(isOnlineStatus("idle"), "idle is an alias for away");
  assert(isOnlineStatus("Do Not Disturb"), "dnd is an alias for busy");
  assert(isOnlineStatus("donotdisturb"), "donotdisturb is an alias for busy");
  assert(!isOnlineStatus(""), "an empty status is not online");

  const rows: Row[] = [
    { name: "owner", status: "online" },
    { name: "admin-busy", status: "busy" },
    { name: "mod-offline", status: "offline" },
    { name: "unknown" },
    { name: "mod-away", status: "away" },
  ];

  // --- grouping ---
  const { online, offline } = partitionByPresence(rows, (r) => r.status);
  assert(
    online.map((r) => r.name).join(",") === "owner,admin-busy,mod-away",
    `unexpected online group: ${online.map((r) => r.name).join(",")}`,
  );
  assert(
    offline.map((r) => r.name).join(",") === "mod-offline,unknown",
    `unexpected offline group: ${offline.map((r) => r.name).join(",")}`,
  );

  // --- order within each group must survive, since callers pass members
  // already sorted by role precedence ---
  assert(
    online.map((r) => r.name).join(",") === rows
      .filter((r) => isOnlineStatus(r.status))
      .map((r) => r.name)
      .join(","),
    "partitioning must preserve relative order",
  );
  assert(
    online.length + offline.length === rows.length,
    "every member must land in exactly one group",
  );

  // --- edge cases ---
  const empty = partitionByPresence<Row>([], () => "online");
  assert(
    empty.online.length === 0 && empty.offline.length === 0,
    "an empty list produces two empty groups",
  );

  const none = partitionByPresence(rows, () => undefined);
  assert(
    none.online.length === 0 && none.offline.length === rows.length,
    "with no statuses everyone is offline",
  );

  console.log("presence.test.ts: all assertions passed");
}