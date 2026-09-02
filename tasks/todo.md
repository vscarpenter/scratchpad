# v3.21 paste as markdown — ship round (2026-09-01)

Implementation is complete and committed as v3.21.0. Production serves
v3.19.0 (checked 2026-09-01). v3.20.0 is pushed; the seven v3.21 commits
are local only. Neither release is deployed. Push and deploy only on an
explicit go-ahead.

## Done and committed

- `603f05f` docs(design): approve paste as markdown design
- `d39274d` docs(design): paste as markdown implementation plan
- `23c72ed` feat(editor): html to markdown converter over an inert parsed
  document (`public/js/html-to-markdown.js`, 263 lines, strict-typed)
- `64679d4` feat(editor): paste html as markdown with native undo
  (`public/js/paste.js`; app.js net minus one line)
- `14f776a` docs(guide): paste as markdown and the plain-text paste
  shortcuts
- `1450636` chore(release): v3.21.0 paste as markdown
- Gate: `npm run verify` green (coverage 40.01%, floor 36.2%); full suite
  1075 passed / 17 skipped / 0 failed on three browsers (2.1m); CSP hashes
  unchanged; dry run lists both new modules and the service worker

## Resuming From Here

- Done: v3.21.0 end to end. `tests/paste-as-markdown.spec.js` holds 13
  tests: 7 pure converter cases on all browsers, 5 synthetic-event handler
  cases (skipped on Firefox, whose synthetic ClipboardEvent carries an
  unreadable DataTransfer), and 1 Chromium-only real-clipboard paste plus
  undo.
- Not verified by automation: the plain-text paste bypass. Headless
  Chromium on macOS does not route the shortcut, and the Chrome extension's
  synthetic keys never reach clipboard commands. Please try once by hand:
  copy bold text from any web page, paste into a note (expect Markdown),
  ⌘Z (expect it gone), then the browser's plain-text paste (⌥⇧⌘V in Chrome
  and Safari on a Mac, ⇧⌘V in Firefox) and expect plain text.
- Next: deploy on an explicit yes (dry run first; confirm the
  scratchpad-deploy identity). Then v3.22 Unlinked mentions from
  `tasks/roadmap.md` (decide title minimum, alias-preserving replacement,
  and draft-conflict rows).
- Blockers: none.
- Assumptions: app.js sits one line under its ceiling (6203 as the ratchet
  counts); the next app.js addition of two or more lines needs offsets.

## Release train after v3.19 (approved order)

Per-feature groundwork lives in `tasks/roadmap.md` (2026-09-01): what each
feature touches today, the proposed shape, the decisions its design gate
must settle, and the cross-cutting ratchet, CSP, sanitizer, and precache
constraints. Two discrepancies found while writing it:

- `scripts/release-gate.mjs` is referenced above and in `tasks/lessons.md`
  but was never committed; today's gate is `npm run verify` + `npm test`.
- `public/js/version.js` carries an uncommitted build-date bump to
  2026-09-01 while the v3.19.0 commit says 2026-08-30.
- The "scope picker" in the v3.20 line no longer exists (removed in
  `e51b143`); operators compose with the lifecycle switch and tag chip.

Each feature gets its own brainstorm → spec + plan under `docs/superpowers/`
→ TDD → ship cycle, one feature per release. Standing constraints: zero
network (`network-isolation.spec.js` untouched), vendored-only deps,
tokens-only CSS, no inline `<script>` changes, structure/format baselines
tightened or held, real deploys gated on an explicit yes.

- [x] **v3.20 Search operators** (committed 2026-09-01 as v3.20.0) — `tag:`, `title:`, `folder:` composing with
      the scope picker (from `backlog.md`); search.js + search-view plumbing +
      guide copy
- [x] **v3.21 Paste as Markdown** (committed 2026-09-01 as v3.21.0) — HTML clipboard → Markdown on paste in the
      editor; vendored minimal converter; establishes the paste handler that
      v4.0 images later extends
- [ ] **v3.22 Unlinked mentions** — extend the backlinks panel with
      plain-text mentions of the note title, one-click "link this"
- [ ] **v3.23 Callouts** — `> [!NOTE]` marked extension + token CSS; warms the
      renderer-extension pattern; keep `share.html`'s viewer working under CSP
- [ ] **v3.24 Syntax highlighting** — vendored highlighter scoped to ~10
      common languages (~30KB), payload-conscious
- [ ] **v3.25 Templates folder** — convention + "New note from template"
      palette command; mirrors the daily-template precedent
- [ ] **v4.0 Image attachments** — DB_VERSION 4→5 (blob store), backup
      schema 5, export strategy decision, size caps, paste/drop; decide
      shares stay text-only (recommended — object URLs are per-browser)
- [ ] **v4.1 Linked plain-text folder** — File System Access two-way `.md`
      round-trip with a user-chosen local directory; biggest and last; it
      inherits the image-export decisions from v4.0; never use the word
      "sync" in copy (terminology ban)