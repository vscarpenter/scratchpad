# Project lessons

- Serve only through `scripts/dev-server.mjs`; generic static servers expose
  private and operator-only repository files.
- Treat the v18 greenfield quality thresholds as ratchet targets for the legacy
  application, and report the measured gap rather than claiming compliance.
- Verify vendored package currency against the live registry before replacing
  an artifact; prior scan results are orientation, not current evidence.
- Characterize a retired internal path at the public behavior boundary before
  removing it; search remains a single title/body/tag operation without keeping
  dead scope state or rendering branches.
- Centralize repeated action-menu mechanics, but keep context-specific work in
  hooks. Nested overlays need explicit keyboard-listener ownership so Escape can
  close the child menu and restore focus without dismissing its parent.
- Put shell geometry and semantic surfaces in the base CSS cascade. Responsive
  rules should change layout mode, not re-declare the same radius, shadow,
  backdrop, and background contract at every breakpoint.
- Ratchets are only honest when their measured baselines tighten after a
  simplification. This pass reduced deep functions from 13 to 12 and raised the
  deterministic browser coverage floor from 35.67% to 36.2%.
- `check:format` sweeps every changed AND untracked supported file, while
  `public/css/app.css` and `public/js/app.js` are format-baseline legacy
  exemptions. When it fails, read which file it actually checked — and never
  run `biome format --write` on a legacy file to satisfy it: that reformats
  the whole file and buries the real change under ~1,200 lines of churn.
- The structure ratchet counts EVERY function — test bodies and
  test.describe callbacks included — and pins app.js's total line count.
  Features pay their way: pure logic goes into a new v18-clean module
  (window.ScratchpadX, precached in both service workers' shell list,
  opted into jsconfig include), and app.js edits net out at or below the
  recorded ceiling. A new test that grows a describe block past 40 lines
  belongs in its own describe or spec file.
- Measuring a flake with the wrong instrument creates new bugs to chase. This
  round: a `window.open` probe wrapper suppressed the very popup it measured
  (a blocked no-gesture attempt poisons later opens); a service-worker stub
  and a pristine-browser probe changed the answer under test;
  `context.pages()` cannot see lazily unattached popups; and dev-server
  request logs are polluted by per-context SW precache installs. Ground
  truth needs an instrument outside the thing being measured — or better, a
  bisect over the tree.
- The guide popup failure was never app behavior: `window.open` from the
  palette is deterministic solo and in every suite subset, and only Playwright's
  new-page target attach starves under sustained suite-machine saturation
  (observed: a fresh browser launch took 73s in failing runs; ambient machine
  load moves the threshold run to run). No timeout budget (30s through 120s),
  retry count, worker count, pristine browser process, or suite split made
  target attach reliable under saturation — a two-half split that passed twice
  in the morning failed to replicate in the afternoon. The gate that survives
  a busy machine keeps the test out of the saturated run: full suite minus the
  popup test, then the popup test solo (`scripts/release-gate.mjs`). CI
  (workers: 1, retries: 2) stays authoritative for PRs.
- Assert on state that only exists after the change. A `toHaveCount(n)` that
  the pre-search list already satisfies passes before the 150ms search
  debounce fires and then reads stale rows; poll the row ids with
  `expect.poll` or assert the results counter first. Three v3.20 tests passed
  red for exactly this reason.
- The structure ratchet counts app.js lines as `wc -l` + 1 (the trailing
  newline is a line). A recorded ceiling of 6204 with wc at 6203 is zero
  slack: every added app.js line needs a removed one in the same change.
- Firefox's `ClipboardEvent` constructor accepts a `clipboardData` member but
  exposes a protected DataTransfer whose `getData` returns empty strings, so a
  synthetic paste can never be observed there. Detect it by reading the
  payload back and skip with a reason; prove the real path in Chromium with
  `context.grantPermissions(['clipboard-read', 'clipboard-write'])`,
  `navigator.clipboard.write`, and a real `ControlOrMeta+v`.
