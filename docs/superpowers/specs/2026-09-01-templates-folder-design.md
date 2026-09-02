# Templates folder — design spec

Date: 2026-09-01
Status: approved

## Decision

Any folder named "Templates" (case-insensitive) is the templates folder by
convention. Every active note inside it appears in the command palette as
`New note from template: <title>`; choosing one creates a new note with
that template's body and tags, an empty title, filed in the current folder
view, and opens it. No managed folder, no migration, no settings, no
placeholders. The daily template keeps its own title convention.

The approved design named a second-stage picker inside the palette; this
spec lists one palette command per template instead. The palette already
lists notes as pseudo-commands, so per-template commands are consistent,
searchable by title, and need no palette state. Logic lives in
`public/js/templates.js`; app.js adds one line to the command list and an
init block. Ships as v3.25.0.

## Goals

- Reusable note scaffolds with zero new UI surfaces.
- Discoverability when nothing is set up yet.
- app.js stays under its ceiling.

## Contract

- Folder match: `name.trim().toLowerCase() === 'templates'`. The first
  such folder wins.
- Template notes: notes whose `folderId` is that folder and that are
  neither archived nor trashed, sorted by derived title.
- With templates present, the palette lists
  `New note from template: <derived title>` for each, meta
  "Templates folder", searchable by "template" and the title.
- Without a Templates folder, or with an empty one, the palette lists a
  single `New note from template…` whose action toasts
  `Add notes to a folder named “Templates” to use them here.` and creates
  nothing.
- Creating from a template: a fresh id, empty title, the template's body
  and a copy of its tags, not pinned. It is filed in the current folder
  view unless that view is Home, the Templates folder itself, the managed
  Daily Notes folder, or a folder that no longer exists, in which case it
  is unfiled. The note is written through `putNoteRecord`, added to state,
  opened in view mode through the same path as other palette note
  commands, and a toast reads `New note from “<template title>”`.
- The template note itself is never modified.

## Documentation and verification

- `guide.html`'s daily-notes section gains a Templates folder paragraph;
  README's daily-note bullet and `tests/README.md` gain the feature.
- `tests/templates.spec.js`, three browsers: templates listed and created
  with body, tags, and the current folder; archived templates ignored and
  the folder name case-insensitive; a note created while viewing the
  Templates folder is unfiled; the guidance command when no folder exists.
- The module joins the script order, shell list, and jsconfig include.
  Version 3.25.0; deploy gated on an explicit yes.

## Out of scope

- Placeholders such as dates, a "save as template" action, template
  categories, and a settings UI.
