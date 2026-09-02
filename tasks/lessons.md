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
