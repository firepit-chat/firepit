import {
  buildPollCommand,
  getMentionAtCursor,
  parseMentions,
} from "@/lib/mention-utils";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

if (import.meta.main) {
  // --- getMentionAtCursor: an "@" inside a word must not open the autocomplete ---
  // Regression: typing an email address used to pop the member list open, and
  // applying a suggestion then wiped everything from the "@" onwards.
  assert(
    getMentionAtCursor("user@example.com", 17) === null,
    "email address should not trigger mention autocomplete",
  );
  assert(
    getMentionAtCursor("ping me@home", 11) === null,
    "@ preceded by a word character should not trigger autocomplete",
  );
  assert(
    getMentionAtCursor("a@@b", 3) === null,
    "double @@ should not trigger autocomplete",
  );

  // --- getMentionAtCursor: genuine mentions still resolve ---
  const atStart = getMentionAtCursor("@ali", 4);
  assert(atStart !== null, "@ at start of input should trigger autocomplete");
  assert(atStart?.username === "ali", "username should be parsed as 'ali'");
  assert(atStart?.startIndex === 0, "startIndex should be 0");
  assert(atStart?.endIndex === 4, "endIndex should extend to end of input");

  const afterSpace = getMentionAtCursor("hey @bo", 7);
  assert(
    afterSpace?.username === "bo",
    "@ after a space should trigger autocomplete",
  );

  // --- parseMentions stays consistent with the cursor parser ---
  assert(
    parseMentions("mail user@example.com").length === 0,
    "parseMentions should ignore email addresses",
  );
  assert(
    parseMentions("hi @alice and @bob_1").length === 2,
    "parseMentions should find both mentions",
  );

  // --- buildPollCommand mirrors the server-side poll limits ---
  assert(
    buildPollCommand("Best?", ["only"]).ok === false,
    "a single-option poll must be rejected",
  );
  assert(
    buildPollCommand(
      "Best?",
      Array.from({ length: 11 }, (_, i) => `opt${i}`),
    ).ok === false,
    "an 11-option poll must be rejected",
  );
  assert(
    buildPollCommand("q".repeat(301), ["a", "b"]).ok === false,
    "an over-long question must be rejected",
  );
  assert(
    buildPollCommand("Best?", ["a".repeat(121), "b"]).ok === false,
    "an over-long option must be rejected",
  );
  assert(
    buildPollCommand("Best?", ["same", "same"]).ok === false,
    "duplicate options must be rejected",
  );

  const valid = buildPollCommand("Best?", ["red", "blue"]);
  assert(valid.ok, "a well-formed poll must be accepted");
  assert(
    valid.ok && valid.command === '/poll "Best?" | "red" | "blue"',
    `unexpected command shape: ${valid.ok ? valid.command : valid.error}`,
  );

  console.log("mention-utils.test.ts: all assertions passed");
}