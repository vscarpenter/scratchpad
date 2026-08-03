# Monthly Daily Notes navigation and review — design spec

Date: 2026-08-03
Status: approved

## Overview

Extend the existing Daily Notes workflow in two deliberately quiet ways:

1. Group daily notes by month inside the managed **Daily Notes** folder.
2. Add an on-demand command that creates or opens a **Monthly Review** note for
   the relevant month.

The month grouping solves navigation as daily notes accumulate. The Monthly
Review supports reflection without copying daily-note bodies, creating an
automatic month-end artifact, or adding permanent calendar chrome.

## Goals

- Make an older daily note findable by month without search or a long flat scan.
- Keep the current five-day Chronicle rail focused on recent wayfinding.
- Let a user begin a monthly reflection from the command palette.
- Preserve each daily note as the source of truth.
- Keep the behavior static, local-only, backup-compatible, and accessible.

## Non-goals

- Do not concatenate daily-note bodies into a monthly document.
- Do not copy or synchronize tasks between daily and monthly notes.
- Do not create monthly reviews automatically or show reminders and badges.
- Do not add a month calendar, analytics, telemetry, or remote summarization.
- Do not place ordinary Monthly Review notes in the managed Daily Notes folder.

## Daily Notes month grouping

Month grouping appears only in the Folders presentation of the managed Daily
Notes folder. It applies in both Notes and Archive; Recent grouping, search, and
tag-filter results remain flat.

- Derive the month from the note's validated local `dailyDate` (`YYYY-MM-DD`).
- Render months newest first and days newest first within a month.
- Preserve adopted legacy members without a `dailyDate` in an expanded
  **Undated** group after the dated months so they remain visible and movable.
- Each month has a native button showing the localized month/year and note count.
- Each button exposes `aria-expanded` and `aria-controls` and toggles its rows.
- The current month is expanded by default; older months are collapsed by
  default. Explicit choices persist locally per lifecycle view and month.
- Month controls use the existing Porcelain/Indigo tokens, sentence case, a
  visible focus state, and a 44px target. Spacing establishes hierarchy without
  nesting cards inside the folder.
- The parent Daily Notes folder retains its existing count, disclosure, reorder,
  and managed-action behavior.

## Monthly Review target

The command palette contains one contextual action:

- If the selected note is a daily note, target that daily note's month.
- If the selected note is a Monthly Review, target that review's month.
- Otherwise target the previous completed calendar month.

The visible command label names the month and whether the action will create or
open it, for example **Create July 2026 monthly review** or
**Open July 2026 monthly review**. Search keywords include `monthly`, `review`,
`reflection`, and `recap`.

## Monthly Review identity and lifecycle

Monthly Review identity lives in an optional `monthlyReviewMonth` field with the
validated shape `YYYY-MM`. It does not depend on the title, so users may rename
reviews freely.

- At most one active-or-archived review is opened for a month; the newest is
  chosen if imported data contains duplicates.
- A review in Archive opens in Archive without being unarchived.
- A review in Trash does not block creating a replacement.
- A duplicated review becomes an ordinary copy with no monthly identity.
- A new review is an ordinary active note in **Notes**, tagged
  `monthly-review`; it remains movable, editable, archivable, and deletable.
- JSON and encrypted backups preserve the optional field through normal note
  serialization. Markdown export/import uses `monthlyReviewMonth` frontmatter.

## Generated review note

A new review uses the title `Monthly Review — <Month Year>` and opens directly
in edit mode. Its body contains writable prompts followed by a link index:

```markdown
## Highlights

## Decisions

## Open loops

## Next month

## Daily notes

- [[Wed, Jul 1, 2026|Jul 1 · Wed]]
```

Only non-trashed daily notes from the target month are linked, in chronological
order. Daily-note bodies and tasks are never copied. The generated index is a
starting snapshot, not a synchronized report; after creation the note belongs
fully to the user.

## Dirty editor and cross-tab behavior

Creating or opening a review reuses the existing discard confirmation when the
current editor has unsaved changes. Persistence uses the ordinary note write and
broadcast paths, so another tab observes the new review like any other note.

## Verification

- Playwright coverage for month order, day order, default disclosure, persisted
  disclosure, Archive grouping, and flat search/Recent behavior.
- Playwright coverage for contextual command labels, generated prompts and
  links, rename-safe reuse, Archive reuse, Trash replacement, dirty-editor
  protection, and duplicate behavior.
- JSON and Markdown round-trip coverage for `monthlyReviewMonth`.
- Keyboard, focus, responsive, CSP, and full cross-browser regression checks.
