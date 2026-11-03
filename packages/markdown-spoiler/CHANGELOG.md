# Changelog

All notable changes to `@firepit-chat/markdown-spoiler` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning is manual, matching the rest of the repository: add an entry below and
bump `version` in `package.json` as part of the same change.

## [Unreleased]

## [0.1.0] - 2026-10-02

### ✨ Features

- **Click-to-reveal spoilers** for Markdown, via `[spoiler]...[/spoiler]`, on
  both React and React Native.
- **Collapsed spoilers are unmounted rather than blurred.** Hidden content is
  absent from the DOM, so screen readers cannot read ahead into it and hidden
  links are never in the tab order. No `filter: blur()`, CSS Houdini, or reveal
  animation.
- **`remarkSpoiler` remark plugin.** Spoiler regions are matched across sibling
  nodes, so formatting, links and images inside a spoiler render normally.
- **React Native `Spoiler`** with `accessibilityRole="button"` and
  `accessibilityState={{ expanded }}`, themed through a required `theme` prop.
- **`registerSpoilerRule`** installs a `markdown-it` inline rule that runs before
  `emphasis`, so Markdown formatting inside a spoiler is still tokenized rather
  than swallowed as literal text. Requires `markdown-it` in the consuming app.
- **`stripSpoilerSyntax`** for surfaces that should not show raw delimiters, such
  as search indexing, notification bodies and reply previews.
- **Malformed input is non-destructive.** An unmatched `[spoiler]` or
  `[/spoiler]` renders literally and no authored content is dropped.
- **Cross-platform parity tests.** The web and native adapters are asserted to
  agree on spoiler counts for every shared input, including malformed ones and
  delimiters inside code.
- **`truncateMarkdown` and `truncatePlainText`** for spoiler-safe truncation.
  Slicing a message for a preview can cut a spoiler open, which renders the
  hidden body as literal text. The first keeps complete spoilers intact for
  Markdown surfaces such as search results; the second drops delimiters for
  plain-text surfaces such as notifications and reply previews.
- **`inlineTrigger` on the web `Spoiler`.** Renders the reveal control as a
  focusable `<span role="button">` instead of a `<button>`, for use inside
  another button where nesting interactive elements would be invalid HTML.

### 📚 Documentation

- Documented the syntax, the accessibility rationale, the two block-level
  limitations, and the spoiler-and-search behaviour in the package README.

### 📚 Documentation
