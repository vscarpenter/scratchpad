# Folders — design spec

Date: 2026-07-19
Status: approved

## Overview

Add folders as a second organizational axis alongside tags. A note lives in
exactly one folder (or in the built-in virtual "Notes" folder). Users can
create, rename, recolor, reorder, and delete folders; move notes between
folders by drag-and-drop or a universal "Move to folder…" menu; and collapse
or expand folder contents in the sidebar. Deleted notes keep the existing
Trash recovery path, now with a 30-day automatic purge; immediate permanent
delete remains the no-recovery option.

## Goals

- Group notes into flat (non-nested) folders in v1.
- Preserve the existing recency-grouped sidebar as a switchable view.
- Zero data migration for existing users.
- Folders survive backup/export/import round-trips (plain and encrypted).
- Every move operation reachable without drag-and-drop (touch, keyboard).

## Non-goals (out of scope for v1)

- Nested folder UI (the data model reserves `parentId`, always `null` in v1).
- Mapping directories to folders on markdown ZIP *import*.
- Per-note trash countdown labels.
- Smart folders / saved searches.

## Data model

### New `folders` object store (IndexedDB v2 → v3)

```js
{
  id: string,          // uuid
  name: string,        // trimmed, whitespace-collapsed, 1–60 chars
  color: string|null,  // null | 'accent' | 'olive' | 'sky' | 'gray'
  sortOrder: number,   // manual order, renumbered on reorder
  parentId: null,      // reserved for future nesting; always null in v1
  createdAt: number,
  updatedAt: number,
}
```

The `onupgradeneeded` handler creates the store (keyPath `id`) and nothing
else — no bulk writes inside the upgrade transaction. No IndexedDB index on
the store; the app loads all folders into memory and sorts in JS.

Folder name rules: case-insensitive unique; `"Notes"` (any case) is reserved
for the virtual folder. Cap: 100 folders (`FOLDERS_MAX`), matching the
existing limit-constant style.

`ScratchpadDB` gains folder CRUD (`getAllFolders`, `putFolder`,
`removeFolder`, `bulkPutFolders`) following the existing promise-wrapper
pattern, and `importRecords` accepts folder rows in the same transaction.

### Note changes

`normalizeNote()` gains `folderId: string|null`. `null` means the virtual
"Notes" folder. A `folderId` referencing a folder that does not exist heals
to `null` at normalize time (covers corrupt imports and folder-delete races).

**Revisions do not record `folderId`.** Restoring a revision restores content
(title/body/tags) but never moves the note. Likewise, moving a note between
folders does not touch `updatedAt` and does not create a revision — a move
never shuffles recency order or pollutes history. Drafts are untouched.

### Virtual "Notes" folder

Notes with `folderId: null` belong to the built-in "Notes" folder. It always
exists, renders last in the folder list, and cannot be renamed, recolored,
reordered, or deleted. New notes are created in it unless created via a
folder's "New note here" action.

## Sidebar UI

### Group-by toggle

The Notes view gets a segmented toggle, **Folders | Recent**, persisted in
`localStorage['scratchpad:notesGrouping']`. Default for all users (new and
existing): `folders`.

- **Recent** is exactly today's rendering: global Pinned section + date
  buckets (Today / Yesterday / This week / Earlier). Unchanged code path;
  Trash continues to use it.
- **Folders** renders an accordion. Each folder is a header row — chevron,
  optional color dot, name, active-note count, hover "…" menu — with its
  notes inside, sorted pinned-first then `updatedAt` descending.

In Folders mode there is **no global Pinned section**: a pinned note floats
to the top of its own folder. Folder counts therefore match visible rows.
The global Pinned section remains in Recent mode.

### Accordion behavior

- Clicking a folder header toggles collapse/expand. Headers are real
  `<button>` elements with `aria-expanded`, ≥44px touch targets.
- Collapse state persists in `localStorage['scratchpad:collapsedFolders']`
  (array of folder ids; the virtual folder uses the sentinel `'__notes__'`).
- A **"+ New folder"** row sits at the bottom of the accordion.
- The virtual Notes section is collapsible like any other.
- Search results remain a flat list in both modes (existing behavior).

### Per-folder "…" menu

Rename, Change color (opens the folder dialog), New note here, Move up,
Move down (keyboard-accessible reorder), Delete.

## Moving notes

### Drag-and-drop (native HTML5)

Folders mode only:

- Note rows are `draggable`. Drop targets are folder headers, including
  "Notes". `dragover` highlights the target with an accent outline
  (`.is-drop-target`). Dropping moves the note. Collapsed folders accept
  drops without expanding. Dropping a note on its current folder is a no-op
  (no write).
- Folder headers are also draggable to **reorder folders**: an insertion
  line renders between folders; drop renumbers `sortOrder`. The virtual
  Notes folder is not a reorder participant.
