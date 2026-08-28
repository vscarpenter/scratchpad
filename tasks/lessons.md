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
