import assert from "node:assert/strict";

import { applyMuteResult, mutedIdsFromOverrides } from "./mutes";

const NOW = Date.parse("2026-03-01T12:00:00.000Z");

// Entry present with no mutedUntil means muted forever.
assert.deepEqual(
    [...mutedIdsFromOverrides({ a: { level: "nothing" } }, NOW)],
    ["a"],
);

// A future timestamp is still muted.
assert.deepEqual(
    [
        ...mutedIdsFromOverrides(
            { b: { mutedUntil: "2026-03-01T12:30:00.000Z" } },
            NOW,
        ),
    ],
    ["b"],
);

// An elapsed timestamp has expired and must not linger.
assert.deepEqual(
    [
        ...mutedIdsFromOverrides(
            { c: { mutedUntil: "2026-02-28T12:00:00.000Z" } },
            NOW,
        ),
    ],
    [],
);

// Exactly at the boundary is expired, matching isMuteExpired's <= comparison.
assert.deepEqual(
    [
        ...mutedIdsFromOverrides(
            { d: { mutedUntil: "2026-03-01T12:00:00.000Z" } },
            NOW,
        ),
    ],
    [],
);

// An unparseable timestamp counts as expired rather than sticking forever.
assert.deepEqual(
    [...mutedIdsFromOverrides({ e: { mutedUntil: "not-a-date" } }, NOW)],
    [],
);

// Muting only overrides what came back.
assert.deepEqual(
    [
        ...mutedIdsFromOverrides(
            {
                f: { level: "nothing" },
                g: { mutedUntil: "2026-02-01T00:00:00.000Z" },
            },
            NOW,
        ),
    ],
    ["f"],
);

// Missing, null and malformed maps must not throw — a settings payload from an
// older instance may simply not have these keys.
assert.equal(mutedIdsFromOverrides(undefined, NOW).size, 0);
assert.equal(mutedIdsFromOverrides(null as never, NOW).size, 0);
assert.equal(
    mutedIdsFromOverrides({ h: undefined, i: null } as never, NOW).size,
    0,
);

// Toggling applies the server's answer rather than assuming the inverse.
assert.deepEqual([...applyMuteResult(new Set(["x"]), "y", true)], ["x", "y"]);
assert.deepEqual([...applyMuteResult(new Set(["x", "y"]), "x", false)], ["y"]);

console.log("mutes: all assertions passed");
