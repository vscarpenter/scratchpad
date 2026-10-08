# Revision diff: design spec

Date: 2026-10-08
Status: approved

Vinny approved the spec in `tasks/spec.md` on 2026-10-08. Restore shipped on
2026-07-26, and since then the History dialog has asked people to read two
full texts to learn what a restore would change. This adds the comparison.

## What a row shows

Every row in Revision history keeps **Preview revision** and gains
**Compare with current**, both collapsed. The comparison is the revision
against the current saved note, because the dialog's one action is Restore:
removed lines are what today's note loses, added lines are what comes back.

- A metadata line reports what the text cannot: `Tags: +old, −new` and
  `Pinned` or `Unpinned`, only when they differ, since Restore reapplies
  both.
- When the editor holds unsaved text, a line says the comparison used the
  last saved version. Restore already routes a dirty editor through the
  discard confirmation, so the two agree.
- No differences reads "Same as the current note." and shows no lines.

## How the diff works

`public/js/revision-diff.js` (`window.ScratchpadRevisionDiff`) owns the
comparison and the DOM for it. It never reads app state; app.js hands it the
revision, the current note, and whether the editor is dirty.

- The compared text is the title, a blank line, and the body, the same text
  the preview shows, so a title change is a changed first line.
- Lines split on `\r?\n`. Common leading and trailing lines are trimmed,
  then a longest-common-subsequence table runs on the middle in a flat
  typed array. Above 4,000,000 cells the middle renders as one removed
  block and one added block with a note that the comparison is coarse.
- A removed line followed by exactly one added line (an edited paragraph)
  is refined to words: tokens split on whitespace runs, keeping the
  whitespace, and only changed tokens are marked.
- Unchanged lines show two of context on each side of a change; a longer
  run collapses to "N unchanged lines".

## How it looks

Lines are `<del>` and `<ins>` elements with a `−` or `+` glyph marked
`aria-hidden`, so color is never the only signal and the semantics reach
assistive tech. Removed lines sit on `--rust-tint`, added lines on
`--success-tint`, both over the dialog's `--paper`; `--slate` text clears AA
on each in both themes. Changed words get the matching solid color as text.
The box matches the preview: `--mono`, `pre-wrap`, a 180px scroll.

## Out of scope

Side-by-side columns, a revision-to-revision picker, character-level diffs,
and any change to what a revision stores, to pruning, or to Restore.
