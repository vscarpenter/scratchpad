# Unlinked mentions — design spec

Date: 2026-09-01
Status: approved

## Decision

Below the backlinks panel, show the notes whose plain text mentions the
open note's title without linking to it, each with an excerpt and a Link
button that turns that one mention into a wikilink. Detection is computed
on every render from note bodies, exactly like backlinks, so nothing is
persisted and nothing can go stale. All logic lives in a new strict-typed
module, `public/js/mentions.js`; app.js only wires dependencies and calls
`render`. Ships as v3.22.0.

## Goals

- Surface connections the user wrote in prose but never linked, and make
  linking them a single click that keeps the sentence intact.
- Keep the backlinks contract untouched: same section, same tests, same
  render timing.
- Never rewrite a note behind an unsaved draft.
- app.js at or below its current 6203 lines as the ratchet counts.

## Detection contract

- A mention is the open note's title appearing in another note's body as
  whole words, case-insensitive, outside fenced code, inline code, and
  existing `[[...]]` links. "Hubcap" does not mention "Hub".
- Titles come from `deriveTitle`. Titles shorter than three characters and
  the fallback "Untitled note" never produce mentions.
- Trashed notes and the open note itself are skipped. Archived notes count
  and are labeled "· Archived" like backlinks.
- One row per mentioning note, showing its first mention, newest lifecycle
  time first, capped at 50 rows.
- The excerpt is the mentioning line clipped to about 40 characters before
  and 60 after the match, with ellipses where clipped.

## Panel contract

- A second `<details id="mentions-section">` sits directly after the
  backlinks section with the same styling, summary text
  `Mentioned in N note(s)`, and a list of rows. It is hidden when the note
  is trashed, while editing, or when there are no mentions.
- Each row has the note title as an open button, the excerpt, and a Link
  button. Link rewrites the first mention in the note's current body
  through `mutateNoteBody`, which stores a revision, writes conditionally,
  broadcasts to other tabs, and updates state. The replacement is
  `[[Title]]` when the mention's casing matches the title exactly and
  `[[Title|original]]` otherwise, so the sentence reads as written.
- After a successful link the editor re-renders, so the note moves from
  mentions to backlinks, and a toast reads `Linked in <title>`.
- A mentioning note that has a pending draft in the drafts store shows its
  Link button disabled with the text "Unsaved changes" and a matching
  tooltip, because a later draft save would overwrite the link.
- Rendering reads the drafts store asynchronously; a render that finishes
  after a newer one started is discarded.

## Documentation and verification

- `guide.html` `#linking` gains an "Unlinked mentions" bullet. README's
  linking bullet mentions it; `tests/README.md` gains the spec.
- `tests/unlinked-mentions.spec.js`, three browsers: mention detection
  with code, link, boundary, trash, and self exclusions plus the excerpt;
  linking with alias-preserving casing and the move to backlinks; short and
  untitled titles; the disabled draft row; hidden when nothing mentions
  the note. `tests/wikilinks.spec.js` stays byte-identical and green.
- The module joins the script order, the offline shell list, and the
  jsconfig include. No inline script changes. `SCRATCHPAD_VERSION` moves
  to 3.22.0; deploy gated on an explicit yes.

## Out of scope

- Linking every mention at once, mentions of aliases or of other notes'
  titles inside the open note, persisted indexes, and fuzzy matching.
