/**
 * Presence rules for member lists.
 *
 * Kept free of react-native imports so it can be exercised directly.
 */

/**
 * Busy and Away are deliberate choices by someone who is still present, so only
 * Offline counts as offline. Mirrors `src/lib/presence.ts` on the web.
 *
 * Accepts the aliases the profile screen has historically displayed
 * (`idle`, `dnd`, `donotdisturb`) so those read the same way here.
 */
export function isOnlineStatus(status?: string): boolean {
  const normalized = status?.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (!normalized) return false;
  return (
    normalized === "online" ||
    normalized === "busy" ||
    normalized === "away" ||
    normalized === "idle" ||
    normalized === "dnd" ||
    normalized === "donotdisturb"
  );
}

/**
 * Splits members into online and offline groups, preserving the input order
 * within each group.
 *
 * Callers pass members already sorted by role precedence, so partitioning in
 * place keeps that order instead of re-sorting.
 */
export function partitionByPresence<T>(
  members: readonly T[],
  getStatus: (member: T) => string | undefined,
): { online: T[]; offline: T[] } {
  const online: T[] = [];
  const offline: T[] = [];

  for (const member of members) {
    if (isOnlineStatus(getStatus(member))) {
      online.push(member);
    } else {
      offline.push(member);
    }
  }

  return { online, offline };
}