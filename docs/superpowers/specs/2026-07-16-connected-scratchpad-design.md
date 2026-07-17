# Connected Scratchpad: task lists, daily notes, wikilinks

Date: 2026-07-16
Status: Approved for implementation

## Goal

Deepen Scratchpad's daily-driver value with three compounding features: interactive
task lists that make rendered notes actionable, a daily note with quick capture
that removes the "where does this thought go" decision, and wikilinks with
backlinks that connect notes into a knowledge base. Ships as v3.1.0.

## Product constraints

- Keep the app static, same-origin, local-only, and account-free. No new network
  surface of any kind.
- The DOMPurify policy does not get weaker: `FORBID_TAGS` keeps `input`,
  `ALLOW_DATA_ATTR` stays `false`. New interactivity must pass the existing
  sanitizer unchanged.
- No IndexedDB schema migration. `DB_VERSION` stays 2. The only data-shape change
  is one additive note field.
- Rendering logic lives in `markdown.js`; interaction and state live in new
  banner-comment sections of `app.js`; styles are tokens-only in `app.css`;
  dialogs and templates are static markup in `index.html`.
- No new inline scripts, so no CSP hash recompute is required.
- No emoji in source; new icons are inline SVG strokes.
- Reuse Soft Glass tokens, native dialogs, and the existing restrained voice.

## Shared infrastructure

### `dailyDate` note field

- `normalizeNote` gains `dailyDate`: a string matching `YYYY-MM-DD`, else `null`.
- Because `normalizeNote` is the single allowlist for note shape, adding the field
  there carries it through save, export, JSON import, and multi-tab refresh.
- `normalizeRevision` is unchanged; restoring a revision preserves the live note's
  `dailyDate` (revisions restore content, not identity).
- Markdown ZIP frontmatter includes `dailyDate` when present; Markdown import
  accepts it with the same validation.

### `mutateNoteBody(noteId, transform)`

A programmatic save path for writes that do not originate in the editor.

- Reads the latest record from IndexedDB via `DB.get` — never trusts in-memory
  state — then applies `transform(body)` and writes through `putNoteRecord`, so
  BroadcastChannel announcements and multi-tab behavior match a manual save.
- Stores a revision of the pre-mutation state per the normal rules, with one
  exception: task-toggle mutations coalesce (below).
- If the target note is open with unsaved edits in the same tab, callers must not
  reach the DB path; each feature defines its editor-buffer behavior explicitly.

## Feature 1: interactive task lists

Rendered `- [ ]` / `- [x]` items become real, clickable checkboxes in view mode.

- A `marked.use` renderer override (marked v18) emits
  `<span class="task-checkbox" role="checkbox" aria-checked tabindex="0"></span>`
  instead of `<input>`. Spans with class, role, and aria attributes pass the
  existing DOMPurify policy untouched.
- The check glyph is pure CSS strokes on the span; no images, no emoji.
- Mapping clicks to source: the nth rendered checkbox corresponds to the nth task
  marker found by a shared line scanner that tolerates list nesting and
  blockquote prefixes and skips fenced code blocks.
- Safety valve: if the rendered checkbox count differs from the scanned marker
  count, every checkbox renders inert (`aria-disabled="true"`) rather than guess
  a mapping. Degraded, never destructive.
- Toggling flips `[ ]`/`[x]` at the scanned offset via `mutateNoteBody`, then
  re-renders. Click, Space, and Enter all toggle.
- View mode only. While editing, preview checkboxes are inert; the textarea is
  the source of truth and a toggle must not fight the draft.
- Revision coalescing: a toggle stores a revision only if no toggle-revision was
  stored for that note in the last 5 minutes (in-memory timestamp per note). The
  first toggle of a burst always snapshots the pre-toggle state, so rapid
  toggling cannot flush the 10-revision history.

## Feature 2: daily note and quick capture

One command opens today's note, creating it on first access; a one-line capture
dialog appends a timestamped entry from anywhere.

- Identity: a daily note is any untrashed note with `dailyDate` equal to today's
  local date. Ties resolve to the most recently updated note. The title is a
  default (for example `Wed, Jul 16 2026`), freely editable; identity lives in
  the field, so renames never break "today".
- First access creates the note with `tags: ['daily']` and a body seeded from a
  note titled exactly `Daily template` (case-insensitive, untrashed) when one
  exists, else the built-in default body `## Tasks\n\n## Notes\n`. Template
  customization requires no settings UI.
