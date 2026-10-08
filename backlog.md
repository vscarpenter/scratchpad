Here are items to consider adding to ScratchPad. Shipped items get
deleted from this list rather than struck through.

- Visual diff between revisions in the History dialog. Restore shipped
  on 2026-07-26; seeing what changed before restoring is the natural
  next step. Spec: `tasks/spec.md` (2026-10-08).
- Manual note ordering inside folders (drag to reorder notes, matching
  what folders themselves already support).
- Markdown footnotes.
- Inline capture on Home and a recently opened list, if Home earns daily
  use (noted in `tasks/todo.md` after #28).
- WebMCP tools (`document.modelContext`) so browser agents get structured
  access instead of DOM scraping. Design is decided: one feature-detected
  module in `public/js/` that registers `create_note` and `append_to_note`
  unconditionally (content flows in, nothing disclosed), and gates
  `list_notes` / `search_notes` / `get_note` behind an opt-in setting,
  default off, because read results enter the agent's model context and
  leave the browser — document that on privacy.html in the same
  deliberate-act framing as sharing. Zero page-initiated network calls,
  so `network-isolation.spec.js` stays as-is. Build when Chrome ships
  stable (expected Q4 2026) rather than joining the origin trial; the
  API surface is still moving (navigator → document rename, 2026-08).
