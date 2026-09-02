# Release train after v3.19 — implementation roadmap

Date: 2026-09-01
Status: draft for review (grounds each feature in today's code so its
brainstorm starts from facts; each feature still gets its own spec + plan)

## Cross-cutting constraints (every feature pays these)

- **Structure ratchet** (`config/structure-baseline.json`): new files are
  auto-discovered and must land at ≤400 lines, ≤40-line functions, nesting ≤3.
  `app.js` is pinned at 6204 lines; `longFunctions` 102 / `deepFunctions` 11
  may only fall. Test bodies and `describe` callbacks count. Feature logic goes
  in a new `window.ScratchpadX` module; app.js edits net out at or below zero.
- **New-module checklist**: `<script>` tag in `index.html` (and `share.html`
  when the renderer needs it — root-absolute `/public/...`, asserted by
  `tests/share-viewer.spec.js:204`); `APP_SHELL` in `public/service-worker.js`
  (`cache.addAll` is atomic, a missing entry is silent); `jsconfig.json`
  include + `// @ts-check`; Biome-clean (only app.js/app.css are
  grandfathered); row in `tests/README.md`; guide section + TOC anchor +
  shortcut row + `SECTION_IDS` in `tests/guide.spec.js`.
- **Coverage floor** 36.2% is global over `public/js` minus vendor, measured
  by the fixed workflow in `scripts/quality/check-browser-coverage.mjs:29-51`
  (new note, search, menus, editor). A module that workflow never runs dilutes
  the number. Renderer features get coverage for free if the workflow's note
  body carries their syntax; others need a deliberate workflow extension.
- **CSP** (`cloudfront/security-headers-function.js:16-18`): `img-src 'self'
  data:` (no `blob:`), `style-src 'self'` (no inline styles), no `worker-src`
  so workers fall back to `default-src 'self'`. External files only, so hashes
  stay byte-identical. Nothing in `npm test` checks CSP; a CSP change is a
  CloudFront Function publish via the `csp-update` skill and is a prod change.
- **Sanitizer** (`public/js/markdown.js:5-14`): `class` survives; `style`,
  `srcset`, `data-*` stripped; `SAFE_URI_PATTERN` rejects `blob:` and `data:`;
  `stripRemoteAssets` drops any non-same-origin `src`.
  `tests/sanitization.spec.js:50-79` asserts no `[style]` and no `data:` src.
  Tighten, never relax.
- **Vendoring a third library**: `scripts/check-vendor-versions.mjs` fails
  when a vendored version differs from npm latest (decide: track or exempt
  with a rationale); biome/format/structure/coverage already skip `vendor/`;
  precache by hand; `tests/network-isolation.spec.js:37` forbids lazy loads.
- **Share viewer** reuses `markdown.js`, but its body is `.share-body` not
  `.note-rendered` (`share.html:56`), so today's `pre`/`code`/`blockquote`
  rules never reach it. Pre-existing gap; fix alongside v3.23.
- **Data layer**: `DB_VERSION = 4` with idempotent presence-check migrations
  (`db.js:31-56`, no per-version branches); backup `schemaVersion: 4` is a
  bare literal at `app.js:3166`, `:4917`, `:4941` and pinned by
  `archive-portability`, `folders`, `share-export` specs; the only
  DB-upgrade test is v3→v4 in `tests/share-store.spec.js:119-150`.
- **Release gate**: `scripts/release-gate.mjs` is named in `tasks/todo.md:7`
  and `tasks/lessons.md` but was never committed. Today's gate is
  `npm run verify` + `npm test` with the popup test CI-only. Decide: write
  the script or correct the two docs.
- Real deploys stay gated on an explicit "yes, deploy" in the current turn.

## v3.20 Search operators — `tag:` `title:` `folder:`

**Today.** `search.js` is pure: `queryInfo` (`:48`) is the single parse
seam, but `words()` (`:41`) splits on `:` so `tag:project` already becomes
two plain terms. `rankNotes(notes, query)` receives an already-scoped array
and knows nothing about folders. Scope composition lives in app.js:
lifecycle view (`state.view`) → tag chip (`tagFilteredNotes`, `:1345`) →
`rankNotes` (`:1350-1356`). The folder view is ignored by search on purpose
(`tests/focused-search.spec.js:143-159` asserts `Notes · all folders`), and
`search-view.js:111,127,154` hardcode the "all folders" strings.

