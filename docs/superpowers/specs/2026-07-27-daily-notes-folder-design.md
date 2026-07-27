# Managed Daily Notes folder — design spec

Date: 2026-07-27
Status: approved

## Overview

Create a managed folder named **Daily Notes** and file every note identified by
the existing `dailyDate` field into it. Existing daily notes, the first-run
seeded daily note, daily notes created from the calendar button or command
palette, and notes created by Quick capture all use the same folder.

The folder reuses the existing flat-folder model and sidebar accordion. No new
visual component, IndexedDB store, or backup schema is introduced.

## Goals

- Give daily notes a stable, automatic home in the folder view.
- Migrate existing daily notes without changing their edited dates or history.
- Keep the behavior local-only and compatible with current backups.
- Preserve the existing title-independent `dailyDate` identity.
- Prevent ordinary folder actions from breaking the daily-note guarantee.

## Managed folder identity

The folder has a deterministic id and canonical name:

```js
const DAILY_NOTES_FOLDER_ID = 'scratchpad-daily-notes';
const DAILY_NOTES_FOLDER_NAME = 'Daily Notes';
```

The name is reserved for this folder. The folder may be collapsed and
reordered, but it cannot be renamed or deleted. Its folder menu retains only
the keyboard-accessible Move up and Move down actions.

The managed folder does not consume one of the 100 user-created folder slots.

## Reconciliation and migration

An idempotent reconciliation runs during `loadAll()` after folders and notes
are loaded and before the first render.

1. If the managed id exists, its canonical name is restored.
2. If no managed id exists but a case-insensitive `Daily Notes` folder does,
   that folder is adopted: its order, color, timestamps, and existing
   membership are preserved under the managed id.
3. Otherwise, the folder is created at the top of the initial folder order.
4. Every note with a valid `dailyDate`, including a trashed note, receives the
   managed `folderId`.

Folder-only changes preserve `updatedAt`, create no revision, and do not
interfere with a dirty editor in another tab. Reconciliation is safe to repeat
after imports or interrupted writes.

## Creation and interaction rules

- `createDailyNote()` reconciles the folder and writes its id on the new note.
- The first-run seed remains decoupled from folder constants; reconciliation
  files its daily note when the user returns from the About page.
- A daily note row is not draggable.
- Move-to-folder actions are hidden for a single daily note.
- Bulk moves ignore selected daily notes and announce that they remain filed.
- The Daily Notes folder is not offered as a destination for ordinary notes.
- "New note here", Rename, and Delete are hidden from its folder menu.
- Defensive mutation guards enforce the same rules if an action is invoked
  outside the visible UI.
- Duplicating a daily note creates an ordinary copy in Notes.

The `Daily template` note is not a daily note unless it has a `dailyDate`; it
stays wherever the user files it.

## Backup, import, and export

JSON and encrypted backups remain at schema version 3. They already preserve
folder records and note `folderId` values. The import folder allowance becomes
100 user folders plus the managed folder.

After import, the normal `loadAll()` reconciliation files daily notes from
older or flat backups. Markdown ZIP export automatically places managed daily
notes under `daily-notes/`.

## Cross-tab behavior

Folder-membership-only broadcasts refresh `folderId` in another tab without
marking note content as externally changed. Folder creation/adoption continues
to use the existing `folders-changed` broadcast.

## Verification

- Playwright coverage for creation, reuse, migration, first-run seed, Quick
  capture, action URLs, protected controls, duplicate behavior, folder-name
  collision, backup/import, Markdown ZIP, trash/restore, and cross-tab filing.
- Targeted Chromium tests first, followed by the full one-worker
  Chromium/Firefox/WebKit suite.
- Manual local-browser check of the folder accordion, editor eyebrow, menu
  keyboard behavior, and mobile sidebar.