- Plain-text paste is a browser shortcut that differs by platform:
  Ctrl+Shift+V on Windows and Linux, Cmd+Shift+V in Firefox on a Mac, and
  Cmd+Option+Shift+V in Chrome and Safari on a Mac. Do not document
  "Cmd/Ctrl+Shift+V" as if it were universal, and do not expect headless
  Chromium on macOS to route it.
- commitlint here enforces a 72-character header and a lower-case subject,
  so product names like DOMParser cannot appear in a commit subject.
- Verify an exploration agent's claim about a module's exports by reading
  the export object before designing against it. `scanOutsideFences` was
  reported as exported and was private; the mentions feature silently found
  nothing until the probe showed `keys` of the global.
- When summarizing a Playwright run, never `tail` the failure list. A cut
  list made Chromium look green while all three browsers had failed the same
  tests, and the missing lines hid the real cause for a round.
- Playwright reuses whatever answers on the configured port. A stray
  `python -m http.server 8080` served another site to every test; run with
  `SCRATCHPAD_TEST_PORT=<free port>` and never assert a literal port inside
  a test.
- Touching a never-formatted non-exempt file drags the whole file into the
  format sweep. Land a separate `style:` commit first (checkout, format,
  commit), then the feature diff stays readable; check the structure
  ratchet after formatting because expanded fixtures can push a describe or
  a test past 40 lines.
- WebKit cannot store an in-memory Blob in IndexedDB ("Error preparing
  Blob/File data"); persist an ArrayBuffer and build Blobs on read.
- The pre-commit innerHTML guard reads file names from `+++` headers; with
  `diff.mnemonicPrefix` those arrive as `i/…`, which defeated the vendor
  exemption until the prefix strip accepted any single letter.
- Concurrent async event handlers that insert into the same textarea race;
  serialize them through one promise queue rather than loosening tests.
- Playwright's `hasText` string filter is case-insensitive and substring-
  based: "Old" matched "folder". Use a regex when the intent is exact.
- A write-back that keys off "note missing from memory" is a delete waiting
  to happen whenever memory lags the database. The linked folder's read
  adopts files through `putNoteRecord` and only reloads `state.notes` after
  the whole walk, so any read longer than the 800 ms flush timer looked like
  a mass trash and removed its own source files. Hold write-backs while a
  read is in flight (a counter, since reads overlap), keep `pending` intact,
  and schedule the deferred flush from the read's `finally`. To reproduce a
  timing race deterministically in Playwright, slow the real seam
  (`window.ScratchpadDB.put`) instead of piling on fixtures.
- Biome exits 1 when every path handed to it is ignored under
  `files.includes`. Excluding a tool directory in biome.json alone blocks any
  commit where that directory holds the only changed JSON file. The
  changed-file sweep's own `excluded` regex needs the same entry. The failure
  hides until the ignored file is the sole candidate.
- A CSS custom property that no stylesheet defines makes its declaration
  invalid, and inherited properties such as `color` fall back to the parent.
  `.share-link-error` pointed at a nonexistent `--danger` and rendered in body
  ink; the danger token is `--rust`. Before reusing a class, grep for its
  token's definition. Guard state colors by comparing computed colors against
  a probe element that uses the token.
- `check-structure.mjs` measures a function from its first line to its last.
  Boot `init` in app.js sits near 40 lines. Wiring a new module there can add
  a long function even while app.js stays under its line ceiling, so count
  the containing function, not just the file.
- zsh does not word-split an unquoted `$var`. `git diff -- $files` with a
  space-separated list passes one nonexistent path and silently diffs
  nothing, which made a dash scan report clean. Spell out the paths or use an
  array.
- Playwright's `page.waitForFunction` does not await an async predicate. The
  returned Promise is truthy, so the wait passes at once; a probe predicate
  that always resolved `false` returned in 68 ms on 1.62.1. Poll async state
  with `expect.poll(() => page.evaluate(...))` instead. The quick capture test
  flaked in CI this way, and `wikilinks.spec.js` and `pwa.spec.js` still use
  the async form.
- Confirm a path is free before writing a new file there. `tests/README.md`
  did not list `tests/quick-capture.spec.js`, and the Write tool overwrote
  that tracked, never-read file without refusing. A `git status` pre-check
  caught it before any commit.
