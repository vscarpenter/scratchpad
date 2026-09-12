# Architecture diagram with Archify (2026-09-11)

Tier: Standard (a docs-only artifact; no app, test, or deploy change).

Output: `docs/architecture/scratchpad.architecture.json` is the source and
`docs/architecture/scratchpad-architecture.html` is the rendered viewer. Both
are uncommitted, and `docs/` already sits outside the deploy scope.

- [x] Map the topology from code rather than memory. The service worker skips
      non-GET requests and `/api/share*`, so the share POST bypasses it
      (`public/service-worker.js:126` and `:151`).
- [x] Author 10 components and 10 relationships with 17 source references
      pinned to a30b207. Deliver at `showcase` quality: 9/9 checks, 0 errors,
      0 warnings.
- [x] Pass `visual-check` at 1440x900, 1600x1000, 1920x1080, and 2048x1320.
      Two correction rounds fixed a 27px overflow at 1440x900, two labels
      hugging their nodes, and a three-bend route.
- [x] Fix the copy the vinny-voice pass flagged: one passive phrase, one
      fragment, and "every page" where the function covers every response.
- [x] Wrap only `apigw` and `lambda` in the Share API group, in a third round
      Vinny approved. The renderer puts every boundary bottom 20 units below
      its lowest member, whatever `pad` says. A group sharing the AWS region's
      bottom row drew on its border.
- [x] Run the repo gates on the new files. `biome lint`, `check:format`, and
      the pre-commit HTML sink patterns all pass.

## Resuming From Here

- Done: the diagram above, committed with this entry but not pushed. Spec
  SHA-256 2fdc1eb5, artifact SHA-256 ce6620b2.
- Next: push when Vinny says so. After an architecture change, bump
  `meta.repository.revision` and deliver again so source links track the code.
- Blockers: none.
- Assumptions: `docs/architecture/` is the right home. Regenerate from the
  repo root with
  `node .claude/skills/archify/bin/archify.mjs deliver architecture <spec> <html> --quality showcase --repo-root .`

# Quick capture test: an async wait that never waited (2026-09-11)

Tier: Standard (two test files and a test index row; no app change).

Root cause: `page.waitForFunction` does not await an async predicate, so the
test's wait for the second capture passed at once. The toast check before it
can match the first capture's toast, so a slow second write lost the race in
CI (run 34602801946). A probe predicate that always resolved `false` passed in
68 ms. A repro that slowed `putIfUnchanged` by 1.5 s failed every time with
the old wait and passed with `expect.poll`.

- [x] Move the two quick capture tests from daily-note.spec.js into the
      existing quick-capture.spec.js (7c6cd06). daily-note.spec.js sat at its
      405-line ceiling unformatted, so it could not take an edit in place. An
      accidental overwrite of quick-capture.spec.js was caught by a
      `git status` pre-check and restored before any commit.
- [x] Replace the wait with `expect.poll` over a database read (fd6b22e).
      Ten repeated runs and all three browsers green.

## Resuming From Here

- Done: both commits above, plus two lessons in lessons.md, pushed as
  6c50029. The full local suite passed (1199 tests, 28 skipped), and CI run
  34611134288 passed all four quick-capture.spec.js tests on three browsers.
- Next, Vinny's call: `wikilinks.spec.js:110` and `pwa.spec.js:10` use the
  same async `waitForFunction` form and may flake the same way. The guide
  popup test still fails in CI on all three browsers and keeps main red.
- Blockers: none.
- Assumptions: none outstanding.

# Save a shared note into your own Scratchpad (2026-09-11)

Tier: Non-trivial (two surfaces, a new module, and the privacy test contract).
Spec: `docs/superpowers/specs/2026-09-10-save-shared-note-design.md`
Plan: `docs/superpowers/plans/2026-09-10-save-shared-note.md`

## Plan

- [x] Design approved; spec and plan committed (fc949ef).
- [x] Commit gate unblocked: `.saggar/` excluded in biome.json (639d663), and
      share.js plus the isolation spec formatted on their own (94112e2).
- [x] Task 1: the app saves a stashed note (d52924f). Red, then green on
      Chromium, Firefox, and WebKit.
- [x] Task 2: the viewer's Save to my Scratchpad button (7367adc). Red, then
      green on three browsers; CSP hashes unchanged; isolation test added.
