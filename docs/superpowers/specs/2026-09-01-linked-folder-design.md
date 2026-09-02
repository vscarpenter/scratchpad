# Linked plain-text folder — design spec

Date: 2026-09-01
Status: approved

## Decision

A user can link one local directory. Scratchpad writes every note there as
a Markdown file with frontmatter, in the same layout as the Markdown ZIP,
and reads the directory back on request and when the window regains
focus, so edits made in any text editor land in the note and edits made in
Scratchpad land in the file. The directory handle lives in the `settings`
store created by v4.0. The feature is detected on `showDirectoryPicker`,
so today it is Chromium-only and its controls are hidden elsewhere. The
words used are linked folder, write, read, reconnect, and unlink; the
product never says "sync", because nothing leaves the device and there is
no second device. Ships as v4.1.0.

## Goals

- Plain-text ownership: a linked folder is a readable, durable copy that
  outlives the browser profile and that other tools can edit.
- No new network surface and no new promise: the folder is a local
  mirror the user chose, and Scratchpad's IndexedDB stays the source of
  truth inside the app.
- Fail safe: files are never deleted except for a note the user trashed,
  a conflict never discards text without keeping it as a revision, and a
  lost permission degrades to a Reconnect control rather than an error.

## Layout contract

- Active notes: `<folder-slug>/<title-slug>.md`, unfiled at the root;
  archived notes under `archive/`; trashed notes have no file. Slugs and
  collision suffixes follow `exportMarkdownZip` exactly, and the path for
  each note is remembered so a rename or a move removes the old file.
- Frontmatter is the ZIP format plus `id: "<note id>"`, which the ZIP now
  emits too. The body is the note body with `attachment:` references
  rewritten to `attachments/<id>-<name>`; those files are written beside
  the notes.
- Reads map files to notes by the frontmatter id. A `.md` file without an
  id is a new note; it is created and the file is rewritten with its id
  on the next write. Files that disappear leave their notes untouched.

## Behavior contract

- Your data gains a "Linked folder" row: status text and, depending on
  state, Link a folder…, Write now, Read now, Reconnect, and Unlink.
  Linking asks for a directory with read-write access, writes every
  preserved note immediately, and shows the folder name.
- Every note write through `putNoteRecord` schedules a write of that note
  within a second; trashing a note removes its file. Write now rewrites
  everything.
- Read now, and a window focus at most once every ten seconds, walks the
  directory. For each file whose last-modified time is newer than the
  time Scratchpad last wrote it: if the note also changed since that
  write, the newer of the two wins and the other is stored as a revision;
  otherwise the file's title, tags, and body replace the note's. New files
  become new notes in the folder their directory names, unfiled otherwise.
- When `queryPermission` is not `granted`, the row shows Reconnect, which
  calls `requestPermission` from the click. Nothing is written or read
  until it is granted again.
- Unlink forgets the handle and the path map; files stay where they are.
- Errors toast once and never block saving: the note is saved in
  IndexedDB before any file work begins.

## Documentation and verification

- Guide: a "Linked folder" section; README; privacy page unchanged
  because nothing leaves the device; `tests/README.md`.
- `tests/linked-folder.spec.js` uses a picker stub that returns the
  origin-private file system, so the real code runs against a real
  directory on every engine that can persist the handle, and skips with a
  reason elsewhere: link and write; read after an external edit; a new
  external file; a conflict keeps the loser as a revision; trash removes
  the file; rename removes the old path; attachments are written and read
  back as references; unlink; the row is hidden without the API.
- The module joins the shell list and jsconfig; no CSP change. Version
  4.1.0; deploy gated on an explicit yes.

## Out of scope

- Importing images added to the folder by other tools, watching the
  directory with `FileSystemObserver`, multiple linked folders, Safari
  and Firefox support beyond feature detection, and any wording that
  implies devices staying in step.
