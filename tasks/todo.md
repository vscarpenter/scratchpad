# One-pass train v3.22 → v4.1 — complete (2026-09-01)

All six features are implemented, verified, and committed locally, one
release each: v3.22.0, v3.23.0, v3.24.0, v3.25.0, v4.0.0, v4.1.0. Nothing
from v3.21.0 onward is pushed or deployed; production serves v3.19.0 and
origin has v3.20.0. Port 8080 is occupied by a `python -m http.server`
serving another project, so tests run with `SCRATCHPAD_TEST_PORT=8091`.

## Release commits

- v3.22.0 `dbe1147` unlinked mentions · v3.23.0 `5732cd0` callouts ·
  v3.24.0 `e4d4a76` syntax highlighting · v3.25.0 `ede76da` templates
  folder · v4.0.0 `1ea58e7` image attachments · v4.1.0 `2c4e5aa` linked
  folder. Each has its spec and plan under `docs/superpowers/` and a full
  three-browser gate recorded in the commit message.

## Resuming From Here

- Done: the whole train. Final suite 1157 passed / 27 skipped (documented:
  Firefox synthetic clipboard, Chromium-only real clipboard and drag/drop,
  WebKit cannot persist a directory handle, CI-only guide popup).
- Next, in order, each on an explicit go-ahead:
  1. `git push origin main` (47 commits ahead).
  2. DONE 2026-09-02 03:36Z: the security-headers function is published
     to LIVE with `img-src 'self' blob: data:` (verified at the edge on /
     and /s/; the other seven headers unchanged). deployAll.sh would
     republish the same code harmlessly.
  3. `./deploy.sh --dry-run`, confirm the scratchpad-deploy identity, then
     `./deploy.sh`. One deploy carries v3.20 through v4.1. deploy.sh now
     invalidates `/public/*` and the worker precaches with cache: 'reload'
     (`daea59e`, `9465818`), so the five-minute stale-asset window is gone.
  4. Hands-on checks that automation could not do: plain-text paste
     bypass (⌥⇧⌘V in Chrome/Safari on a Mac, ⇧⌘V in Firefox) and linking
     a real directory in Chrome (tests use the origin-private file system).
- Blockers: none.
- Open discrepancies: `scripts/release-gate.mjs` is named in lessons.md but
  was never committed (today's gate is verify + suite); the 8080 squatter
  is outside this repo.
- Assumptions: app.js sits at 6202 (ratchet 6203, ceiling 6204); db.js at
  408 under its 418 allowance; the coverage floor stayed 36.2% while the
  measured value drifted from 40.20% to 39.41% as untested-by-workflow
  modules grew — raise the floor or extend the coverage workflow when the
  next feature lands.

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
- [x] **v3.22 Unlinked mentions** (committed 2026-09-01 as v3.22.0) — extend the backlinks panel with
      plain-text mentions of the note title, one-click "link this"
- [x] **v3.23 Callouts** (committed 2026-09-01 as v3.23.0) — `> [!NOTE]` marked extension + token CSS; warms the
      renderer-extension pattern; keep `share.html`'s viewer working under CSP
- [x] **v3.24 Syntax highlighting** (committed 2026-09-01 as v3.24.0) — vendored highlighter scoped to ~10
      common languages (~30KB), payload-conscious
- [x] **v3.25 Templates folder** (committed 2026-09-01 as v3.25.0) — convention + "New note from template"
      palette command; mirrors the daily-template precedent
- [x] **v4.0 Image attachments** (committed 2026-09-01 as v4.0.0; CSP publish required before deploy) — DB_VERSION 4→5 (blob store), backup
      schema 5, export strategy decision, size caps, paste/drop; decide
      shares stay text-only (recommended — object URLs are per-browser)
- [x] **v4.1 Linked plain-text folder** (committed 2026-09-01 as v4.1.0; Chromium-only by platform) — File System Access two-way `.md`
      round-trip with a user-chosen local directory; biggest and last; it
      inherits the image-export decisions from v4.0; never use the word
      "sync" in copy (terminology ban)