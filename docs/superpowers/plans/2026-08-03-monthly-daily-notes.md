# Monthly Daily Notes navigation and review implementation plan

**Goal:** Implement the approved behavior in
`docs/superpowers/specs/2026-08-03-monthly-daily-notes-design.md` without adding
automatic roll-ups or permanent calendar chrome.

**Architecture:** Keep daily notes and reviews in the existing note store. Add
sidebar-only month presentation helpers, local disclosure preferences, and the
optional `monthlyReviewMonth` note field. Reuse the current command palette,
note editor, lifecycle, wikilink, backup, and import/export paths.

## Task 1: Month grouping through TDD

- Add failing Playwright cases to `tests/folders.spec.js` for month and day
  order, default and persisted disclosure, Archive, and flat alternate views.
- Add month-key, label, grouping, disclosure-storage, and rendering helpers in
  `public/js/app.js`.
- Add restrained nested-navigation styles in `public/css/app.css`.
- Run the focused folder and Chronicle tests, inspect the sidebar at desktop and
  mobile widths, and commit the slice.

## Task 2: Monthly Review model and command through TDD

- Add failing Playwright cases to `tests/daily-note.spec.js` for target-month
  selection, command copy, creation, generated links, idempotent reuse,
  lifecycle handling, dirty-editor protection, and duplication.
- Normalize `monthlyReviewMonth`, build contextual command definitions, and add
  create/open helpers in `public/js/app.js`.
- Open newly created reviews in edit mode; open existing reviews in their
  current lifecycle view.
- Run focused Daily Note, command-palette, archive, and cross-tab coverage, then
  commit the slice.

## Task 3: Portability and documentation

- Add Markdown frontmatter export/import coverage and verify native JSON and
  encrypted backups preserve the field without a schema bump.
- Update `README.md`, `guide.html`, `about.html`, and `tests/README.md` with the
  month grouping and opt-in review workflow.
- Run static-page, import/export, and documentation checks, then commit.

## Task 4: Final verification

- Run JavaScript syntax checks and CSP hash verification.
- Run focused Chromium coverage, then the full one-worker
  Chromium/Firefox/WebKit suite.
- Inspect the rendered folder hierarchy, command wording, review note, keyboard
  focus, and responsive behavior in a local browser.
- Inspect the final diff, commit history, and working tree. Do not deploy or push
  without an explicit request.

