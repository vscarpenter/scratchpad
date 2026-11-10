# Open Canvas implementation plan

1. Record v6 and update the project brief, token decisions, and repository design contract.
2. Add failing behavior tests for navigation, calendar, draft protection, drawer focus, and responsive geometry.
3. Implement small typed navigation/calendar modules using existing note, folder, and daily-note operations; add strict JS checks and offline precache entries.
4. Implement flat surfaces, serif prose, matching read/edit metrics, responsive panes, and focus restoration.
5. Update superseded visual assertions while retaining privacy, storage, sharing, sanitization, and CRUD assertions. Run focused tests, npm run verify, and npm test.
6. Inspect light/dark screenshots at 1710, 1280, 1024, 768, and 375px, including long notes/lists. Commit milestones and report actual verification.

Approval covers specification, plan, and implementation. No intermediate approval gates or deployment.

## Completed verification — November 10, 2026

- Full three-browser suite: **1,802 passed, 37 skipped, zero failures**. Existing platform/capability skips remain in place. The final run uses its own artifact directory so concurrent development checks cannot remove its downloads.
- The 15 Open Canvas acceptance cases also passed in all three browsers, including the compact focus-mode guard: **45 passed**.
- `npm run verify` passed: format, lint, strict opted-in JavaScript types, structure ratchets, 59 offline shell paths, seed checks, Lambda tests, measured browser coverage, and dependency audit. Coverage is **45.56%**, not the greenfield 80% target. Audit checked 85 packages and reported no vulnerabilities.
- Inline-script CSP hashes remain unchanged and verified in both CloudFront reference files. No AWS mutation or deployment was performed.
- Light/dark screenshots were captured and inspected at 1710, 1280, 1024, 768, and 375px. No horizontal page overflow or browser console errors were observed in those captures. The 768px reading measure is now 528px, compared with 232px before the redesign.
- Markdown read/edit font metrics, draft confirmation, native drawer dismissal/focus, calendar keyboard navigation and leap days, daily-note reuse, mobile touch targets, CRUD, search, backups, sanitization, storage protection, offline behavior, and encrypted sharing were exercised. Navigation/calendar actions have an additional zero-network-request acceptance case.

Local verification artifacts live under `.verify/open-canvas/` and are excluded from deployment and commits. Main captures are `final-reading-1710-light.png`, `final-reading-768-light.png`, `final-reading-375-light.png`, and their dark variants. `verified-suite.log` and `verified-quality.log` record the final runs.

### Firefox test launch

The bundled Firefox initially hung before loading the app, matching [Playwright issue 42768](https://github.com/microsoft/playwright/issues/42768). Verification used a cloned test runtime with its own application-data identity, without changing the installed browser, its profiles, filesystem permissions, or repository Playwright configuration. The temporary launcher dispatches device fixtures to their original browser engine. All tests and assertions remain enabled.

The reproducible local command (the temporary config and runtime remain in `.verify`) is:

```sh
SCRATCHPAD_TEST_PORT=8094 npm test -- --config=.verify/open-canvas/all-browsers.config.cjs --output=.verify/open-canvas/results/final-suite --workers=4 --reporter=line
```

## Craft report

- **Checked:** reference alignment, hierarchy, typography, restrained color, responsive geometry, light/dark themes, keyboard/focus, touch targets, and the existing privacy/storage contracts.
- **Passed:** flat surfaces, readable serif prose, matching Markdown metrics, persistent navigation, month calendar, bounded scrolling, and the five viewport compositions.
- **Changed:** navigation/calendar modules and offline entries; flat shell and typography; compact pane behavior; focus races found in Edit, native drawer dismissal, and backup dialogs; superseded design assertions and documentation.
- **Left alone:** Markdown Edit/Save, database schema, existing dialog layouts and semantic quote/callout treatments, release version, deployment state, and the user's pre-existing version.js build-date edit.
- **Verdict:** the approved redesign is implemented and verified locally; no release or deployment is implied.

## Design hook triage

- **Gradient text:** fixed the About title accent to use a solid token color.
- **Small text:** raised new privacy/date/byline labels and calendar controls to 12px. The aggregate body-text warning misclassifies secondary metadata: the actual note body is 20px on desktop/tablet and 18px on phone. A file-scoped `tiny-text` exception for `index.html` records that evidence in the local Impeccable configuration.
- **Clipping:** retained the sidebar's required viewport/scroll containment. Its absolute full-row hit regions belong inside the clipped scrolling list; folder and action menus remain usable in the regression suite. A file-scoped `clipped-overflow-container` exception records this intentional structure. No project-wide rule or file suppression was added.
- Refreshed the tracked design-system sidecar. Existing quote indicators and dialog body insets retain their established behavior.

## Modern Web Guidance applied

- **navigation-drawer:** used a named native modal container ("The browser makes the rest of the page inert") and explicit trigger restoration where WebKit's pointer-focus behavior requires it. The regular navigation landmark moves into the modal only on phones.
- **responsive-design:** used dynamic viewport height ("Use dynamic viewport units") for phone navigation, while list/document pane switching protects the reading measure on tablets.
