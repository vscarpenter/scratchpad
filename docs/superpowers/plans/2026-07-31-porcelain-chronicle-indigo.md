# Porcelain Chronicle Indigo — implementation plan

1. Add regression tests for the date rail, date-specific daily-note behavior, date spine, and responsive containment.
2. Promote the selected Indigo palette and porcelain surface roles into `inkwell-tokens.css` while keeping dark mode intentional.
3. Add the chronological rail, sidebar date heading, daily-note card, and document date spine to `index.html` without changing CSP-protected inline scripts.
4. Add date rendering and date-specific daily-note opening to `app.js`, reusing the existing `dailyDate` identity and managed folder.
5. Restyle the application shell in `app.css`, preserving mobile, focus mode, print, dialogs, and inner scroll regions.
6. Run targeted tests, then the full cross-browser suite and CSP hash verification.
7. Inspect the running app in light and dark modes at desktop and mobile sizes; correct visible regressions before handoff.
