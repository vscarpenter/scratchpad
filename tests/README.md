# End-to-end functional coverage

The Playwright suite covers Scratchpad's user-facing browser behavior across
Chromium, Firefox, and WebKit. The external `mailto:` handoff is verified in
Chromium because Playwright exposes external-protocol navigation details there.

| Product area | End-to-end specs |
| --- | --- |
| First visit and starter notes | `first-run.spec.js` |
| Create, edit, save, format, pin, delete, restore, and empty states | `notes-crud.spec.js`, `note-organization.spec.js` |
| Search, filters, tags, ordering, bulk actions, and mobile navigation | `enhanced-search.spec.js`, `note-organization.spec.js`, `reliability.spec.js`, `bulk-actions.spec.js`, `mobile-navigation.spec.js` |
| Markdown rendering, sanitization, task lists, wikilinks, and backlinks | `notes-crud.spec.js`, `sanitization.spec.js`, `task-lists.spec.js`, `wikilinks.spec.js` |
| Daily notes, quick capture, action URLs, and keyboard shortcuts | `daily-note.spec.js`, `keyboard-shortcuts.spec.js` |
| Drafts, revisions, failed writes, and multi-tab conflicts | `reliability.spec.js`, `revision-history.spec.js`, `cross-tab-conflicts.spec.js` |
| JSON, Markdown, and encrypted import/export plus sharing | `import.spec.js`, `markdown-import.spec.js`, `encrypted-backup.spec.js`, `share-export.spec.js`, `backup-reminder.spec.js` |
| Diagnostics, persistent storage, data erasure, and update recovery | `diagnostics.spec.js`, `storage-protection.spec.js`, `data-erasure.spec.js`, `pwa-lifecycle.spec.js` |
| Offline shell, same-origin privacy, and static pages | `pwa.spec.js`, `network-isolation.spec.js`, `guide.spec.js`, `static-pages.spec.js` |
| Theme, accessibility semantics, touch targets, and responsive layout | `theme.spec.js`, `static-pages.spec.js`, `accessibility-semantics.spec.js`, `touch-targets.spec.js`, `layout-scroll.spec.js` |
| Command palette and every documented navigation surface | `command-palette.spec.js`, `guide.spec.js`, `static-pages.spec.js` |

Operational AWS deployment behavior, CloudFront configuration, browser install
chrome, and the external email client itself are outside the browser E2E
boundary. Their in-app triggers and generated handoffs are covered.