- [x] Task 3: copy in guide, privacy, PRODUCT.md, the test index, and the old
      spec's pointer (bb75ffa). The first commit attempt failed because the
      format sweep handed Biome only the ignored `.saggar/project.json`, and
      Biome exits 1 when it processes nothing. Fixed first (04e0524).
- [x] Error color (0253cb8): the visual check showed the save error in body ink.
      `.share-link-error` used the undefined `--danger` token. It now uses
      `--rust`, guarded by a computed-color assertion that failed first
      (rgb(33, 30, 26) instead of rgb(176, 74, 63)).
- [x] Task 4: `bun run verify` green (coverage 39.32% against the 36.2%
      floor, structure 102 long and 11 deep, audit clean). Full suite green:
      1199 passed and 28 skipped on three browsers, 39 more passing tests
      than the v4.1.1 run. Visual check in `.verify/` passed in light and
      dark at 1280 and 400 pixels. Lessons distilled into lessons.md.

## Resuming From Here

- Done: SHIPPED as v4.2.0 on 2026-09-11. Release commit 5463aa3 is pushed,
  deployed with `./deploy.sh` (invalidation I4EGA7BRGLROWEZZM09Z14O3JI), and
  verified live: version.js serves 4.2.0, shared-copy.js returns 200, the
  share shell at `/s/<id>` carries the save button, and CSP, HSTS, and
  X-Frame-Options are intact.
- Next: check the Quality CI runs for 08cc7ff and 5463aa3. The last run on
  main before this work (6a48a84) failed on the guide popup test in all three
  browsers, so compare any red run against that test before blaming this
  feature.
- Leftovers, not committed: `.verify/share-save-shots.mjs` (the throwaway
  screenshot script) and `tasks/implementation-notes.md` (the deviation
  ledger, already distilled). The `rm` of the script was declined, so both
  wait for Vinny.
- Blockers: none.
- Assumptions: none outstanding.

# Linked folder: a slow read must never delete the files it adopts (2026-09-05)

Tier: Standard (one module, one spec file, no public contract change).

Root cause (traced 2026-09-05 against ~/Projects/ScratchPad-Content):
`applyFile` records a path for each adopted note and stores it through
`putNoteRecord`, which schedules `flush` 800 ms later. `flush` looks each
pending id up in `state.notes`, which `readAll` only refreshes via
`api.reload()` after the whole walk. A note missing from memory is treated
as trashed and its remembered path is removed, so a read longer than 800 ms
deletes the source files it just imported and writes nothing back. The spec
promises files are never deleted except for a trashed note.

## Plan

- [x] RED: `tests/linked-folder.spec.js` — slow the real `ScratchpadDB.put`
      so the write-back fires mid-read; assert adopted files survive and
      still receive their id afterwards. Watch it fail on `exists` = false.
- [x] GREEN: `public/js/linked-folder.js` — hold write-backs while a read is
      in flight (counter), skip a flush that fires mid-read without clearing
      `pending`, and schedule the deferred flush when the read finishes.
- [x] Linked-folder spec on all three browsers (12 passed, 6 WebKit skips)
      and `npm run verify` green. Full suite: see Resuming From Here.
- [x] Full suite 1160 passed / 28 skipped (2.2 m). Committed as a
      fix(data) commit plus this docs(tasks) commit; lesson distilled into
      lessons.md.

## Resuming From Here

- Done: read-race fix (d0d9339) with a regression test; verify gate and
  full suite green. SHIPPED as v4.1.1 (`1dbaee6`) on 2026-09-05, deployed
  as scratchpad-deploy, invalidation I4ZFMA8Y9FEI30S8OYVUE90WLN, verified
  live (version.js 4.1.1 / 2026-09-05, guard present in linked-folder.js,
  CSP and HSTS unchanged). The content folder is reconciled: 83 of the 85
  imported notes are in Blogs on disk and in the app, one is unfiled by
  choice (September Read List), one was trashed (Blog Posts); zero
  duplicate ids, the empty `blog/` directory removed.
- Next: `git push origin main` (6 commits ahead) on an explicit go-ahead.
  Optional, Vinny's call: four pre-import posts still unfiled at the root
  (CI/CD pipeline, skills guide, LLM critics, long-titled bottleneck), and
  five same-title note pairs at the root with a "-2" suffix.
- Blockers: none.
- Assumptions: none outstanding.

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
     bypass — DONE, verified by hand 2026-09-02 (rich paste converts, ⌘Z
     undoes, the browser's plain-text shortcut pastes raw text). Still
     open: linking a real directory in Chrome (tests use the origin-private
     file system).
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