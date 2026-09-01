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
  new-page target attach starves under the complete 52-file parallel load on
  this machine (a fresh browser launch took 73s in the failing runs). Sticky
  across retries, immune to worker counts and pristine processes. The release
  gate now runs the suite as two halves (`scripts/release-gate.mjs`), split at
  guide.spec.js; CI (workers: 1, retries: 2) stays authoritative for PRs.
