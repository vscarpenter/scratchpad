# Spec: revision diff in the History dialog

Vinny picked this on 2026-10-08 from `backlog.md` after the roadmap
retired and approved it the same day ("build it"). The design record is
`docs/superpowers/specs/2026-10-08-revision-diff-design.md`.

Branch: `claude/zealous-pascal-aunm2y`, on `main` at 8212aa0 (v4.5.0). One
draft PR.

## Goal

Each row in Revision history shows what restoring that revision would
change, so a person can see the difference before clicking Restore instead
of reading two full texts side by side.

## Inputs

- `openHistoryDialog()`, `renderRevisionRow()`, and `restoreRevision()` in
  app.js (the `-------- Revision history --------` block); `storeRevision()`
  and `normalizeRevision()` for the snapshot shape (`title`, `body`, `tags`,
  `pinned`, `savedAt`).
- `DB.getRevisions(noteId)`, newest first, at most `REVISION_LIMIT` (10).
- `#history-dialog`, `#history-list`, and the `.history-*` rules in app.css.
- The current saved note from `getNote(state.selectedId)`. Unsaved editor
  text is never part of the comparison; Restore already routes a dirty
  editor through the discard confirmation.
- Tokens: `--success-tint`, `--success-text`, `--rust-tint`, `--rust`,
  `--gray-100`, `--slate`, `--gray-700`, `--mono`, `--r-sm`.

## Outputs

- `public/js/revision-diff.js` exporting the frozen
  `window.ScratchpadRevisionDiff` with:
  - `diffLines(before, after)`: pure. Returns `{ coarse, hunks }` with hunks
    of `{ kind: 'same' | 'added' | 'removed', lines: string[] }` in order.
  - `diffWords(before, after)`: pure. Returns `{ coarse, tokens }` with
    tokens of `{ kind, text }` for one line pair, splitting on whitespace
    runs and keeping the whitespace so the line reassembles exactly.
  - `snapshotText(rev)`: `title + '\n\n' + body` when a title exists, else
    `body`. This is what both the preview and the comparison use, so a
    title change shows as a changed first line.
  - `renderDetails(rev, current)`: returns two `<details>` elements, the
    existing **Preview revision** and a new **Compare with current**, built
    with `createElement` only.
- app.js: `renderRevisionRow()` appends the two details from the module
  instead of building the preview itself. Net lines negative; the app.js
  ceiling in `config/structure-baseline.json` tightens to the new count.
- Markup: none new in `index.html`; the dialog is unchanged.
- CSS: `.history-diff`, `.history-diff-line`, `.is-added`, `.is-removed`,
  `.history-diff-gap`, `.history-diff-word`, and `.history-diff-meta` in
  the History block of app.css, tokens only.
- Module wiring: `<script>` before app.js in `index.html`, `APP_SHELL` in
  `public/service-worker.js`, `jsconfig.json` include, a row in
  `tests/README.md`, and the guide's **History & drafts** paragraph.
- The coverage workflow in `scripts/quality/check-browser-coverage.mjs`
  opens History once and expands the comparison so the module counts.

## Behavior

- The comparison is revision versus the current saved note, which answers
  "what does Restore change". Removed lines are what Restore takes away
  from today's note; added lines are what it brings back.
- Line diff first: trim common leading and trailing lines, then run a
  longest-common-subsequence table on the middle. When the middle exceeds
  4,000,000 cells (for example 2,000 by 2,000 lines), the middle renders
  as one removed block followed by one added block, with a note that the
  comparison is coarse. Nothing is ever skipped silently.
- Word refinement: a hunk pair of exactly one removed line followed by
  exactly one added line (the ordinary edited paragraph) renders as one
  removed line and one added line with only the changed words marked.
  Larger hunks stay line level.
- Context: unchanged lines show two before and two after each change; a
  longer unchanged run collapses to a gap line reading
  "12 unchanged lines". A comparison with no changes reads
  "Same as the current note." and shows no lines.
- A metadata line above the lines summarizes what the text cannot:
  "Tags: +added, −removed" and "Pinned" or "Unpinned", only when those
  differ. Restore reapplies tags and pin state, so the comparison must say
  so.
- Each line starts with a `+` or `−` glyph in a span marked
  `aria-hidden`, and the line element is `<ins>` or `<del>`, so color is
  never the only signal and assistive tech has the semantics. Lines are
  `white-space: pre-wrap` in `--mono`, matching the preview, with the same
  180px scroll box.
- Both details start collapsed. Opening one does not close the other.
- Trash: History is already hidden there; nothing changes.

