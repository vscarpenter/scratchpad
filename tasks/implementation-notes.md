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
- Reconciled v18 by replacing the v15 reference, correcting repository guidance, adding the missing contribution/command artifacts, and documenting an accepted vanilla-JavaScript ADR.
- Mechanical gates now cover full-source Biome lint, changed-file Biome format, strict checking for opted-in quality modules, commitlint, exact Bun/dev-dependency pins, frozen installs, structural non-regression, browser coverage non-regression, audit, and pull-request CI.
- The initial honest debt baseline is 103 functions over 40 lines, 13 functions over nesting depth three, four files over 400 lines, and 35.67% coverage in the deterministic core browser workflow. The v18 thresholds remain targets, not claimed current compliance.
- Search characterization now proves title/body/tag matching, direct highlighting, and Escape clearing. Removing the retired scope state, element lookup, renderer, setter, listener, and branches reduced `app.js` by 28 lines and the deep-function baseline from 13 to 12.
- Whole-file formatting of `app.js` would create thousands of unrelated changes. `config/format-baseline.json` records it and `app.css` as the only format-migration exceptions; both remain fully linted and structurally ratcheted.
- A shared controller now owns visible-item discovery, opening/closing, ARIA state, outside-click cleanup, focus wrapping, Home/End, Tab, and Escape for folder actions, editor overflow, list actions, and backup actions. Unique folder positioning and backup metadata remain in small hooks.
- The menu contract test failed first on the real inconsistency: folder-action Escape did not restore focus. The controller now temporarily owns the nested picker's key listener, preserving the picker while returning focus correctly in all three engines.
- Menu consolidation removed 160 more lines from `app.js`; all 117 focused organization/folder/archive/menu cases passed except one Firefox test-coordinate artifact, and the corrected four-menu contract then passed in Chromium, Firefox, and WebKit. Browser coverage rose to 36.24%, so the floor tightened to 36.2%.