- Entry points:
  - Command palette: `Open today's note` and `Quick capture`.
  - A "Today" inline-SVG icon button beside New note in the sidebar.
  - Best-effort keyboard shortcut (candidate `⌘/Ctrl+Shift+D`; the final key is
    chosen during implementation from combinations browsers allow us to
    intercept). The palette is the guaranteed path.
  - PWA manifest `shortcuts` for `/?action=new`, `/?action=today`, and
    `/?action=capture`, handled at boot and cleaned with
    `history.replaceState`. The service worker must serve the cached shell for
    shell URLs carrying query parameters (`ignoreSearch` on cache match).
- Quick capture: a minimal native dialog with a single input. Enter appends
  `- **HH:MM** text` to today's note — creating it first when needed — via
  `mutateNoteBody`, shows a toast, and returns focus. Esc closes without writing.
- Edge case: when today's note is open with unsaved edits in this tab, capture
  appends to the live editor buffer and autosaved draft instead of the DB, and
  the toast says so. Capture never creates a self-conflict.

## Feature 3: wikilinks and backlinks

`[[Title]]` and `[[Title|alias]]` link notes together; each note shows what
links to it.

- A marked inline tokenizer extension in `markdown.js` parses wikilinks (no
  newlines inside; first `|` splits target from alias).
- Resolution happens at render time through a resolver injected by app.js
  (`ScratchpadMarkdown.setWikilinkResolver(fn)`), preserving the module boundary.
- Resolved links render as `<a class="wikilink" href="#note:<id>">`; unresolved
  as `<a class="wikilink is-phantom" href="#new:<encoded title>">`. Fragment
  hrefs pass the existing `SAFE_URI_PATTERN`; no data attributes are needed.
- `hardenLinks` skips fragment (`#`) links, which also stops plain markdown
  anchor links from getting `target="_blank"`.
- Matching: exact title match, case-insensitive, trimmed, among untrashed notes;
  ties resolve to the most recently updated.
- Navigation: a delegated click handler intercepts wikilinks. `#note:<id>` runs
  `selectNote(id)`, inheriting the dirty-editor guard. `#new:<title>` creates a
  note with that title and opens it in edit mode — phantom links are the capture
  flywheel. Trashed targets render as phantom; restoring from Trash heals links
  automatically because resolution is render-time.
- Backlinks: app.js keeps an in-memory map of each note's outbound link titles,
  rebuilt for a note on save and fully on boot. View mode shows a collapsible
  `Linked from N notes` section under the rendered body listing source notes.
  Trashed sources are excluded. Nothing is persisted, so nothing can go stale.
- Rename safety: when a save changes a title that other notes link to, a
  non-blocking dialog offers to update the N linking notes. Accepted rewrites go
  through `mutateNoteBody` (each linking note gets a revision, so the rewrite is
  recoverable). Declining leaves phantom links.
- Autocomplete: typing `[[` in the editor opens a panel of up to 8 title matches
  (substring, recency-ranked). Arrow keys navigate; Enter or Tab inserts
  `Title]]`; Esc dismisses. Positioned at the caret using a hidden mirror
  element; if caret positioning proves unreliable on mobile, the panel anchors
  to the editor edge instead.

## Error handling

- All new writes funnel through existing guarded primitives (`withBusy`,
  `putNoteRecord`, the save-conflict dialog); failures surface as the app's
  normal toasts and never destroy drafts.
- Each ambiguity has a stated safe fallback: checkbox count mismatch renders
  inert checkboxes; daily-note ties pick most-recent; capture into a dirty
  editor writes to the buffer, not the DB.

## Testing

New Playwright specs, following the existing suite's conventions:

- `task-lists.spec.js` — toggle persists across reload; code-block mismatch
  falls back to inert; toggling in view mode while another tab edits follows the
  existing conflict rules; revision coalescing keeps history intact.
- `daily-note.spec.js` — first access creates from template; second access
  reuses; capture appends to saved note and to dirty draft; palette and URL
  `?action=` entry points work.
- `wikilinks.spec.js` — resolved link navigates; phantom link creates and opens;
  rename prompt updates linking notes and creates revisions; declining leaves
  phantoms; backlinks list excludes trashed sources; autocomplete inserts.

## Release

- Version bump to 3.1.0 in `public/js/version.js`.
- README features section and about.html feature documentation updated.
- Build order: task lists → daily note and capture → wikilinks. Each lands
  independently.
- Deploy remains manual and requires explicit confirmation, per repo policy.
