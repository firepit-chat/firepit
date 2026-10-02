# @firepit/markdown-spoiler

Accessible, dependency-light click-to-reveal spoiler blocks for Markdown, for
React and React Native.

Wraps a region of Markdown in a spoiler:

```md
the butler [spoiler]did it[/spoiler]
```

While collapsed, the spoiler renders a single labelled button. Activating it
reveals the content; activating again hides it.

## Why not blur?

Most spoiler implementations hide content with `filter: blur()` or an animated
reveal. That approach has real costs:

- **Blurred text is still text.** Screen readers read it, links stay in the tab
  order, and `Ctrl+F` finds it.
- **`filter: blur()` is a composited effect** over arbitrary content, which gets
  expensive when a long transcript is on screen.
- **Animated reveal effects** need CSS Houdini or the CSS Painting API, neither of
  which is at 90%+ global support.

This package renders the collapsed body as **nothing at all**. The content is not
in the DOM until it is revealed, so it cannot be read, tabbed to, or found by a
screen reader, and a collapsed spoiler costs one button rather than a blur pass.
The trade-off is a small layout shift on reveal.

## Install

```sh
npm install @firepit-chat/markdown-spoiler
```

## Usage

### React

Register the plugin and map the node to the component. You need `react-markdown`
(and `remark-gfm` if you want GitHub-flavoured Markdown) installed in your app.

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    SPOILER_TAG_NAME,
    Spoiler,
    containsSpoilerSyntax,
    remarkSpoiler,
} from "@firepit/markdown-spoiler";

const components = {
    [SPOILER_TAG_NAME]: ({ children }) => <Spoiler>{children}</Spoiler>,
};

export function Message({ text }) {
    const plugins = containsSpoilerSyntax(text)
        ? [remarkGfm, remarkSpoiler]
        : [remarkGfm];

    return (
        <ReactMarkdown remarkPlugins={plugins} components={components} skipHtml>
            {text}
        </ReactMarkdown>
    );
}
```

The package ships no CSS and hard-codes no colours, so it inherits whatever theme
your app already has. Pass `classNames` to hook into your own design tokens:

```tsx
<Spoiler
    classNames={{
        root: "my-spoiler",
        trigger: "rounded border px-2 py-1 text-sm",
        content: "mt-2",
    }}
>
    {children}
</Spoiler>
```

### React Native

Use the `./react-native` entry point. It needs `react-native` installed in your app.

```tsx
import { Pressable, Text } from "react-native";
import { Spoiler } from "@firepit/markdown-spoiler/react-native";

<Spoiler theme={theme} placeholder="Tap to reveal">
    <Text>{body}</Text>
</Spoiler>;
```

`theme` is a small structural type, so your existing theme object can be passed
straight in. It only needs `text`, `backgroundElement`, `border`, `primary` and
`accentForeground`.

The component sets `accessibilityRole="button"` and
`accessibilityState={{ expanded }}`, so VoiceOver and TalkBack announce it
correctly without extra wiring.

## Behaviour

| Input                                         | Result                             |
| --------------------------------------------- | ---------------------------------- |
| `[spoiler]a[/spoiler]`                        | A spoiler containing `a`           |
| `a [spoiler]b[/spoiler] c`                    | Text, spoiler, text                |
| `[spoiler]a[/spoiler][spoiler]b[/spoiler]`    | Two adjacent spoilers              |
| `[spoiler]a [spoiler]b[/spoiler] c[/spoiler]` | Genuine nesting                    |
| `[spoiler][/spoiler]`                         | An empty spoiler                   |
| `[spoiler]unclosed`                           | Literal text, delimiters preserved |
| `stray[/spoiler]`                             | Literal text                       |

Markdown inside a spoiler still works: `[spoiler]**bold**[/spoiler]` and
`[spoiler][label](https://example.com)[/spoiler]` both render fully.

Two deliberate limitations, both a consequence of matching within a single
Markdown container:

- A spoiler cannot span block-level containers, so
  `[spoiler]\n\npara\n\n[/spoiler]` shows the delimiters literally.
- Delimiters inside code spans and fenced blocks are left alone.

Malformed input is never destructive: nothing is silently dropped, and the
user sees the syntax they typed.

## Other exports

- `stripSpoilerSyntax(text)` — removes the delimiters but keeps the revealed
  body. Intended for surfaces that should not show raw syntax, such as search
  indexing, notification bodies and reply previews. Note this does not redact
  the body; a spoiler guards against glance-reading, not against someone who
  deliberately searches for the text.
- `hasSpoilerSyntax(text)`, `splitBySpoilers(text)`,
  `tokenizeSpoilerDelimiters(text)` — the shared grammar, exported so a consumer
  implementing a renderer for a third Markdown stack does not re-implement it.

## License

GPL-3.0-or-later.
