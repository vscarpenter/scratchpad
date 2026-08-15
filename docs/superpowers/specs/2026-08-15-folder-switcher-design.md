# Folder switcher — design spec

Date: 2026-08-15
Status: approved

## Decision

Replace the all-folders accordion with a **current-folder switcher**. The
sidebar shows either Home (pinned and recent notes) or one selected folder.
The picker is searchable and includes a compact management affordance for each
ordinary folder.

## Goals

- Keep growing libraries navigable without rendering every folder's notes in
  the same scroll region.
- Preserve local-only folders, current search behavior, move actions, folder
  management, and Daily Notes rules.
- Make the current location explicit and keep ordinary capture fast.

## Interaction contract

- **Home** shows the existing pinned section and date buckets across the
  selected lifecycle view.
- **Folders** opens a compact searchable picker. Selecting a folder persists
  the choice in `localStorage['scratchpad:folderView']` and renders only that
  folder's notes.
- The picker shows folder counts for the selected lifecycle view. Its action
  button keeps rename, color, create-here, reorder, and delete available for
  ordinary folders. Daily Notes retains its protection rules.
- Global text and tag search always flatten to results across every folder in
  the selected lifecycle view.
- In a selected ordinary folder, **New note** files the new note there. Home,
  Notes, and Daily Notes keep ordinary new notes in built-in Notes; the daily
  action remains the only way to create dated daily entries.
- Starting to drag an ordinary note opens the switcher. Dropping it on a
  picker row moves it without changing its edited time. The existing menu,
  bulk, and command-palette move paths remain available.
- Archive has the same Home/switcher browsing model but cannot create or
  manage folders. Trash does not show folder navigation.

## Migration

The former `scratchpad:notesGrouping` and collapsed-folder preferences are no
longer read. Existing notes and folders require no data migration. A stored
folder selection that no longer exists falls back to Home.

## Documentation and verification

The in-app About help, `guide.html`, and `about.html` describe Home, the
switcher, global search, current-folder capture, management, and drag-to-file.
Automated coverage verifies persistence, search, capture placement, picker
management, Daily Notes grouping, and the drag target.
