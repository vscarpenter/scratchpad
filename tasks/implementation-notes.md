# Implementation notes

## 2026-08-27

- The accepted implementation order is baseline, standards/tooling, dead search scope, menus, then CSS cascade.
- Existing user work at start: modified `AGENTS.md` and untracked `coding-standards.md`; both are approved inputs and must be preserved.
- Prior vendor history is orientation only. Recheck live package versions immediately before updating vendored files.
- The v18 type, size, nesting, and coverage rules require a documented legacy ratchet because an immediate strict gate would reject the current no-build application wholesale.
- No push, deploy, release bump, AWS mutation, or CSP publishing is authorized.
- Sidebar measurement was 349.16px: 264.16px of child content, 48px of gaps, and 37px of vertical padding. The new 8px gaps and 22px/11px padding measure 329.16px without shrinking controls or removing content.
- The trash flow was correct; the failing Chromium test observed both an exiting dialog button and the list trigger. Waiting for hidden state and scoping the trigger fixes the test without changing product motion.
- Live npm verification immediately before replacement reported Marked 18.0.11 and DOMPurify 3.4.14. The official Marked UMD artifact was copied with only its source-map trailer removed, matching repository practice.
- Baseline proof after those repairs: Playwright 874 passed / 5 skipped across Chromium, Firefox, and WebKit; Lambda 43/43; app-shell 28 paths; seed-note 3/3; first-party JavaScript syntax and shell syntax clean; vendor currency clean; Bun audit returned no advisories.
