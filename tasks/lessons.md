# Project lessons

- Serve only through `scripts/dev-server.mjs`; generic static servers expose
  private and operator-only repository files.
- Treat the v18 greenfield quality thresholds as ratchet targets for the legacy
  application, and report the measured gap rather than claiming compliance.
- Verify vendored package currency against the live registry before replacing
  an artifact; prior scan results are orientation, not current evidence.
