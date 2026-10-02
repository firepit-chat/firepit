export interface MentionMatch {
  fullMatch: string;
  username: string;
  startIndex: number;
  endIndex: number;
}

export interface EmojiMatch {
  fullMatch: string;
  shortcode: string;
  startIndex: number;
  endIndex: number;
}

const MENTION_REGEX = /(?<![\w@])@([a-zA-Z0-9_]+)/g;

/** Kept in step with the server's poll parser limits. */
const MAX_POLL_OPTIONS = 10;
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_QUESTION_LENGTH = 300;
const MAX_POLL_OPTION_LENGTH = 120;

export function parseMentions(text: string): MentionMatch[] {
  const matches: MentionMatch[] = [];
  MENTION_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      username: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return matches;
}

export function getMentionAtCursor(
  text: string,
  cursorPosition: number,
): MentionMatch | null {
  const beforeCursor = text.slice(0, cursorPosition);
  const lastAtSymbol = beforeCursor.lastIndexOf("@");

  if (lastAtSymbol === -1) {
    return null;
  }

  // Match the lookbehind in MENTION_REGEX so an "@" that is part of a word
  // (an email address, for example) never opens the autocomplete.
  if (lastAtSymbol > 0 && /[\w@]/.test(text.at(lastAtSymbol - 1) ?? "")) {
    return null;
  }

  const textAfterAt = text.slice(lastAtSymbol + 1, cursorPosition);
  if (/\s/.test(textAfterAt)) {
    return null;
  }

  const textAfterCursor = text.slice(cursorPosition);
  const nextWhitespace = textAfterCursor.search(/\s/);
  const endIndex =
    nextWhitespace === -1 ? text.length : cursorPosition + nextWhitespace;

  const fullMatch = text.slice(lastAtSymbol, endIndex);
  const username = fullMatch.slice(1);

  return {
    fullMatch,
    username,
    startIndex: lastAtSymbol,
    endIndex,
  };
}

export function replaceMentionAtCursor(
  text: string,
  cursorPosition: number,
  newUsername: string,
): { newText: string; newCursorPosition: number } {
  const mention = getMentionAtCursor(text, cursorPosition);

  if (!mention) {
    return { newText: text, newCursorPosition: cursorPosition };
  }

  const before = text.slice(0, mention.startIndex);
  const after = text.slice(mention.endIndex);
  const newText = `${before}@${newUsername} ${after}`;
  const newCursorPosition = mention.startIndex + newUsername.length + 2;

  return { newText, newCursorPosition };
}

export function getEmojiAtCursor(
  text: string,
  cursorPosition: number,
): EmojiMatch | null {
  const beforeCursor = text.slice(0, cursorPosition);
  const lastColon = beforeCursor.lastIndexOf(":");

  if (lastColon === -1) {
    return null;
  }

  // Don't trigger if colon is preceded by another colon (already :emoji:)
  const beforeColon = text.slice(0, lastColon);
  const prevColon = beforeColon.lastIndexOf(":");
  if (prevColon !== -1 && !/\s/.test(text.slice(prevColon + 1, lastColon))) {
    return null;
  }

  // Only trigger if colon is at word boundary
  if (lastColon > 0 && !/\s/.test(text.at(lastColon - 1) ?? "")) {
    return null;
  }

  const textAfterColon = text.slice(lastColon + 1, cursorPosition);
  if (/\s/.test(textAfterColon)) {
    return null;
  }

  const textAfterCursor = text.slice(cursorPosition);
  const nextWhitespace = textAfterCursor.search(/[\s:]/);
  const endIndex =
    nextWhitespace === -1 ? text.length : cursorPosition + nextWhitespace;

  const fullMatch = text.slice(lastColon, endIndex);
  const shortcode = fullMatch.slice(1);

  return {
    fullMatch,
    shortcode,
    startIndex: lastColon,
    endIndex,
  };
}

export type PollCommandResult =
  | { ok: true; command: string; error: null }
  | { ok: false; command: null; error: string };

export function buildPollCommand(
  question: string,
  options: string[],
): PollCommandResult {
  if ([question, ...options].some((s) => /["|]/.test(s))) {
    return {
      ok: false,
      command: null,
      error:
        "Poll question and options cannot contain double quotes or pipe characters.",
    };
  }
  // Mirror the server's parser limits so an invalid poll is reported here
  // rather than coming back as a rejected message after it has been sent.
  if (!question || question.length > MAX_POLL_QUESTION_LENGTH) {
    return {
      ok: false,
      command: null,
      error: `Poll question must be between 1 and ${MAX_POLL_QUESTION_LENGTH} characters.`,
    };
  }
  if (options.length < MIN_POLL_OPTIONS || options.length > MAX_POLL_OPTIONS) {
    return {
      ok: false,
      command: null,
      error: `Poll must include between ${MIN_POLL_OPTIONS} and ${MAX_POLL_OPTIONS} options.`,
    };
  }
  if (new Set(options).size !== options.length) {
    return {
      ok: false,
      command: null,
      error: "Poll options must be unique.",
    };
  }
  if (options.some((o) => !o || o.length > MAX_POLL_OPTION_LENGTH)) {
    return {
      ok: false,
      command: null,
      error: `Each option must be between 1 and ${MAX_POLL_OPTION_LENGTH} characters.`,
    };
  }
  const quotedOptions = options.map((o) => `"${o}"`).join(" | ");
  return {
    ok: true,
    command: `/poll "${question}" | ${quotedOptions}`,
    error: null,
  };
}

export function replaceEmojiAtCursor(
  text: string,
  cursorPosition: number,
  emojiShortcode: string,
): { newText: string; newCursorPosition: number } {
  const emoji = getEmojiAtCursor(text, cursorPosition);

  if (!emoji) {
    return { newText: text, newCursorPosition: cursorPosition };
  }

  const before = text.slice(0, emoji.startIndex);
  const after = text.slice(emoji.endIndex);
  const newText = `${before}:${emojiShortcode}: ${after}`;
  const newCursorPosition = emoji.startIndex + emojiShortcode.length + 3;

  return { newText, newCursorPosition };
}
