# Syntax highlighting — design spec

Date: 2026-09-01
Status: approved

## Decision

Highlight fenced code blocks at render time with a vendored Prism 1.30.0
bundle: the core plus ten grammars (markup, css, clike, javascript,
typescript, json, bash, python, sql, yaml), about 32KB minified, assembled
from the npm package in dependency order into
`public/js/vendor/prism.min.js`. The script loads with `data-manual`, so
Prism never scans the page; `public/js/markdown.js` gains a `code`
renderer override that calls `Prism.highlight` when a grammar is loaded
and escapes the text otherwise. Output is class-only `<span class="token …">`
markup, so the sanitizer and the CSP are untouched. Colors are tokens.
Both shells load the bundle. Ships as v3.24.0.

## Goals

- Readable code in notes and in shared notes without a network fetch, a
  build step, or inline styles.
- Keep the vendored surface auditable: one file, a header naming the exact
  version and grammar list, an entry in the vendor-version gate.
- Degrade cleanly: unknown or missing languages render exactly as today.

## Rendering contract

- The language is the first word of the fence info string, lower-cased.
  Prism aliases apply, so `js`, `html`, `ts`, `sh`, `shell`, `py`, and `yml`
  resolve.
- A block whose language has a loaded grammar renders
  `<pre><code class="language-<lang>">` containing Prism's token spans. A
  block with an unknown language keeps its `language-` class and renders
  escaped text with no spans. A block without a language renders escaped
  text with no class.
- Highlighting happens inside `renderMarkdownInto`, so the app and the
  share viewer behave identically, and `.code-block` is still added to
  every `pre`.
- Wikilinks and task markers inside code stay inert as before.

## Visual contract

- Token colors map to existing tokens only: keywords, tags, and selectors
  to `--accent-d`; functions, class names, and properties to `--accent`;
  strings and attribute values to `--success-text`; numbers, booleans, and
  attribute names to `--warning-dark`; comments to `--text-muted` in
  italics; punctuation to `--text-secondary`; everything else inherits the
  code block's ink. Bold and italic tokens use weight and style only.
- Rules are scoped to `.code-block .token…`, which reaches both shells. No
  dark-mode rules; tokens flip on their own.

## Payload and tooling contract

- `public/js/vendor/prism.min.js` starts with a comment naming
  `PrismJS 1.30.0`, the MIT license, and the grammar list. It is under 40KB.
- `scripts/check-vendor-versions.mjs` gains a Prism entry so the vendored
  version is compared with npm latest like marked and DOMPurify.
- The bundle joins `APP_SHELL`, `index.html`, and `share.html` with
  root-absolute paths and the `data-manual` attribute. Vendor exclusions in
  Biome, the structure ratchet, coverage, and the pre-commit hook already
  cover the new file.

## Documentation and verification

- `guide.html`'s Markdown basics gains a fenced-code line naming the
  languages; README and `tests/README.md` gain the feature.
- `tests/syntax-highlighting.spec.js`, three browsers: a `js` block gets
  keyword tokens and no `[style]`; an unknown language and a bare fence get
  no spans and keep their text escaped; the share viewer highlights a
  block; Prism is in manual mode on both shells; the vendored file is under
  40KB. Existing sanitization, task-list, wikilink, typography, and
  network-isolation suites stay green.
- Version 3.24.0; deploy gated on an explicit yes.

## Out of scope

- Line numbers, a copy button, more grammars, themes beyond the token
  palette, and highlighting inline code.
