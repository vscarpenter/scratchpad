# Paste as Markdown — design spec

Date: 2026-09-01
Status: approved

## Decision

When rich text lands in the note editor, convert it to Markdown before it
is inserted. The browser's own plain-text paste (`⌘/Ctrl+Shift+V`) stays the
way to paste the raw text, because it hands the page only `text/plain` and
the handler stands aside. Conversion is an in-house DOM walker over an inert
`DOMParser` document, sized to the Markdown subset Scratchpad renders; no
library is vendored. Insertion goes through `document.execCommand`
`insertText` so a paste records a native undo entry and fires the real
`input` event, with `setRangeText` as the fallback. This establishes the
paste listener that v4.0 image attachments later extend. Ships as v3.21.0.

## Goals

- Paste from a web page, Google Docs, Word, or an email and get headings,
  emphasis, links, lists, code, quotes, and tables as Markdown instead of a
  flattened wall of text.
- Never lose or mangle a paste: every stand-aside rule and every failure
  path leaves the browser's native paste in charge.
- Keep the editing contracts: dirty state, draft autosave, revisions, the
  wikilink suggester, find and replace, focus mode, and `⌘/Ctrl+Z`.
- Zero network: the converter never loads a resource, and the
  network-isolation contract stays as it is.
- Ship all logic in two strict-typed modules; app.js changes net to zero
  lines because it sits at its recorded ceiling.

## Paste contract

- The listener is bound to `#note-editor` only. The title field and the
  quick-capture field keep native paste.
- The handler stands aside, letting the native paste run untouched, when the
  clipboard carries files, when it has no `text/html` flavor, when the
  converter throws, or when the converted Markdown equals the `text/plain`
  flavor after collapsing whitespace. That last rule is what keeps code
  copied from an editor or a terminal byte-exact, since those sources put
  styled spans in `text/html` and the true text in `text/plain`.
- Otherwise the handler prevents the native paste and inserts the Markdown
  at the selection, replacing any selected text, with
  `document.execCommand('insertText', false, markdown)`. That fires the
  browser's own `input` event, so `markDirty` and the wikilink suggester run
  as they do for typing, and `⌘/Ctrl+Z` restores the previous text. If the
  call returns `false` or throws, the handler uses
  `setRangeText(markdown, start, end, 'end')` and dispatches a bubbling
  `input` event, matching the find-and-replace pattern.
- The converted Markdown is inserted exactly as produced: no leading or
  trailing newline is added for context. The caret ends after the inserted
  text.

## Conversion contract

`window.ScratchpadHtmlToMarkdown.convert(html)` returns a Markdown string.
The input is parsed with `DOMParser` into a document that has no browsing
context, so scripts never execute and images and stylesheets never load.

Blocks, separated from each other by one blank line:

- `h1`–`h6` become `#` through `######` followed by the inline content.
- `p`, and any container whose children are inline, become a paragraph.
  `br` inside a paragraph becomes a hard break (two spaces then a newline).
- `pre` becomes a fenced code block. The language comes from a `language-`
  or `lang-` class on the `pre` or its `code` child; the text is kept
  verbatim with no escaping. The fence grows to four backticks when the
  text contains a triple backtick.
- `ul` and `ol` become `- ` and `1. ` items. Ordered lists honor a `start`
  attribute and count up. Nested lists indent two spaces per level, the
  same convention the guide teaches. A list item that starts with a
  checkbox input becomes `- [ ]` or `- [x]`.
- `blockquote` prefixes every line of its converted content with `> `.
- `hr` becomes `---`.
- `table` becomes a GFM table. The first row is the header row, whether or
  not it uses `th`. Cells contain converted inline content with newlines
  turned into spaces and `|` escaped. A table with no rows produces
  nothing.
- `script`, `style`, `head`, `title`, `meta`, `link`, `noscript`,
  `template`, `svg`, `math`, `iframe`, `object`, `embed`, `video`, `audio`,
  `canvas`, `select`, `textarea`, `button`, and inputs other than a list
  item's checkbox produce nothing.
- Every other element is a transparent container: its children are
  converted in place.

Inline content:

- `strong` and `b` become `**text**`; `em` and `i` become `*text*`;
  `s`, `strike`, and `del` become `~~text~~`; `code` becomes backtick code,
  using a longer backtick run when the text itself contains backticks.
- Inline `style` attributes are honored the way word processors emit them:
  `font-weight` of `bold`, `bolder`, or a number of 600 or more means
  bold, `font-style: italic` means italic, and `text-decoration`
  containing `line-through` means strikethrough. A `b` or `strong` whose
  style sets `font-weight` to `normal` or a number under 600 is not bold;
  this is the Google Docs wrapper element.
- `a` with an `http:`, `https:`, or `mailto:` href becomes `[text](href)`.
  Any other href yields the text alone.
- `img` becomes its `alt` text, or nothing when the alt is empty. v4.0
  turns pasted images into attachments.
- Nested emphasis of the same kind does not double its markers.
- Text collapses runs of whitespace to one space, except inside `pre`.
  Whitespace at the start and end of a block is trimmed. Markdown-
  significant characters in text are backslash-escaped: `\`, `*`, `_`,
  `` ` ``, `[`, `]`, `<`, and, at the start of a line, `#`, `>`, `+`, `-`,
  and a digit run followed by `.`.

Output normalization collapses three or more consecutive newlines to two and
trims the result.

## Documentation and verification

- `guide.html`: the "Writing in Markdown" section gains a short paragraph
  on pasting from the web or a document and on `⌘/Ctrl+Shift+V` for the
  plain text; the shortcuts table gains that row. `README.md`'s Markdown
  feature bullet and shortcut table, and `tests/README.md`, gain the same.
- Automated coverage in `tests/paste-as-markdown.spec.js`:
  - Converter cases run as pure calls through `page.evaluate` on all three
    browsers: headings and paragraphs, hard breaks, emphasis including
    Google Docs and Word inline styles, links kept and dropped, images to
    alt text, inline and fenced code with a language, nested and ordered
    lists and task items, blockquotes, horizontal rules, tables with
    escaped pipes, dropped script and style, transparent containers, text
    escaping, and whitespace collapsing.
  - Handler cases dispatch a synthetic `ClipboardEvent` built from a
    `DataTransfer` on the editor: HTML is converted and inserted at the
    caret with the note marked dirty; a selection is replaced; plain-only
    clipboards, file clipboards, and equal-text clipboards are left to
    the native paste; a converter failure leaves the native paste in
    charge. Browsers that cannot construct the event skip those cases with
    a visible reason, following the drag-and-drop precedent.
  - Chromium-only end-to-end cases write real HTML and text to the
    clipboard and press `⌘/Ctrl+V`, then `⌘/Ctrl+Shift+V`, proving the
    conversion and the bypass through the browser's own paste pipeline;
    `⌘/Ctrl+Z` after a converted paste restores the previous text.
  - A pasted remote image and link cause zero requests, asserted the way
    `network-isolation.spec.js` counts them.
- The two modules join the service worker shell list and the jsconfig
  include; no inline script changes, so CSP hashes are unchanged.
  `SCRATCHPAD_VERSION` moves to 3.21.0 at release; deploy stays gated on
  an explicit yes.

## Out of scope

- Images as attachments, conversion on drop, the title and quick-capture
  fields, cleaning Word's `mso-list` bullet characters, preferring a
  Markdown flavor already present in `text/plain`, a settings toggle, and
  Markdown-to-HTML on copy.
