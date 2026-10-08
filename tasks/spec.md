# Spec: open tasks on Home

Vinny proposed this on 2026-10-08 and asked for the spec after the revision
diff shipped in #30. Status: draft, awaiting approval. The design record
`docs/superpowers/specs/2026-10-08-open-tasks-design.md` is written with the
first implementation commit.

Branch: a fresh branch from `main` once #30 merges. One draft PR.

## Goal

Home lists every unchecked `- [ ]` line across active notes, each row showing
the task text and the note it lives in. Ticking a row rewrites that one
character in the note the same way the rendered checkbox does, and the row
leaves the list. Nothing is stored and nothing is uploaded; the list is
recomputed from note bodies already in memory, the way backlinks and unlinked
mentions are.

## Inputs

- `Markdown.findTaskMarkers(src)` in `public/js/markdown.js`: every GFM task
  marker outside fenced code, as `{ offset, checked }` where `offset` indexes
  the state character inside the brackets.
- `mutateNoteBody(noteId, transform, { coalesceToggles: true })` in app.js:
  re-reads the record from IndexedDB, retries on a cross-tab conflict,
  snapshots at most one revision per note per five minutes, broadcasts, and
  patches `state.notes`.
- `DB.getAllDrafts()` for notes with an unsaved draft, as mentions uses it.
- `HomeDesk.init(deps)` and `draw()` in `public/js/home-desk.js`, which
  already receive `state`, `isArchived`, `isTrashed`, `deriveTitle`, and
  `openNote` (`selectNote`).
- The Home section pattern in `index.html` (`home-desk-section`, a titled
  head with an inline SVG, a list) and the focus key scheme
  `data-desk-focus`.

## Outputs

- `public/js/open-tasks.js` exporting the frozen `window.ScratchpadOpenTasks`
  with `init(deps)`, `draw()`, and the pure `collect(notes, lookups)` that
  returns rows of `{ noteId, offset, text, line }`.
- `index.html`: a new `#home-desk-tasks` section between Recently edited and
  Tags, with `#home-desk-task-list`, `#home-desk-task-count` in the head,
  and `#home-desk-task-more` for the overflow line; hidden by default.
- `home-desk.js`: `init` passes its deps through to
  `ScratchpadOpenTasks.init`, and `draw` calls `ScratchpadOpenTasks.draw()`
  after the view renders. `types/home-desk.d.ts` `DeskDeps` gains
  `mutateNoteBody` and `getDrafts`.
- app.js: the existing `HomeDesk.init({...})` call gains `mutateNoteBody`
  and `getDrafts` on an existing line, so app.js nets zero lines and its
  ceiling holds at 5,982.
- CSS: `.home-desk-task-row`, `.home-desk-task-check`, `.home-desk-task-text`,
  `.home-desk-task-note`, `.home-desk-task-more` in the Home block of
  app.css, tokens only. The check reuses the `.task-checkbox` look.
- Module wiring: `<script>` after `home-desk.js` and before app.js,
  `APP_SHELL`, `jsconfig.json`, a row in `tests/README.md`, the guide's
  Home section, and the coverage workflow visiting the section once.

## Behavior

- **Scope.** Active notes only: not archived, not trashed. Unchecked markers
  only. Rows order by the note's `updatedAt`, newest first, then by document
  order within a note. Fenced code is skipped by the scanner; indented code
  is not, matching the rendered checkboxes today.
- **Row.** A checkbox button (`role="checkbox"`, `aria-checked="false"`,
  label "Mark done: <text>") and a note button (label "Open <title>"). The
  text is the line after the marker with leading quote markers and list
  markers removed, trimmed, and clipped to 140 characters with an ellipsis.
  Markdown inside the line stays literal.
- **Ticking.** The checkbox calls `mutateNoteBody` with a transform that
  re-scans the latest body. It picks the marker at the recorded offset when
  the line there still carries the recorded text; otherwise the first
  unchecked marker whose line carries that text; otherwise it returns the
  body unchanged and the row shows a toast, "That task moved. Open the note
  to update it." A successful tick redraws the section, so the row leaves
  the list and focus moves to the next row's checkbox, or to the section
  heading when none remains.
- **Drafts.** Rows for a note with an unsaved draft render with
  `aria-disabled="true"` and the title "Finish the note's draft first", as
  unlinked mentions do, because a tick would write under the draft.
