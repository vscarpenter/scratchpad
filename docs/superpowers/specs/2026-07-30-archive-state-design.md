# Archive state for notes — design spec

Date: 2026-07-30
Status: approved

## Overview

Add Archive as a third, mutually exclusive note lifecycle state alongside
Active and Trash. Archive removes completed or infrequently needed notes from
the ordinary working collection without starting Trash's deletion clock.

Archive is a lifecycle view, not a folder. Archived notes retain their content,
folder membership, tags, pin, revisions, links, and local-only storage
guarantees. Only an explicit Archive, Unarchive, Trash, Restore, import, or Undo
action changes lifecycle state; editing never does.

## Lifecycle model

Every note is in exactly one visible lifecycle state:

| State | `archivedAt` | `deletedAt` |
| --- | --- | --- |
| Active | `null` | `null` |
| Archived | timestamp | `null` |
| Trashed from Active | `null` | timestamp |
| Trashed from Archive | retained timestamp | timestamp |

`deletedAt` takes display precedence whenever both timestamps exist. Existing
records and version 2/3 backups normalize missing or invalid `archivedAt` to
`null`.

Transitions:

- Archive sets `archivedAt` without changing `updatedAt`.
- Unarchive clears `archivedAt` without changing `updatedAt`.
- Move to Trash sets `deletedAt` and preserves `archivedAt`.
- Restore clears only `deletedAt`, returning the note to Active or Archive.
- Re-archiving a previously unarchived note sets a new Archive date.
- Trash → Restore back to Archive preserves the original Archive date.
- Archived notes never expire automatically. They remain subject to the same
  browser-storage risks as Active notes.

Archive/Unarchive execute immediately, show a success toast with Undo, and do
not require confirmation. Trash and permanent deletion retain their existing
protections.

## Persistence and compatibility

Add nullable `archivedAt` to normalized note records. Keep IndexedDB at version
3: the notes store accepts optional fields and Archive does not require an
index because Scratchpad already loads its local note set into memory.

Native JSON backup schema advances to version 4:

- `notes` continues to contain all non-trashed notes, including archived ones.
- Archived records carry `archivedAt`.
- `trashedNotes` may carry `archivedAt` to remember a prior Archived state.
- Version 2/3 imports remain supported and normalize notes as Active unless
  they are in `trashedNotes`.
- The encrypted-backup envelope version does not change.
- Import as duplicates preserves the imported lifecycle state. This differs
  deliberately from the in-app Duplicate action.

Revision restore remains content-oriented. It restores title, body, tags, and
pinning while preserving the note's current lifecycle and folder. Lifecycle
changes do not create revision snapshots.

## Navigation and Archive view

The sidebar lifecycle switch becomes:

**Notes · Archive · Trash**

Search remains scoped to the current lifecycle view and retains its query when
switching views, matching current Notes/Trash behavior. Notes search does not
surface archived records.

Archive supports the existing Folders/Recent grouping choice:

- Folders shows only non-empty archived folder groups.
- Folder names are browse-only section headers in Archive.
- Empty folders, the New folder row, and folder-management menus are omitted.
- Archived notes may still use Move to folder.
- Recent is flat and groups by Archive date.
- Search temporarily flattens results.
- The grouping preference remains shared with Notes.

Archive rows sort by `archivedAt`, newest first, within both folder and Recent
groupings. Their compact timestamp reads “Archived …”. Editing an archived note
updates its content timestamp but does not move its Archive row.

If Notes has no Active notes but Archive is populated, its empty state says:

- **No active notes**
- **Your archived notes are still available.**
- Actions: **New note** and **View Archive**

Archive's empty state says:

- **Archive is empty**
- **Archived notes will appear here.**

## Opened-note treatment

Archived notes remain fully editable. Saving, task toggles, tag changes,
pinning, link rewriting, folder moves, history restore, sharing, and individual
export do not unarchive them.

Use location and metadata rather than a prominent status badge:

- Breadcrumb: `Archive / Project Alpha` or `Archive / Notes`
- Metadata: `Archived Jul 30 · Last edited Jul 12`
- Dormant pin marker: subtle, accessible as “Pinned when active”
- Pin action wording: **Pin when active** / **Unpin when active**

Dormant pins do not affect Archive grouping or ordering. Unarchiving restores
their normal priority.

## Actions and navigation

Single-note actions live in the note overflow menu:

- Active: Archive, Move to Trash
- Archived: Unarchive, Move to Trash
- Trash: Restore, Delete forever

Bulk actions live in the existing selection toolbar:

- Notes: Move to folder, Archive, Move to Trash
- Archive: Move to folder, Unarchive, Move to Trash
- Trash: Restore, Delete forever

