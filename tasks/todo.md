# v3.20 search operators — ship round (2026-09-01)

Implementation is complete and committed as v3.20.0. Production serves
v3.19.0 (checked 2026-09-01), so the next deploy carries v3.20.0 only.
Deploy only on an explicit "yes, deploy".

## Done and committed

- `6ea8665` docs(design): approve search operators design
- `03a8539` docs(design): search operators implementation plan
- `8ac4b5c` feat(search): tag, title, and folder operators filter before
  ranking (parseQuery before the word splitter; folder names via callback)
- `2ec2855` feat(search): scope line, live region, and hint name the
  operators (residual-only highlights in the open note)
- `d9038c8` docs(guide): search operators in the guide, readme, and test map
- `2d7dc49` chore(release): v3.20.0 search operators
- Gate: `npm run verify` green (coverage 40.77%, floor 36.2%); full suite
  1043 passed / 10 skipped / 0 failed on Chromium, Firefox, WebKit (2.0m);
  `bash cloudfront/recompute-csp-hashes.sh` all `[OK]`, no change;
  `./deploy.sh --dry-run` lists search.js, search-view.js, app.js,
  version.js, and the HTML shells; spot-check in `.verify/search-operators/`
  (light results and empty, dark 390 results and empty)

## Resuming From Here

- Done: v3.20.0 search operators end to end (spec, plan, TDD code, docs,
  release commit). `tests/search-operators.spec.js` holds 12 tests.
- Next: deploy on an explicit yes (`./deploy.sh --dry-run` first; confirm
  `aws sts get-caller-identity` is the scratchpad-deploy profile). Then
  v3.21 Paste as Markdown: brainstorm from `tasks/roadmap.md` (decide own
  converter versus vendored turndown, the bypass modifier, and Google Docs
  wrapper handling).
- Blockers: none.
- Assumptions: the working-tree build-date edit found at session start was
  folded into the v3.20.0 bump; app.js now sits exactly at its recorded
  ceiling (6204 as the ratchet counts, 6203 by `wc -l`), so the next app.js
  addition must remove a line or move logic into a module.

## Discrepancies carried forward

- `scripts/release-gate.mjs` (named in `tasks/lessons.md` and the v3.19
  record) was never committed; today's gate is `npm run verify` + `npm test`
  with the guide popup test CI-only.

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
- [ ] **v3.21 Paste as Markdown** — HTML clipboard → Markdown on paste in the
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