**Correction to the backlog.** The scope picker is gone (removed in
`e51b143`; `tasks/lessons.md:9-12`). Operators compose with what survives:
the lifecycle switch and the tag chip. `folder:` becomes the explicit way to
scope by folder while the open folder stays ignored.

**Shape.**
- `Search.parseQuery(raw)` → `{ text, filters: { tags, titles, folders } }`,
  run before `words()`. `key:value` only for the three known keys; anything
  else stays literal text. Values end at whitespace.
- A pure `Search.applyFilters(notes, filters, folderIndex)` runs in app.js
  before `rankNotes`, where `folderIndex` maps normalized folder name → id
  and `notes` → `null` (unfiled). Residual `text` feeds `rankNotes`.
- Operator-only queries return every filtered note in recency order as
  `kind: 'direct'`. This changes today's empty-phrase → `[]` contract.
- `tag:` matches a normalized tag exactly; `title:` and `folder:` match a
  normalized substring. Repeated operators AND together, as does the chip.
- `SearchView.createChrome` gains `filters` and renders
  `3 results · Notes · folder Work · tag project`; "all folders" appears only
  when no `folder:` is present. The live region reads the same string.
- Highlight residual terms only. Guide `#organizing` and the in-app help
  gain the syntax; `tests/README.md` gains the new spec.

**Files.** `search.js` (+~100, stays under 400), `search-view.js` (+~30),
app.js net ≤0, `tests/search-operators.spec.js` (own describes), edits to
`focused-search.spec.js:101,158` only if the header wording changes.

**Decide.** (1) Confirm the composition framing above. (2) AND for repeated
operators (recommended) or OR. (3) Substring match for multi-word folder
names (recommended) versus quoted values. (4) Negation `-tag:` (recommend
no; out of scope).

**Size** S. **Risk** low; every change is behind the parse seam.

## v3.21 Paste as Markdown

**Today.** The editor is a `<textarea>` (`index.html:322`). No `paste`,
`drop`, or `beforeinput` handler exists anywhere. The undo-safe mutation
primitive is `editor.setRangeText(text, start, end, 'end')` followed by a
synthetic bubbling `input` event (`find-replace.js:219-220`,
`editor-format.js:82-85`); that event is what fires `markDirty` and the
wikilink suggester. Replace-all deliberately bypasses undo with a `.value`
assignment (`find-replace.js:229,236`). There is no HTML→Markdown code and
no read-side clipboard code. `NOTE_BODY_MAX` is 200000.

**Shape.**
- New `public/js/paste.js` (`window.ScratchpadPaste`) owning one `paste`
  listener bound next to the existing editor bindings (`app.js:5826-5830`).
  If the clipboard carries `text/html`, convert and insert via
  `setRangeText` + `input`; otherwise do nothing and let the browser paste.
  A modifier (Shift) bypasses conversion.
- Converter in its own module `public/js/html-to-markdown.js`: parse with
  `DOMParser` (inert document, nothing is inserted into the page, so the
  pre-commit `innerHTML` guard stays untouched) and walk the tree: headings,
  paragraphs, `br`, strong/em, inline code, `pre`, links, nested lists,
  blockquotes, `hr`, GFM tables, strikethrough, images as alt text. Unknown
  elements flatten to text. Own code beats vendoring turndown: no
  vendor-version pin, no payload, and the ratchet keeps it under 400 lines.
- Heuristic: when the HTML's text content equals the plain-text flavor
  (code editors and terminals), prefer the plain text unchanged.
- The listener is the v4.0 extension point: `clipboardData.files` with an
  image type is ignored here and handled there.
- Tests: dispatch a `ClipboardEvent` built from a `DataTransfer` in
  `page.evaluate`, assert the textarea value, dirty state, and caret; verify
  Cmd+Z restores (Chromium at minimum). Guide `#editing` gains a bullet.

