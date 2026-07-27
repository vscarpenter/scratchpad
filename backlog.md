Here are items to consider adding to ScratchPad. Shipped items get
deleted from this list rather than struck through.

- Archive state for notes: a third state besides active and trash. Needs
  a DB schema change (new field plus a view), so decide it alongside the
  next DB_VERSION bump.
- Syntax highlighting for fenced code blocks. Requires vendoring a
  highlighter library; weigh the payload against how often code blocks
  show up in real notes.
- Search operators (tag:project, title:draft) that compose with the
  existing scope picker.
- General note templates beyond the daily template, such as a Templates
  folder whose notes seed new ones.
- Visual diff between revisions in the History dialog. Restore shipped
  on 2026-07-26; seeing what changed before restoring is the natural
  next step.
- Manual note ordering inside folders (drag to reorder notes, matching
  what folders themselves already support).
- Markdown footnotes.