- **Counts.** The head shows the total, "Open tasks · 12". The list shows at
  most 25 rows; beyond that a muted line reads "Showing 25 of 61. Open a
  note to see the rest." With no open tasks the section hides.
- **Cost.** Markers are memoized per note on `updatedAt`, so a Home redraw
  rescans only notes that changed since the last draw.
- **Phones.** Home is desktop and tablet only today; nothing changes there.

## Constraints

- No network calls, no `innerHTML`, no inline scripts, no new tokens, no
  dark-mode rules in app.css, no emoji in source. Every string lands through
  `textContent`.
- New module: `// @ts-check`, script-level `'use strict'`, block scope, JSDoc
  types, under 400 lines, no function over 40 lines, nesting at most 3.
  `home-desk.js` and `home-desk-view.js` stay under 400.
- app.js nets zero or fewer lines. The test file stays under 400 lines.
- The module never reads `state` directly; it gets `notes()`, `isArchived`,
  `isTrashed`, `deriveTitle`, `openNote`, `mutateNoteBody`, `getDrafts`, and
  `toast` through `init`.
- Toggles reuse `coalesceToggles`, so ten ticks in five minutes on one note
  store one revision, the same as ticking in the rendered note.

## Edge cases

- A line like `- [ ]` with no text after the marker shows as "(empty task)".
- A marker inside a blockquote (`> - [ ] call`) lists with the quote marker
  stripped and toggles in place.
- The same task text twice in one note: the offset match wins; if the line
  moved, the first unchecked line with that text is the one ticked.
- A note changed in another tab between draw and tick: `mutateNoteBody`
  re-reads the latest body, so the text match runs against current content.
- A note whose body is at `NOTE_BODY_MAX`: scanning is linear and memoized,
  so one large note costs one pass per edit.
- Ticking while the same note is open in the editor cannot happen from
  Home, because Home ends when a note is selected; the draft guard covers
  the unsaved-edit case.
- Daily notes list like any other note, with their date as the title. The
  monthly review's Open loops heading stays empty; filling it is a later
  idea.

## Anti-goals

- No stored task index, no sync, no due dates, priorities, or sorting
  controls.
- No change to how checkboxes behave inside the open note, to
  `findTaskMarkers`, or to `mutateNoteBody`.
- No palette command and no stage of its own; the list lives on Home.
- No inline editing of task text from Home.

## Acceptance criteria

1. With two active notes holding unchecked tasks, one archived note with a
   task, one trashed note with a task, and one checked task, Home lists only
   the unchecked tasks from the active notes, newest note first, each with
   its note title.
2. Ticking a row stores the note with that one `[ ]` turned to `[x]`, leaves
   every other character unchanged, and removes the row.
3. When the task line moved before the tick, the tick still finds it by
   text; when it no longer exists, the body is unchanged and the toast shows.
4. A task inside a fenced code block is not listed.
5. Rows for a note with an unsaved draft are disabled and do not write.
6. With 30 open tasks the list shows 25, the head shows 30, and the
   overflow line names both numbers. With none, the section is hidden.
7. The note button opens that note and ends Home.
8. Three ticks on one note inside five minutes store one revision.
9. Space on a focused checkbox ticks it, and focus lands on the next row.
10. `npm run verify` passes and the Chromium suite passes apart from the
    iPhone-emulation tests this container cannot launch.

## Test stubs

```js
// tests/open-tasks.spec.js
test('Home lists unchecked tasks from active notes, newest note first');
test('ticking a row rewrites that one marker and removes the row');
test('a moved task is found by its text and a vanished one shows a toast');
test('fenced code, checked tasks, archived and trashed notes are excluded');
test('rows for a note with an unsaved draft are disabled');
test('the head counts every task, the list caps at 25, and empty hides');
test('the note button opens the note');
test('ticks within five minutes share one revision');
test('Space ticks the focused row and focus moves to the next');
```

## Assumptions

- Home ends on note selection, so the open-note editing path never overlaps
  a Home tick; the draft check is the only guard needed.
- 25 rows and 140 characters are the right caps; both are constants in the
  module and easy to change.
- The section sits between Recently edited and Tags. If you would rather it
  lead, say so and it moves above Recently edited.
