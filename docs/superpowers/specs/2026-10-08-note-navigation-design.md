# Note navigation follow-ups: design spec

Date: 2026-10-08
Status: approved

Vinny approved four follow-ups from the Folio comparison after Home shipped
in #27: note export from the note's own menu, a breadcrumb you can click,
tags on Home, and a keyboard shortcuts sheet.

## 1. The note menu exports the note you are in

The ⋯ menu inside a note said "Export Markdown ZIP" but exported every note,
because it shared `exportMarkdownZip()` with the backup menu. Folio's
per-page Export menu acts on the page, which is what people expect there.

- The item becomes **Download as Markdown** and exports only the open note:
  a `<title-slug>.md` file with the same frontmatter the ZIP uses. A note
  with images downloads as `<title-slug>.zip` holding the `.md` at the root
  and its images under `attachments/`, so the relative links resolve.
- A new **Print or save as PDF…** item runs the browser's print, which the
  existing print stylesheet already limits to the open note.
- Both items stay hidden for a note in Trash. A single-note download is not a
  backup, so it leaves the backup reminder alone. The backup menu and the
  palette keep the whole-library Markdown ZIP.

## 2. A breadcrumb you can click

Folio's "Home › Personal › title" path navigates. Ours was a label.

- For a note in Notes, the pill reads **Home › folder › title**. Home is an
  icon button that opens Home. The folder is a button that shows that
  folder's notes in the list, using the folder switcher's own scopes: the
  managed Daily Notes folder for daily notes and the built-in Notes folder
  for unfiled ones. The title stays plain text.
- Below 768px the Home button and its separator hide, because phones have
  Back and no Home screen.
- Archived and trashed notes keep their plain labels ("archive › folder",
  "trash › title"), since Home lives in the Notes view.
- The old "notes › pinned" special case goes away; pin state already shows
  in the list and the ⋯ menu.
- Rendering moves to `public/js/note-breadcrumb.js`, which pays for the
  other app.js lines in this change.

## 3. Tags on Home

Folio lists tags as chips. Ours were only reachable through the list menu.

- Home gains a **Tags** section after Recently edited: up to 12 chips for the
  most used tags across active notes, each with its count, most used first
  and then by name. A chip applies the existing tag filter, which ends Home
  and opens the first tagged note, as a tag filter does today.
- The section head carries **Manage tags**, which opens the existing tag
  manager. With no tags, the section hides.
- Chips use the tag pair already validated for AA: `--accent-text` on
  `--accent-soft`.

## 4. A keyboard shortcuts sheet

- Pressing **?** anywhere outside a text field, with no dialog open, opens a
  **Keyboard shortcuts** dialog. The palette and command bar gain a Keyboard
  shortcuts command too.
- The sheet clones the About dialog's list, so About stays the one place the
  shortcuts are written down. That list gains the shortcuts it was missing:
  Quick capture, Find and replace, and `?` itself.
- The logic lives in `public/js/shortcuts-sheet.js`.

## Constraints

- No network calls, no `innerHTML`, tokens only, no new tokens, no dark-mode
  rules, no inline-script edits.
- app.js ends below its 6,005-line ceiling, and the ceiling tightens.
- New modules meet the v18 limits and opt into `jsconfig.json`, `APP_SHELL`,
  and the script order.

## Tests

- `tests/note-menu.spec.js`: the single-note `.md`, the ZIP with an image,
  Trash hiding both items, print calling the browser, and the backup reminder
  staying put. The existing whole-library ZIP test moves to the backup menu
  button, which is where that export now lives.
- `tests/breadcrumb.spec.js`: Home, folder, daily, and unfiled crumbs;
  archived labels; the phone width.
- `tests/home-desk.spec.js`: tag chips, counts, the filter, and Manage tags.
- `tests/shortcuts-sheet.spec.js`: `?` opens the sheet with the cloned list,
  typing `?` in a field does not, Escape closes it, and the palette opens it.

## Out of scope

Exporting several selected notes as Markdown, an HTML export, and a
shortcut editor.