**Decide.** (1) Own converter versus vendored turndown (recommend own).
(2) Which modifier bypasses. (3) Whether Google Docs / Word wrappers
(`<b style="font-weight:normal">`) need special-casing; `DOMParser` keeps
the style attribute readable, so the walker can honor it.

**Size** M.

## v3.22 Unlinked mentions

**Today.** Backlinks are a deliberate full scan of `state.notes` on every
editor render (`linkingNotesTo`, `app.js:3522-3530`; rationale in the
comment at `:3518-3521`: no persisted index, so Trash restores and imports
can never go stale). Rows are title-only pills; the panel is hidden while
`state.editing` or when the note is trashed. Link resolution is by derived
title, trimmed and lower-cased (`app.js:6172-6179`).
`extractWikilinkTargets` skips fenced code via `scanOutsideFences`
(`markdown.js:143-158`). `mutateNoteBody(noteId, transform)`
(`app.js:3384-3415`) is the existing helper for editing another note: it
re-reads the record, stores a revision, writes with `putIfUnchanged` under
retry, and broadcasts. It does not check whether the target has an unsaved
draft.

**Shape.**
- New `public/js/mentions.js`: `findMentions(notes, title, excludeId)` →
  `[{ note, index, excerpt }]`, scanning outside fences, inline code, and
  existing `[[...]]`, word-bounded, case-insensitive, capped at 50. Skip
  titles under 3 characters and "Untitled note". Excerpt clipping mirrors
  `search.js` `clipAround` (private today; expose or copy ~15 lines).
- The backlinks `<details>` gains a second group, "Mentioned in N notes",
  each row title + excerpt + a Link button. Link calls `mutateNoteBody` with
  a transform that replaces that one occurrence with `[[Title]]`, or
  `[[Title|original]]` when the casing differs.
- Rows for notes with a pending draft render disabled with a reason, since
  a later draft save would overwrite the link.
- Tests: `tests/unlinked-mentions.spec.js`; guide `#linking` bullet.

**Decide.** (1) Title minimum and casing rule. (2) Alias-preserving
replacement (recommend yes). (3) Draft-conflict rows: disabled (recommended)
or hidden.

**Size** M.

## v3.23 Callouts

**Today.** Two `marked.use` precedents exist (`markdown.js:23-32` checkbox
renderer, `:104-127` wikilink extension). `class` survives DOMPurify,
`style` does not. Blockquote CSS is `app.css:1968-1985`; `decorateRendered`
(`markdown.js:72-79`) adds `.is-pullquote` to any short single-paragraph
blockquote and would fire on callouts. The share viewer's `.share-body` is
outside the `.note-rendered` scope.