Single-note Archive/Unarchive follows the note into its destination view and
keeps it open. Bulk actions stay in the source view, remove affected rows, exit
selection mode, and offer Undo.

Archive/Unarchive preserve an open dirty editor and draft. The sidebar changes
views while the editor remains open; a later Save preserves the selected
lifecycle. Trash retains its current discard/conflict protection.

Command palette additions:

- View Archive
- Archive note when an Active note is selected
- Unarchive note when an Archived note is selected

Note search results identify archived records as “Open note in Archive.”
Archive ships without a dedicated global keyboard shortcut.

The ordinary Duplicate action always creates an Active working copy. It copies
content and tags, preserves the folder for ordinary notes, clears the pin and
Archive date, and continues to turn a copied Daily Note into an ordinary,
unfiled note.

## Folders and tags

Lifecycle changes never change folder membership.

Deleting a folder applies the selected outcome to all member notes:

- Keep notes removes folder membership from Active and Archived notes without
  changing lifecycle.
- Move notes to Trash moves both populations while retaining prior lifecycle
  state for Restore.
- The confirmation reports separate active and archived counts.

The managed Daily Notes folder remains protected.

Manage tags operates over Active and Archived notes as one preserved namespace,
excluding Trash. Counts distinguish active and archived usage. Filter stays in
the current preserved view when it has matches there; otherwise it switches to
the other preserved view, preferring Notes when invoked from Trash.

## Daily Notes and Quick Capture

Daily Notes may be archived. They retain `dailyDate` and the managed Daily Notes
folder in every lifecycle state.

If today's Daily Note is archived:

- Open today's note switches to Archive and opens the existing note.
- Quick Capture appends to that note without unarchiving it.
- Neither action creates a duplicate.

Only an Active note titled `Daily template` supplies content for new Daily
Notes. Archiving the template deactivates it; unarchiving reactivates it.

Archive is always explicit. Scratchpad does not automatically archive old Daily
Notes or any other note.

## Wikilinks and backlinks

Active and Archived notes remain one knowledge graph:

- Wikilinks to archived targets remain resolved.
- Following one switches to Archive and opens the target.
- Backlinks include Active and Archived sources.
- Autocomplete suggests archived targets with a subtle Archived label.
- Renaming a linked note may rewrite links in both Active and Archived notes.

Trash remains excluded from resolution, backlinks, and autocomplete.

## Cross-tab behavior

Archive/Unarchive broadcasts are lifecycle-only changes, parallel to the
existing folder-only refresh:

- A dirty editor in another tab remains open.
- Its lifecycle/location indicator refreshes.
- Its sidebar row moves to the appropriate view.
- A quiet informational toast explains the external change.
- Saving preserves the lifecycle selected in the other tab.

Moving a note to Trash remains a conflicting external mutation and retains the
current save-conflict protection.

## Export and import

Native JSON and encrypted backups include all lifecycle states under schema
version 4.

Markdown ZIP export includes all non-trashed notes:

- Active files retain their current folder paths.
- Archived files live under `archive/`.
- Folder membership is nested below that prefix, for example
  `archive/projects/old-launch-plan.md`.
- Archived Daily Notes use `archive/daily-notes/`.
- Trashed notes remain excluded.

Archived Markdown frontmatter adds an ISO `archivedAt` field. Active files omit
it. Markdown import honors valid `archivedAt`, allowing individual files to
round-trip Archive state without depending on their ZIP path.

## Diagnostics, documentation, and accessibility

- Diagnostics reports Active, Archived, and Trashed counts separately.
- Backup guidance continues to cover the entire local dataset.
- README, Guide, About, and feature coverage documentation explain Archive,
  Restore versus Unarchive, keyboard access through the command palette, and
  backup compatibility.
- Archive actions and dormant pin state have explicit accessible names.
- The three-view switch remains keyboard and touch accessible at mobile widths.
- Focus remains stable when actions move a note between lifecycle views.
- No remote dependencies, telemetry, or user-content requests are introduced.

## Out of scope

- Automatic or age-based archiving
- Nested or special Archive folders
- A dedicated Archive keyboard shortcut
- Archive-specific retention limits
- A lifecycle status enum or IndexedDB store migration
- Search operators such as `state:archived`

## Verification

- Characterization and failing tests before implementation.
- Targeted Chromium coverage for lifecycle transitions, Undo, navigation,
  dirty drafts, grouping, folder deletion, Daily Notes, tags, wikilinks,
  cross-tab behavior, backup v4, and Markdown round-trip.
- Full one-worker Chromium/Firefox/WebKit suite.
- Manual local-browser verification in light/dark themes and desktop/mobile
  layouts.
- JavaScript syntax checks and CSP hash verification.