## Constraints

- No network calls, no `innerHTML`, no inline scripts (CSP hashes stay),
  no new tokens, no dark-mode rules in app.css, no emoji in source.
- `--success-tint` and `--rust-tint` are state colors. Added and removed
  are states of a line, so this use is in the spirit of the one-accent
  rule; indigo stays out of the diff.
- Text on the tints: `--slate` over `--success-tint` or `--rust-tint`
  composited on `--paper` in both themes. Verify AA with the design-token
  spec's pairs before shipping; if a pairing fails, drop the tint to a
  left border in the state color and keep the glyph.
- New module: `// @ts-check`, script-level `'use strict'`, block scope,
  JSDoc types, under 400 lines, no function over 40 lines, nesting at most
  3. The LCS table uses a flat `Uint16Array` or `Uint32Array` sized to the
  trimmed middle, never a nested array per line.
- app.js nets at or below zero. The test file stays under 400 lines.
- `deriveTitle()`, `formatFullTimestamp()`, and the Restore button stay in
  app.js; the module never reads `state`.

## Edge cases

- A revision identical to the current note: "Same as the current note."
- Title only changed: the first line shows removed and added with word
  marks on the title.
- Body with a trailing newline difference: a single added or removed empty
  line renders as a visibly empty `+` or `−` row rather than nothing.
- Very long single line (a 50,000-character paragraph with one word
  changed): the word diff runs on tokens, so the same cell cap applies;
  past it, the pair shows as whole-line removed and added.
- A note at `NOTE_BODY_MAX` (200,000 characters) with a few thousand
  lines compares within the cap when the edit is local, because the
  prefix and suffix trim leaves a small middle.
- CRLF in an imported revision: split on `\r?\n` so a line ending
  difference alone does not mark every line.
- Tags normalized differently between a revision and the note (case):
  compare the normalized sets, which `normalizeRevision` already stores.
- The dialog opened while the editor is dirty: the comparison uses the
  saved note, and a hint line "Compared with the last saved version"
  appears only in that case.

## Anti-goals

- No side-by-side columns, no revision-to-revision picker, no character
  level diff, no syntax-aware or Markdown-aware diff.
- No change to what a revision stores, to pruning, or to Restore.
- No new dialog, button, or menu item; the feature lives in the rows.
- No third library. The diff is a few dozen lines of own code.

## Acceptance criteria

1. With a note saved as "Alpha\n\nline one\nline two" and then edited to
   "Alpha\n\nline one\nline 2\nline three", the oldest row's Compare with
   current shows `line 2` and `line three` removed and `line two` added,
   and `line one` as unchanged context.
2. A title-only change shows the first line removed and added with the
   changed word marked and the rest of the line unmarked.
3. A paragraph where one word changed renders as one removed and one added
   line with only that word in `.history-diff-word`.
4. A 30-line note with one changed line shows two context lines on each
   side and a gap line naming the count of hidden unchanged lines.
5. A revision equal to the current note shows "Same as the current note."
6. A revision whose tags or pin state differ shows the metadata line with
   the exact additions, removals, and pin change.
7. The comparison ignores unsaved editor text and says it compared with
   the last saved version.
8. The coarse fallback engages above the cell cap and says so, and the
   preview still shows the full text.
9. Preview revision still renders the full snapshot text, and every test in
   `tests/revision-history.spec.js` passes unchanged.
10. `npm run verify` passes, the design-token spec passes, CSP hashes are
    unchanged, and the Chromium suite passes apart from the
    iPhone-emulation tests this container cannot launch.

## Test stubs

```js
// tests/revision-diff.spec.js
test('Compare with current shows removed, added, and context lines');
test('a title change marks only the changed word on the first line');
test('a one-word paragraph edit marks the word, not the line');
test('long unchanged runs collapse to a counted gap');
test('a revision equal to the current note says so');
test('tag and pin differences show on the metadata line');
test('the comparison uses the saved note, not the dirty editor');
test('an oversized comparison falls back to coarse blocks and says so');
test('diffLines and diffWords are stable on empty and identical inputs'); // page.evaluate on the pure API
```

## Assumptions

- Comparing with the current note, not the previous revision, is the right
  default because the dialog's only action is Restore. A revision-to-
  revision view is a later follow-up if wanted.
- The two tints are acceptable as diff backgrounds under the one-accent
  rule; if you would rather keep the shell free of success and rust
  outside alerts, the fallback is a 3px left border per line and no fill.
- Feature PRs do not bump the version.