- Drag payloads use custom data types
  (`application/x-scratchpad-note` / `application/x-scratchpad-folder`)
  carrying the id, with a `text/plain` fallback, so note-drags and
  folder-drags cannot be confused.

### "Move to folder…" menu (universal fallback)

Opens a folder-picker dialog (folders in sort order + Notes; current folder
marked and disabled). Available from:

1. the note's overflow menu in the editor,
2. bulk-select mode, as a bulk action (moves all selected),
3. the command palette ("Move to folder…" for the active note, plus a
   "New folder…" action).

The editor's eyebrow line shows the note's current folder name.

## Folder create / rename / delete / color

One folder `<dialog>` (existing dialog pattern) serves create and edit:
name field + a color row of five swatches (none / accent / olive / sky /
gray), all via CSS custom properties — no hex in `app.css` — AA-checked in
both themes. Inline validation: empty, duplicate (case-insensitive),
reserved name, over-length.

**Delete** confirms with a choice when the folder contains notes:

- **Move N notes to Notes** — notes drop to the virtual folder, or
- **Move N notes to Trash** — notes are trashed with the normal 30-day
  window.

Empty folders get a plain confirm. The folder row itself is hard-deleted;
the notes are what is protected. Restoring a note whose folder is gone lands
it in Notes (the `folderId` heal).

## Trash retention

On app startup, before first render, a purge pass permanently deletes any
note with `deletedAt` older than 30 days
(`TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000`), using the existing
`deleteNoteEverywhere` (note + drafts + revisions), then broadcasts a
refresh on the cross-tab channel. The Trash view header gains one static
line: "Notes in Trash are deleted forever after 30 days." Per-note
**Delete forever** and **Empty trash** are unchanged and remain the
immediate, no-recovery paths.

## Integration points

- **JSON backup/export:** payload becomes `schemaVersion: 3` and adds a
  `folders` array; notes carry `folderId`. Import accepts v2 (no folders —
  notes land in Notes) and v3. Imported folders are sanitized by a
  `normalizeFolder()` mirroring `normalizeNote()` (invalid color → null,
  non-finite sortOrder → list position). Folder id collisions overwrite by
  id (same as notes); a name collision with a *different* id gets a numeric
  suffix ("Name 2", incrementing until unique). Import limits gain
  `IMPORT_MAX_FOLDERS = 100`.
- **Encrypted backup:** wraps the same payload; its envelope version stays
  1, and its payload validation accepts inner `schemaVersion` 2 or 3.
- **Markdown ZIP export:** notes are placed in per-folder subdirectories
  (sanitized folder names; Notes at the root). Markdown import keeps its
  current flat behavior.
- **Cross-tab sync:** folder mutations broadcast on the existing
  BroadcastChannel exactly like note mutations; other tabs re-render.
- **First-run seed notes:** unchanged, live in the virtual Notes folder.
- **Guide page:** `guide.html` gets a short Folders section (create, move,
  reorder, delete semantics, 30-day trash window).
- **Version:** `3.3.0` in `public/js/version.js` at ship time.

## Edge cases & error handling

- Folder writes are single-row transactions via the existing promise
  wrapper; failures surface through the current error UI.
- Concurrency: last-write-wins + broadcast, matching notes. Deleting a
  folder open in another tab: that tab's notes heal to Notes on refresh.
- Duplicate-name validation applies at dialog time; import-time collisions
  use the suffix rule above.
- Deleting the folder of the currently open note while its editor is dirty:
  the note's `folderId` changes underneath, but content saves are unaffected
  (folder membership is not part of editor state).
- localStorage collapse entries for deleted folders are pruned on render.

## Testing

New Playwright spec `tests/folders.spec.js`:

- CRUD + validation (empty, duplicate, reserved, over-length names).
- Both delete paths (move to Notes / move to Trash) and empty-folder confirm.
- Move via editor menu, command palette, and bulk mode.
- Drag-and-drop: note → folder, note → Notes, no-op self-drop, folder
  reorder (Chromium `dragTo` / dispatched drag events).
- Collapse/expand persistence across reload; pruning of stale entries.
- Folders | Recent toggle persistence; Recent mode unchanged.
- Pinned-within-folder ordering; folder counts.
- Export/import round-trip: v3 → v3, and a v2 payload imports with all
  notes in Notes. Encrypted round-trip with folders.
- Markdown ZIP export contains folder subdirectories.
- Trash auto-purge: inject `deletedAt` 31 days old via `page.evaluate`,
  reload, assert the note and its revisions are gone; a 29-day-old note
  survives.
- Touch-target and accessibility coverage extended to folder headers,
  toggle, and dialogs.

TDD throughout; implementation follows the existing single-file IIFE
pattern in `app.js` with folder logic in clearly delimited sections.
