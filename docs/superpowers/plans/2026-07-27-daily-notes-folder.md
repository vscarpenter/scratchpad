# Managed Daily Notes folder implementation plan

**Goal:** Implement the approved managed-folder behavior in
`docs/superpowers/specs/2026-07-27-daily-notes-folder-design.md`.

**Architecture:** Keep persistence in the existing IndexedDB v3 folder and
note records. Add an idempotent app-layer reconciler before first render, then
reuse the current folder accordion, menu, move dialog, backup, import, and
cross-tab paths.

## Task 1: Characterization and failing tests

- Extend `tests/daily-note.spec.js`, `tests/folders.spec.js`, and
  `tests/first-run.spec.js`.
- Prove new assertions fail against the current implementation.

## Task 2: Managed folder model and migration

- Add stable folder constants and managed-folder helpers in `public/js/app.js`.
- Reconcile creation, legacy name adoption, and existing daily-note membership
  during `loadAll()`.
- Preserve `updatedAt`, revisions, drafts, trash state, and legacy folder
  membership.
- Add folder-only cross-tab refresh semantics.
- Run the targeted tests and commit.

## Task 3: Interaction protections

- Reserve the Daily Notes name and exclude the managed folder from user caps.
- Restrict folder menu, drag/drop, note move, bulk move, command palette,
  direct creation, and duplication paths.
- Update import limits and collision accounting.
- Run daily/folder/first-run tests and commit.

## Task 4: Documentation and compatibility

- Update the README, user guide, feature coverage map, and older daily/folder
  design specs.
- Verify JSON, encrypted, and Markdown ZIP behavior.
- Commit documentation separately.

## Task 5: Final verification

- Run JavaScript syntax checks.
- Run targeted Chromium coverage.
- Run the full Playwright suite with one worker across all configured browsers.
- Run the CSP hash verifier because the release gate requires it, even though
  no inline script is expected to change.
- Inspect the final diff and working tree without staging unrelated changes.

