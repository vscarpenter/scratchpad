# End-to-end functional coverage

The Playwright suite covers Scratchpad's user-facing browser behavior across
Chromium, Firefox, and WebKit. The external `mailto:` handoff is verified in
Chromium because Playwright exposes external-protocol navigation details there.
The guide popup test (`guide.spec.js` "command palette opens the guide in a
new tab") is CI-scoped: it launches a pristine browser process, but new-page
target attach starves on a busy local machine even solo, so it skips locally
with a visible reason and runs in CI (workers: 1, retries: 2) where it is
deterministic. `CI=1 npm test` forces the serialized shape locally.

| Product area | End-to-end specs |
| --- | --- |
| First visit and starter notes | `first-run.spec.js` |
| Home: launch rules, Open to, quick starts, pinned cards, recent notes, folder chips, tags, and focus handoff | `home-desk.spec.js`, `network-isolation.spec.js` |
| Note header and menu: the clickable breadcrumb, single-note Markdown download, and print | `breadcrumb.spec.js`, `note-menu.spec.js` |
| Create, edit, save, format, paste as Markdown, pin, delete, restore, and empty states | `notes-crud.spec.js`, `note-organization.spec.js`, `paste-as-markdown.spec.js` |
| In-note find and replace | `find-replace.spec.js` |
| Archive lifecycle, organization integrations, cross-tab routing, and portability | `archive.spec.js`, `archive-integrations.spec.js`, `archive-portability.spec.js` |
| Focused ranked search, operators, filters, tags, ordering, bulk actions, and mobile navigation | `focused-search.spec.js`, `search-operators.spec.js`, `enhanced-search.spec.js`, `note-organization.spec.js`, `reliability.spec.js`, `bulk-actions.spec.js`, `mobile-navigation.spec.js` |
| Markdown rendering, callouts, highlights, syntax highlighting, sanitization, task lists, wikilinks, backlinks, unlinked mentions, and the heading outline | `notes-crud.spec.js`, `callouts.spec.js`, `highlights.spec.js`, `syntax-highlighting.spec.js`, `sanitization.spec.js`, `task-lists.spec.js`, `wikilinks.spec.js`, `unlinked-mentions.spec.js`, `outline.spec.js` |
| Daily notes, month grouping, Monthly Reviews, managed folders, templates, quick capture, action URLs, and keyboard shortcuts | `daily-note.spec.js`, `quick-capture.spec.js`, `templates.spec.js`, `folders.spec.js`, `keyboard-shortcuts.spec.js`, `markdown-import.spec.js`, `share-export.spec.js` |
| Drafts, revisions, failed writes, and multi-tab conflicts | `reliability.spec.js`, `revision-history.spec.js`, `cross-tab-conflicts.spec.js` |
| JSON, Markdown, and encrypted import/export, image attachments, the linked folder, plus sharing and saving a shared note | `import.spec.js`, `attachments.spec.js`, `linked-folder.spec.js`, `markdown-import.spec.js`, `encrypted-backup.spec.js`, `share-export.spec.js`, `share-link.spec.js`, `share-lifecycle.spec.js`, `shared-copy.spec.js`, `backup-reminder.spec.js` |
| Diagnostics, persistent storage, data erasure, and update recovery | `diagnostics.spec.js`, `storage-protection.spec.js`, `data-erasure.spec.js`, `pwa-lifecycle.spec.js` |
| Offline shell, same-origin privacy, and static pages | `pwa.spec.js`, `network-isolation.spec.js`, `guide.spec.js`, `static-pages.spec.js` |
| Theme, accessibility semantics, touch targets, and responsive layout | `theme.spec.js`, `static-pages.spec.js`, `accessibility-semantics.spec.js`, `touch-targets.spec.js`, `layout-scroll.spec.js` |
| Command palette, the `?` shortcuts sheet, and every documented navigation surface | `command-palette.spec.js`, `shortcuts-sheet.spec.js`, `guide.spec.js`, `static-pages.spec.js` |
| Interaction feedback: the toast clock, its Undo burn-down bar, the task tick, hold to confirm on permanent deletes, and touch swipe actions on note rows | `toast.spec.js`, `task-tick.spec.js`, `hold-confirm.spec.js`, `swipe-row.spec.js` |

Operational AWS deployment behavior, CloudFront configuration, browser install
chrome, and the external email client itself are outside the browser E2E
boundary. Their in-app triggers and generated handoffs are covered.

- `share-update.spec.js`: explicit republishing, stable URLs and expiry, local-only
  edits, recipient reloads, independent links, drafts, retries, conflicts, rejected
  writes, and races with local erasure or another tab's saved changes.
- `share-infra/lambda/update.test.mjs`, `cleanup.test.mjs`, `s3-store.test.mjs`, and `provision.test.mjs`:
  owner authentication, conditional storage writes, expiry, replay handling,
  original-expiry cleanup, signed storage preconditions, and offline rollout gates.
