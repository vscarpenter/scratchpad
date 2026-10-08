# Spec: note navigation follow-ups

Vinny approved these four follow-ups on 2026-10-08 after Home shipped in #27.
The design record is `docs/superpowers/specs/2026-10-08-note-navigation-design.md`.

Branch: `claude/busy-keller-sj34zq`, restarted on `main` at 792c643. One
draft PR.

## Goal

1. The note's ⋯ menu downloads only that note as Markdown and offers print.
2. The note header breadcrumb navigates: Home › folder › title.
3. Home shows the most used tags as chips that apply the tag filter.
4. `?` opens a keyboard shortcuts sheet.

## Inputs

- `exportMarkdownZip()` and the `#export-overflow-btn` listener in app.js;
  `#overflow-menu` in index.html; `ScratchpadAttachments.forZip`.
- `renderBreadcrumb()` in app.js; `.note-breadcrumb` rules in app.css;
  `HomeDesk.goHome`; `setFolderView`; `VIRTUAL_FOLDER_KEY`.
- `public/js/home-desk-view.js` and `home-desk.js`; `setTagFilter` and
  `openTagManager` in app.js.
- The About dialog's `.shortcut-list`; `commandDefinitions()`.

## Outputs

- `#export-overflow-btn` reads "Download as Markdown"; new
  `#print-overflow-btn` "Print or save as PDF…".
- `public/js/note-breadcrumb.js` (`window.ScratchpadBreadcrumb`) and
  `<template id="tpl-home-icon">`.
- `#home-desk-tags` section with `#home-desk-tag-list` and
  `#home-desk-manage-tags`.
- `public/js/shortcuts-sheet.js` (`window.ScratchpadShortcuts`) and
  `#shortcuts-dialog`.

## Constraints

- No network calls, no `innerHTML`, tokens only, no new tokens, no dark-mode
  rules, no inline-script edits, no emoji.
- app.js is at 6,004 lines against a 6,005 ceiling; the change nets negative
  and the ceiling tightens.
- New modules: `// @ts-check`, script-level `'use strict'`, block scope,
  frozen export, JSDoc types, v18 limits; listed in `jsconfig.json`,
  `APP_SHELL`, and the script order ahead of app.js.
- Test files stay under 400 lines, with no function over 40 lines.

## Edge cases

- A note whose title slugs to nothing downloads as `untitled-note.md`.
- A note with images in a folder: the ZIP keeps the `.md` at its root so
  `attachments/...` links resolve.
- Trash: both note-menu export items hide.
- A daily note's folder crumb opens Daily Notes; an unfiled note's opens the
  Notes folder; a note in a deleted folder heals to Notes.
- Archived and trashed notes: plain labels, no buttons.
- Phones: no Home crumb.
- A tag on archived or trashed notes only does not count on Home.
- More than 12 tags: the 12 most used show; Manage tags reaches the rest.
- `?` inside the search box, the editor, the title input, or any dialog
  does nothing new; Shift is allowed, other modifiers are not.

## Anti-goals

- No change to the backup menu's ZIP, to the palette's export command, or to
  how a tag filter behaves once applied.

## Acceptance criteria

1. Download as Markdown from a note's menu saves one `.md` with that note's
   frontmatter and body and nothing from other notes.
2. With an image, it saves a `.zip` holding the `.md` and the image, and the
   body links to `attachments/...`.
3. A single-note download leaves the backup reminder unchanged; the backup
   menu ZIP still records a backup.
4. Print or save as PDF calls the browser's print.
5. Neither item shows for a note in Trash.
6. For a note in a folder, clicking the folder crumb shows that folder in
   the list; clicking Home shows Home.
7. Daily and unfiled notes route to Daily Notes and Notes.
8. At 390px wide the Home crumb is hidden.
9. Home lists tags with counts, most used first; clicking one opens the
   first tagged note with the filter applied; Manage tags opens the manager.
10. `?` opens the shortcuts sheet with every About entry plus `?`; typing `?`
    in search or the editor does not; Escape closes it.
11. The palette's Keyboard shortcuts command opens the sheet.
12. `npm run verify` passes; the Chromium suite passes apart from the
    iPhone-emulation tests this container cannot launch.

## Test stubs

```js
// tests/note-menu.spec.js
test('Download as Markdown saves only the open note');
test('a note with an image downloads as a ZIP with its attachment');
test('a single-note download is not a backup');
test('Print or save as PDF calls the browser print');
test('a note in Trash shows neither item');
// tests/breadcrumb.spec.js
test('the folder crumb opens that folder and Home opens Home');
test('daily and unfiled notes route to their folders');
test('archived notes keep a plain label');
test('phones hide the Home crumb');
// tests/home-desk.spec.js
test('Home lists tags by use and a tag opens its filter');
test('Manage tags opens the tag manager');
// tests/shortcuts-sheet.spec.js
test('? opens the shortcuts sheet with the About list');
test('typing ? in a field does not open the sheet');
test('the palette opens the shortcuts sheet');
```

## Assumptions

- "Print or save as PDF" relies on the existing print stylesheet; no new
  print rules.
- Feature PRs do not bump the version.
