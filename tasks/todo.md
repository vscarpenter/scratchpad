# v3.19 find and replace — ship round (2026-08-31)

Feature implementation is done (Tasks 1–4 of
`docs/superpowers/plans/2026-08-31-find-replace.md`); the release is blocked on
one suite-load flake in a pre-existing test. Everything below is the resume
point.

## Done and committed

- `34ca86c` docs(design): approve find-and-replace design and plan
- `cc7432e` feat(editor): find bar opens with cmd+f while editing — bar
  markup, `public/js/find-replace.js` module (bare-block, ≤40-line functions),
  `editor-format.js` extracted from app.js to offset growth, cmd+F
  interception (editing-only), palette entry, focus-steal fix
  (`ScratchpadFind.editorFocus` routing on the five `setTimeout(editor.focus)`
  sites)
- `08a867b` feat(editor): match counter, cycling, and case/regex toggles
- `1620fa8` feat(editor): replace current and replace all — `$1` capture
  references in regex mode, Replace-all toast via `onToast`
- `7f9b3da` docs(guide): find and replace guide, shortcuts, and offline shell
  entry — guide section + table rows, README row, tests map row, SW precache
  (`check:shell`: 33 paths resolve)
- `npm run verify` green; browser coverage 40.20% (floor was 35.6%); structure
  ratchet tightened and recorded in `config/structure-baseline.json`:
  app.js 6246 → 6204, longFunctions 103 → 102, deepFunctions 12 → 11
- `tests/find-replace.spec.js`: 51 assertions, 9 describes, all green in
  isolation across 3 browsers

## Working tree (uncommitted — do not reset)

- `public/js/version.js` — bumped 3.18.0 → 3.19.0; commit with the release
- `public/js/app.js` — `runCommandAt` no longer awaits `item.run()`: window.open
  commands must fire inside the click's transient-activation window, which an
  await can outlive on a slow main thread. Correct fix; commit it as its own
  `fix(palette):` commit once the suite is green to verify it
- `tests/guide.spec.js` — `context.waitForEvent('page')` → `page.waitForEvent('popup')`
  (canonical API, keep)
- `tests/tmp-popup-probe.spec.js` — debug probe for the blocker; keep for the
  bisect below, DELETE before the release commit

## Blocker: guide popup test under full-suite load

Test: `tests/guide.spec.js:67` "command palette opens the guide in a new tab".
Fails on all 3 browsers under `npm test`; passes in isolation
(`npm test guide.spec.js` → 24 passed).

Verified facts (do not re-derive):

- `window.open('guide.html', '_blank', 'noopener')` returns **null** ~120–240ms
  after the click, with `navigator.userActivation.isActive === true`
- The popup genuinely never exists (`context.pages()` stays at 1)
- v3.18.0 (`b0e88db`) full suite green **twice** (959/962 passed, 0 failed),
  including with an inert comment appended to app.js — so it is not
  "any diff tips the timing"
- Removing `find-replace.spec.js` from the suite does **not** fix it — the
  flake is not our tests' added load
- First failing commit is `cc7432e` (Task 1)
- Find-replace runtime code never executes in the failing flow (palette is an
  open dialog → the module's capture-phase listener stands down; the test flow
  sends no keydowns)
- Ruled out: await-in-gesture (fix landed anyway, flake persisted), popup
  event API (change landed anyway), activation expiry (blocked at ~120ms),
  worker count (`--workers=4` still fails)

Remaining suspects: the two extra per-page script fetches
(`editor-format.js`, `find-replace.js`) shifting dev-server/browser timing past
a popup-creation threshold under suite parallelism; or something subtler in
`cc7432e`.

### Bisect plan for cc7432e's contents (each step = one full-suite run)

- [ ] 1. At `b0e88db`, add ONLY the two script tags + the two module files
      (no app.js wiring, no find-bar markup) → full suite
- [ ] 2. If green, add ONLY the `#find-bar` markup in index.html → full suite
- [ ] 3. If green, add ONLY the app.js wiring (ScratchpadFind.init + palette
      entry + applyEditorFormat delegation) → full suite
- [ ] 4. The slice that flips the test names the mechanism. If it is pure
      page weight / load threshold: gate local release runs on lower
      parallelism (CI already runs `workers: 1` and passes) and document that
      in CONTRIBUTING; if it is wiring: fix the wiring

## v3.19 ship steps (after the blocker)

- [ ] 1. Land the `fix(palette):` commit (app.js await removal) and the
      guide.spec.js API change if not already in
- [ ] 2. `bash cloudfront/recompute-csp-hashes.sh` — must report no change
      (all new code is external files; no inline `<script>` was touched)
- [ ] 3. Full suite green: `npm test` (expect ~1007 passed / 7 skipped,
      0 failed)
- [ ] 4. Visual spot-check via `node scripts/dev-server.mjs`: find bar open,
      cycling, replace, invalid-regex notice — light + dark, 1440px and 390px;
      screenshots to `.verify/find-replace/`
- [ ] 5. Record session lessons in `tasks/lessons.md`:
      (a) never run `biome format --write` on `public/js/app.js` or
      `public/css/app.css` — they are `legacyFiles` in
      `config/format-baseline.json`; a wholesale reformat happened this
      session and was reverted via `git checkout HEAD -- public/js/app.js`
      before any commit
      (b) commitlint enforces lowercase subjects — write "cmd+f", not "Cmd+F"
      (c) structure ratchet: new modules are bare-block style with ≤40-line
      functions (see `public/js/search.js`); offset any app.js growth by
      extraction and tighten `config/structure-baseline.json` in the same
      commit
- [ ] 6. Delete `tests/tmp-popup-probe.spec.js`
- [ ] 7. Commit `chore(release): v3.19.0 find and replace`
- [ ] 8. Deploy only on an explicit "yes, deploy" (`./deploy.sh --dry-run`
      first; confirm `aws sts get-caller-identity` is the scratchpad-deploy
      profile)

## Release train after v3.19 (approved order)

Each feature gets its own brainstorm → spec + plan under
`docs/superpowers/` → TDD → ship cycle, one feature per release. Standing
constraints for every release: zero network (`network-isolation.spec.js`
untouched), vendored-only deps, tokens-only CSS, no inline `<script>` changes,
structure/format baselines tightened or held, real deploys gated on an
explicit yes.

- [ ] **v3.20 Search operators** — `tag:`, `title:`, `folder:` composing with
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