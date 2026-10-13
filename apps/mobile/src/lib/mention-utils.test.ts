import {
  buildPollCommand,
  findMentionSpans,
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

  // --- findMentionSpans: display-name matching ---
{
  const apostrophe = "@August's test account again";
  const spans = findMentionSpans(apostrophe, ["August's test account"]);
  assert(spans.length === 1, "one mention span");
  assert(
    spans[0].fullMatch === "@August's test account",
    "span covers the whole display name, apostrophe included",
  );
  assert(
    apostrophe.substring(spans[0].startIndex, spans[0].endIndex) ===
      "@August's test account",
    "slice matches the highlight",
  );

  // Longest name first, so "avery <3" is not shadowed by "avery".
  const longest = findMentionSpans("hey @avery <3", ["avery", "avery <3"]);
  assert(longest[0].fullMatch === "@avery <3", "longest name wins");

  // The regex fallback still catches mentions we have no name for.
  assert(
    findMentionSpans("hi @someone", []).length === 1,
    "regex fallback covers unknown mentions",
  );
  // ...and does not double-highlight one already matched by name.
  const single = findMentionSpans("@alex hello", ["alex"]);
  assert(single.length === 1, "no duplicate span for a named mention");

  assert(findMentionSpans("nothing here", ["alex"]).length === 0, "no false positive");
  assert(findMentionSpans("a@b.example", ["x"]).length === 0, "email is not a mention");
}

// A short name that is a prefix of a longer one must not steal the span:
// "August" vs "August's test account".
{
  const overlapText = "@August's test account";
  const overlap = findMentionSpans(overlapText, ["August"], [
    "August's test account",
  ]);
  assert(overlap.length === 1, "one span despite overlapping names");
  assert(
    overlap[0].fullMatch === "@August's test account",
    "longer display name wins over the prefix",
  );
  assert(
    overlap[0].username === "August's test account",
    "resolves to the intended account",
  );

  // The send path must notify the intended account, not the prefix match.
  const payload = [
    ...new Set(
      findMentionSpans(overlapText, [], [
        "August",
        "August's test account",
      ]).map((m) => m.username),
    ),
  ];
  assert(
    payload.length === 1 && payload[0] === "August's test account",
    "mention payload targets the intended account",
  );
}

console.log("mention-utils.test.ts: all assertions passed");
}