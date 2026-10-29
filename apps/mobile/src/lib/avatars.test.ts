import { getInitials } from "@/lib/avatars";

const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
};

if (import.meta.main) {
    // The reported case: first two tokens, not first-and-last. First-and-last
    // yields "T(" from the parenthesised acronym.
    assert(
        getInitials("The Queer People Club (QPC)") === "TQ",
        "two leading tokens, not first+last",
    );

    // Parity with the web app's Avatar for the shapes that actually occur.
    assert(getInitials("John Doe") === "JD", "two words");
    assert(getInitials("John   Doe") === "JD", "extra whitespace collapses");
    assert(getInitials("john doe") === "JD", "case insensitive");
    assert(getInitials("Firepit") === "F", "one word is a single character");
    assert(getInitials("A B C D") === "AB", "only the first two tokens");
    assert(getInitials("  spaced  out  ") === "SO", "trims before splitting");
    assert(getInitials("QPC") === "Q", "acronym is one character");

    // Blank input is the documented placeholder, not an empty tile.
    assert(getInitials("") === "?", "empty string");
    assert(getInitials("   ") === "?", "whitespace only");
    assert(getInitials(null) === "?", "null");
    assert(getInitials(undefined) === "?", "undefined");

    // Single tokens contribute exactly one character. This is what makes passing
    // the *output* of this function back in lossy ("JD" -> "J"), which is why
    // every <Avatar> caller passes the raw name instead.
    assert(getInitials("Firepit") === "F", "long single word is one character");
    assert(
        getInitials("JD") === "J",
        "already-derived initials would truncate",
    );

    console.log("avatars.test.ts: all assertions passed");
}
