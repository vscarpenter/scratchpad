# Archive state for notes — implementation plan

**Goal:** Implement the approved Archive lifecycle in
`docs/superpowers/specs/2026-07-30-archive-state-design.md`.

**Architecture:** Add nullable `archivedAt` to existing note records and derive
Active/Archived/Trash in the app layer. Reuse the current note store, sidebar,
folder grouping, editor, bulk toolbar, command palette, BroadcastChannel,
backup, import, and Markdown ZIP paths. Keep IndexedDB v3; advance native
backup payloads to schema v4.

## Task 1: Durable design records

- Add the Archive glossary to `CONTEXT.md`.
- Record the nullable-timestamp choice in ADR 0001.
- Add the approved design spec and this implementation plan.
- Commit documentation as a focused boundary.

## Task 2: Lifecycle characterization and failing tests

- Add Archive-focused helpers and fixtures without changing production code.
- Add failing tests for normalization, the four timestamp combinations,
  Archive/Unarchive, Trash/Restore provenance, ordering, and legacy records.
- Add failing view-switch, empty-state, search-scope, and metadata assertions.
- Run the focused Chromium tests and prove the new assertions fail for the
  intended missing behavior.

## Task 3: Core model and Archive view

- Add lifecycle helpers and normalize `archivedAt`.
- Split Active, Archived, and Trashed collections with Trash precedence.
- Add the Archive view switch and lifecycle-aware selection/rendering.
- Reuse Folders/Recent grouping with Archive-specific non-empty folder
  presentation and Archive-date ordering.
- Add Archive empty states, row timestamps, breadcrumb, metadata, and dormant
  pin presentation.
- Run focused tests and commit.

## Task 4: Single and bulk lifecycle actions

- Add Archive/Unarchive overflow actions.
- Add lifecycle-aware bulk actions.
- Preserve dirty drafts and editor focus.
- Add action toasts with Undo.
- Follow single notes to the destination view; keep bulk workflows in place.
- Add contextual command-palette actions and Archive-aware note results.
- Add action, keyboard, focus, and mobile tests.
- Run focused tests and commit.

## Task 5: Organization and note-feature integrations

- Preserve folder membership and dormant pins across lifecycle changes.
- Let archived notes move folders, edit tags, toggle tasks, share, export,
  restore revisions, and edit without unarchiving.
- Make folder deletion count and update Active plus Archived members.
- Make tag management cover both preserved states and route Filter correctly.
- Keep normal Duplicate output Active.
- Add integration tests and commit.

## Task 6: Daily Notes, links, and cross-tab behavior

- Reuse archived Daily Notes for Open today and Quick Capture.
- Limit Daily template lookup to Active notes.
- Keep archived notes in wikilink resolution, backlinks, autocomplete, and
  rename rewriting with clear Archived metadata.
- Add lifecycle-only cross-tab refresh behavior that preserves dirty editors.
- Add focused Daily Note, wikilink, and multi-page tests.
- Run focused tests and commit.

## Task 7: Backup and Markdown compatibility

- Advance native backup payloads/import validation to schema version 4.
- Preserve `archivedAt` through JSON and encrypted backup round-trips.
- Keep version 2/3 imports Active by default.
- Export archived Markdown below `archive/`.
- Add and parse ISO `archivedAt` frontmatter.
- Preserve Archive state for import-as-duplicates.
- Add backup/import/export tests and commit.

## Task 8: Documentation and diagnostics

- Add Archived count to diagnostics.
- Update README, Guide, About, and test coverage documentation.
- Keep Restore and Unarchive terminology distinct everywhere.
- Update any release metadata required by the repository's normal release
  checks, without deploying.
- Run documentation/static-page coverage and commit.

## Task 9: Final verification

- Run JavaScript syntax checks.
- Run all focused Archive-related Chromium tests.
- Run the complete Playwright suite with one worker across Chromium, Firefox,
  and WebKit.
- Run the CSP hash verifier.
- Manually verify the running app at desktop/mobile widths in light/dark modes.
- Inspect the final diff, commits, and worktree without staging unrelated
  files.
