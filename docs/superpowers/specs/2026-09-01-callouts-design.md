# Callouts — design spec

Date: 2026-09-01
Status: approved

## Decision

Support GitHub-style callouts: a blockquote whose first line is `[!NOTE]`,
`[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]`, optionally
followed by a custom title, renders as a labeled, tinted block instead of a
pull quote. Detection and rendering live in `public/js/markdown.js` as a
marked `walkTokens` hook plus a `blockquote` renderer override, following
the module's existing checkbox and wikilink overrides. Styling is
token-only CSS. The share viewer's body gains the blockquote, code, and
callout rules it never had. Ships as v3.23.0.

## Goals

- Give notes a calm way to mark asides, tips, and warnings that survives
  the sanitizer and the CSP unchanged.
- Warm the renderer-extension pattern that syntax highlighting reuses next.
- Close the share-viewer scope gap so a shared note looks like the note.

## Rendering contract

- The marker must be the very start of the blockquote's first paragraph:
  `> [!NOTE]` or `> [!NOTE] Custom title`, case-insensitive. Any other
  `[!...]` text, or a marker that is not at the start, stays literal inside
  an ordinary blockquote.
- The marker line is removed. The rest of the blockquote renders as usual,
  so lists, task checkboxes, emphasis, links, and nested quotes all work
  inside a callout.
- Output is `<blockquote class="callout callout-<kind>"><p class="callout-title">Title</p>…</blockquote>`
  where `<kind>` is the lower-cased marker and the title is the custom
  title or the capitalized kind. The title is escaped text.
- The pull-quote decorator never marks a callout.
- Callouts render identically in the app and in `share.html`, which reuses
  the same module.

## Visual contract

- A callout is a block with a 3.5px left bar and a tinted fill, normal
  (not italic) body text, and a small uppercase title. Kinds map to the
  existing families: note to accent, tip to success, important to info,
  warning to warning, caution to rust. Fills use the family's tint token,
  or a `color-mix` of the family color for info, which has no tint token.
- No new tokens, no hex values, no dark-mode rules in app.css; both dark
  token blocks stay byte-parallel because they do not change.
- The blockquote, code, and pre rules that were scoped to `.note-rendered`
  are dual-scoped to `.share-body` so the share viewer shows quotes, inline
  code, and code blocks with the same styling as the app.

## Documentation and verification

- `guide.html`'s Markdown basics list gains a callouts line; README's
  Markdown bullet and `tests/README.md` gain the feature.
- `tests/callouts.spec.js`, three browsers: each kind renders its class
  and default title; a custom title; unknown markers stay literal; body
  markdown and task checkboxes work inside; no `[style]` and no
  `.is-pullquote` on callouts; the share viewer styles a callout and a code
  block (computed border and background); existing sanitization,
  task-list, wikilink, and design-token suites stay green.
- No new files, so the shell list and jsconfig are unchanged. Version
  3.23.0; deploy gated on an explicit yes.

## Out of scope

- Icons, collapsible callouts, custom kinds, and Obsidian's `[!type]+`
  fold syntax.
