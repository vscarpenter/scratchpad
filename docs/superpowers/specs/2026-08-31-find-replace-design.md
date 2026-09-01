# Find and replace — design spec

Date: 2026-08-31
Status: approved

## Decision

Add in-note find and replace to the Markdown editor, opened with
`⌘/Ctrl+F` while editing. The surface is a quiet overlay bar docked over the
top of the note stage — a tool over text that stays visible, not a modal
`<dialog>`, matching the `wikilink-suggest` overlay precedent. Matching is
literal and case-insensitive by default, with a case-sensitivity toggle and a
regular-expression toggle; an invalid pattern deactivates matching with a muted
inline notice. Replacement flows through the existing editor mutation pattern
so drafts, dirty state, and the save flow work unchanged.

## Goals

- Let a power user locate and rewrite text inside the open note without
  leaving the keyboard or losing sight of the editor.
- Keep the bar calm: no modal, no animation, flat surface, hairline border,
  Indigo accent only where focus and active state already live.
- Preserve every standing contract: local-only and zero network calls, draft
  autosave, revisions, focus mode, mobile layout, tokens-only styling, and the
  inline-script CSP hashes (new code lives in an external module file).
- Ship as v3.19 on the one-feature-per-release cadence.

## Interaction contract

- The bar is hidden outside edit mode. `⌘/Ctrl+F` opens it and focuses the
  find field **only while editing**; while browsing the keystroke falls
  through to the browser's native find untouched.
- The bar is `role="toolbar"` labelled "Find in note", with two compact
  rows: find input, muted match counter, `Aa` case chip, `.*` regex chip, and
  a close control; below it the replace input, Replace, and Replace all.
- Match counter reads "N of M" and updates live as the query, the note text,
  or a toggle changes. An empty query hides the counter; zero matches reads
  "0 of 0"; an invalid regex hides the counter and shows a muted
  "Invalid pattern" notice. A visually hidden polite live region announces
  the same counts so matching state is never color-only.
- Keyboard: `Enter` next match, `Shift+Enter` previous match (both wrap
  end-to-end), `⌘/Ctrl+Enter` replaces the focused match, `Escape` closes the
  bar and returns focus to the editor. Tab order is natural; the bar never
  traps focus.
- The focused match is presented as the textarea's native selection
  (`setSelectionRange` plus focus, relying on native caret scrolling). There
  is no mirror-overlay highlight — the selection is the cue.
- A "Find in note" command-palette entry appears while editing, with
  "⌘/Ctrl+F — find and replace in this note" as its meta text.
- Closing the bar on leaving edit mode; toggle states (case, regex) persist
  for the session only and are never written to storage, matching the
  focus-mode precedent.

## Matching and replacement contract

- Default mode is literal, case-insensitive. The `Aa` chip toggles
  case-sensitive matching; the `.*` chip toggles JavaScript regex source
  semantics with global matching applied internally.
- Replacement is raw text in literal mode. In regex mode the replacement
  follows JavaScript `String.prototype.replace` semantics, so `$1`–`$9` and
  `$&` capture references work.
- **Replace** swaps the focused match using the `applyEditorFormat` house
  pattern (`setRangeText` plus a dispatched `input` event), leaving the
  selection where the replacement ends so repeated Replace steps forward
  through the note. The dirty indicator and draft autosave engage exactly as
  they do for formatting chips.
- **Replace all** rewrites every match in one value change, toasts
  "Replaced N occurrences", and is disabled while there is no match.
- Toggling case or regex re-runs the query from the top of the note and
  clears the focused match when it no longer matches.

## Accessibility and responsive contract

- Labeled controls (visually hidden labels or `aria-label` per house
  pattern), `aria-pressed` toggle chips, visible focus outlines, and no
  color-only state cues.
- On narrow viewports the bar spans the note stage width without horizontal
  scrolling; interactive targets are at least 44px and inputs keep a 16px
  font to avoid iOS focus zoom, matching the touch-target spec's standards.
- The bar remains available in focus mode, which is an editor surface.

## Documentation and verification

- `guide.html` gains a keyboard-shortcut row and a "Find and replace"
  section; the README shortcut table and `tests/README.md` coverage map gain
  their find-replace entries.
- Automated coverage: opens only while editing; live counter; Enter and
  Shift+Enter cycling with wraparound; case and regex toggles including the
  invalid-pattern notice; Replace dirties the note and writes the source;
  Replace all counts and toasts; Escape refocuses the editor; the palette
  entry; focus-mode availability; toolbar semantics and labels; 390px
  responsive bounds; existing network-isolation and design-token suites stay
  green and untouched.
- The module joins the offline app-shell precache list; `SCRATCHPAD_VERSION`
  moves to 3.19.0 at release.

## Out of scope

- Whole-word matching mode, search history, find across multiple notes,
  highlight-all mirror overlays, replacement previews or diffs, and any UI
  outside the note stage.
- Changes to browser find while browsing, changes to the modal dialog recipe,
  persistence of toggle state, and deployment (gated on an explicit
  "yes, deploy").