**Shape.**
- A `blockquote` renderer override in `markdown.js` (214 lines, room to
  grow): when the first paragraph starts with `[!NOTE]`, `[!TIP]`,
  `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` (GitHub's five), emit
  `<blockquote class="callout callout-note"><p class="callout-title">Note
  </p>…</blockquote>` and strip the marker. Unknown markers stay literal.
  `decorateRendered` skips `.callout`.
- Token CSS only: note/tip on `--accent` and `--accent-soft`, important on
  `--info`, warning on the `--warning` family, caution on the `--rust`
  family. Both dark blocks stay byte-parallel (`design-tokens.spec.js:124`).
  No icon glyphs; SVG is forbidden in rendered HTML and the label carries the
  meaning.
- Close the share scope gap: give `#share-body` the `note-rendered` class so
  callout, code, and blockquote rules reach `/s/<id>`. No new script, so no
  CSP change.
- Tests: `tests/callouts.spec.js` (class per type, unknown marker literal,
  no `[style]`, share viewer renders it, print). Guide `#editing` or
  `#markdown` bullet.

**Decide.** (1) Five types (recommended) or three. (2) Custom titles after
the marker. (3) Fix the share scope gap here (recommended).

**Size** S.

## v3.24 Syntax highlighting

**Today.** marked emits `<pre><code class="language-x">`; the class survives
sanitization and `markdown.js:187` adds `.code-block`. Inline styles are
banned twice (CSP `style-src 'self'`, `FORBID_ATTR`), so the highlighter
must emit class-only spans. Vendored files are exempt from lint, format,
structure, and coverage, but `check-vendor-versions.mjs` pins to npm latest
and `APP_SHELL` is hand-maintained. `network-isolation.spec.js:37` forbids
fetching grammars at runtime.

**Shape.**
- Vendor a single-file Prism bundle: core plus ten grammars (markup, css,
  javascript, typescript, json, bash, python, sql, yaml, markdown) lands
  near the 30KB budget; highlight.js core alone is larger. Header line
  carries the version for `check-vendor-versions.mjs`.
- Hook at render: a `code` renderer override in `markdown.js` calls
  `Prism.highlight` when `window.Prism` exists and the language is loaded,
  otherwise falls back to escaped text. `share.html` gets the same
  root-absolute script tag so shares highlight too.
- Token CSS from the palette: keyword `--accent`, string `--success-text`,
  comment `--text-muted`, number `--warning-dark`, function `--info`,
  punctuation `--text-secondary`. Dark parity as always.
- Tests: `tests/syntax-highlighting.spec.js` (known language → token
  spans, unknown → plain, no `[style]`, share viewer, wikilinks inside code
  stay inert per `wikilinks.spec.js:25`).

**Decide.** (1) Prism versus highlight.js versus a hand-written tokenizer.
(2) The language list. (3) Vendor gate: add a `vendors[]` entry (tracks
latest) or exempt with a written rationale. (4) A copy-code button
(recommend no).

**Size** M, mostly integration and CSS.

## v3.25 Templates folder

**Today.** The daily template is a title convention: `findDailyTemplate`
(`app.js:3735-3737`) finds an active note titled "Daily template" and
`createDailyNote` seeds from its body, no settings UI (design note at
`app.js:3720-3723`). `ensureDailyNotesFolder` (`app.js:802-860`) is the
managed-folder pattern, with reserved names at `app.js:24,28-29`. Palette
commands are a plain array in `commandDefinitions` (`app.js:4516-4693`) and
`runCommandAt` dispatches synchronously without `await` (`87238d7`). The
monthly review is a second seeded-note precedent.

**Shape.**
- Convention over management: any folder named "Templates"
  (case-insensitive) is the templates folder. The user creates it; nothing
  is auto-created and no migration runs. The daily template keeps its title
  convention untouched.
- Palette command "New note from template…" opens a second-stage list in
  the same palette (reuse `renderCommandPaletteList` with template rows).
  Choosing one creates a note with the template's body and tags, title
  empty, placed in the current folder view (never in Templates), then opens
  the editor. Notes inside Templates are excluded from the Today card and
  from "New note from template" when the folder is empty.
- Tests: `tests/templates.spec.js`; guide `#daily` gains a templates
  paragraph or a new `#templates` section plus `SECTION_IDS`.

**Decide.** (1) Name convention (recommended) versus a managed folder id.
(2) Placeholders such as `{{date}}` (recommend none for v3.25). (3) Where
the new note lands. (4) Second-stage palette (recommended) versus a dialog.

**Size** S–M.

## v4.0 Image attachments

**Today.** `DB_VERSION = 4`; migrations are presence checks so a new store
is one `if (!contains)` block; `transactionDone` already surfaces
`QuotaExceededError` (`db.js:92-95`); `onversionchange` yields open tabs
(`db.js:62-65`). `deleteNoteEverywhere` and `clearAllStores` enumerate
stores by hand. Backups are JSON (`buildBackupPayload`, `app.js:4904`) with
the `schemaVersion: 4` literal in three places; the markdown zip writer
`zip.js` is text-only (`TextEncoder` at `zip.js:16`). The share payload is
exactly `{ v, title, body, tags, updatedAt }` (`app.js:4299-4310`) under a
256KB server cap. The renderer allows `<img>` but `SAFE_URI_PATTERN`
rejects `blob:` and `data:`, `stripRemoteAssets` keeps same-origin `src`
only, and CSP `img-src` lacks `blob:`. `navigator.storage.estimate` is
already in use (`app.js:4073`).

**Shape.**
- Store `attachments` `{ id, noteId, name, type, size, blob, createdAt }`
  with a `noteId` index; `DB_VERSION` 5. Extend `deleteNoteEverywhere`,
  `clearAllStores`, and cross-tab broadcasts. Attachments live until the
  note is permanently deleted, so restored revisions never dangle.
- Body syntax `![alt](attachment:<id>)`. An `image` renderer override
  resolves `attachment:` ids through a per-render object-URL cache that is
  revoked on the next render. `SAFE_URI_PATTERN` admits `blob:` for `img`
  `src` only (a DOMPurify `uponSanitizeAttribute` hook), never for `href`.
  CSP becomes `img-src 'self' blob: data:` — one CloudFront Function publish,
  gated like any prod change. `data:` stays rejected in rendered output so
  `sanitization.spec.js` tightens rather than relaxes.
- Ingest: the v3.21 paste listener handles `clipboardData.files`, plus drop
  on the editor and an "Attach image" file input. Per-image cap 4MB;
  anything over 2048px is downscaled through a canvas before storing.
- Backup schema 5 adds `attachments: [{ …, data: base64 }]` to the JSON;
  import accepts 2–5. The markdown zip gains binary entries under
  `attachments/` and rewrites `attachment:` links to relative paths, which
  needs `zip.js` to accept `Uint8Array` content. Encrypted backups wrap the
  same JSON unchanged.
- Shares stay text-only: with no resolver the viewer renders the alt text
  in an "image not included" placeholder.
- Tests: `tests/attachments.spec.js` (paste a `File`, blob `src`, backup
  round-trip, zip entry, share placeholder, quota error) and a v4→v5 sibling
  of `share-store.spec.js:119`.

**Decide.** (1) `blob:` plus CSP publish (recommended) versus `data:` URIs.
(2) Caps and downscaling. (3) JSON-embedded base64 (recommended) versus a
zip-based backup format. (4) Retention until permanent delete
(recommended) versus GC on save. (5) Share placeholder wording.

**Size** L. Plan it as two halves: storage + render + ingest, then backup +
export + import.

## v4.1 Linked plain-text folder

**Today.** No File System Access code exists; exports go through
`downloadBlob` (`app.js:4890`). `noteToMarkdown` (`app.js:5078`) already
emits frontmatter plus body and the zip layout
`<folder-slug>/<title-slug>.md`; markdown import exists
(`markdown-import.spec.js`). PRODUCT.md:113-115 bans "sync" because it
promises multi-device continuity the product does not offer.
`showDirectoryPicker` is Chromium-only; Safari and Firefox have OPFS only.

**Shape.**
- Feature-detected module `public/js/linked-folder.js`: "Link a folder"
  stores the `FileSystemDirectoryHandle` (structured-cloneable) in a
  `settings` store, writes each note as `<title>.md` with an `id` in
  frontmatter, and reads the folder back on demand ("Read folder") and on
  window focus by comparing `lastModified` with `updatedAt`. Conflicts store
  a revision before overwriting; the newer side wins.
- Permission re-grant needs user activation, so a "Reconnect" control
  appears when `queryPermission` is not `granted`.
- Images write to `attachments/` beside the notes with links rewritten to
  relative paths on write and mapped back on read; inherits v4.0.
- Vocabulary: linked folder, write, read, reconnect. Never "sync".
- Tests: inject a fake `showDirectoryPicker` that returns
  `navigator.storage.getDirectory()` (OPFS works in all three browsers), so
  the real read/write code runs against a real handle.

**Decide.** (1) Add the `settings` store in v4.0's migration to avoid a
sixth bump, or bump to 6. (2) Focus-triggered reads (recommended) versus
manual only. (3) Conflict policy. (4) Rename handling when a title changes
(frontmatter id lets the file be renamed rather than duplicated).

**Size** XL; biggest and last.

## Sequencing and dependencies

- v3.21 must precede v4.0 (paste listener). v3.23 must precede v3.24
  (renderer override pattern and the share scope fix). v4.0 must precede
  v4.1 (attachment export decisions).
- v3.20, v3.22, and v3.25 are independent of everything else and of each
  other; they can move freely if priorities shift.
- Only v4.0 changes CSP. Only v4.0 (and possibly v4.1) bumps `DB_VERSION`.
- Every release: version bump via `release-prep`, `npm run verify`,
  `npm test`, CSP hash check, guide and `tests/README.md` updates, deploy on
  explicit yes.
