# Open Canvas — approved notebook redesign (v6)

Approved by the user on 2026-11-10 following the screenshot comparison.
Supersedes the v5 shell, date spine, raised document, and prose typography.

## Composition

- Desktop, 1100px and wider: persistent 208px navigation, 330px note index, open document.
- Tablet, 768–1099px: persistent 176px navigation; list and document share the remaining column with Back navigation.
- Phone, below 768px: one pane; navigation opens in a named native modal dialog.
- Navigation exposes Home, Notes, Daily Notes, Pinned, folders, Archive, Trash, search, and settings.
- A month calendar sits above the note list. Previous/next month and Today work across year boundaries. Date buttons open or create the existing local daily note, never duplicate it.
- Calendar keyboard navigation uses arrows, Home/End for the week, and Page Up/Down for months. Only one date is in the tab sequence. Today and the selected date have distinct semantics.
- The calendar starts collapsed on phones and can be expanded. It remains independently collapsible elsewhere.

## Visual direction

- Warm near-white surfaces, hairline column dividers, flat note rows, no raised document or decorative date spine.
- Indigo remains the sole accent. State and focus remain visible in both themes.
- Platform serif for title and body; system sans for chrome and section headings; mono for code.
- Prose: 20px desktop/tablet, 18px phone, 1.6 line height, 680px maximum measure.
- Reading and the Markdown textarea share font metrics and content width.
- Preserve Edit/Save, draft protection, history, folder management, search, backups, encryption, and sharing.
- Quiet hover/focus feedback; no entrance or swipe animations.

## Amendment, 2026-11-12: Indigo marks where you are

Approved by Vinny from before and proposed screenshots.

- The current navigation item and the open note's row use `--accent-soft`, the
  tint the selected day, folder switcher, and command bar already use. Hover
  stays gray. Bulk mode keeps the open note neutral until it's checked.
- Text on the tint uses `--accent-text` and the derived
  `--accent-text-secondary`, because `--text-muted` fails AA there.
- Today is an `--accent-text` numeral at weight 650. The underline collided
  with the has-note dot, so it returns only under forced colors.
- Navigation folder glyphs take their chosen palette color: a soft fill and a
  stroke mixed with ink to clear 3:1. Uncolored folders stay muted.

## Constraints and verification

No runtime dependencies, remote assets, new network requests, database migration, release bump, or deployment.
Keep the user's existing version.js change untouched. Preserve modal focus, unsaved-draft confirmation, internal scrolling, offline precache, and all six inline CSP scripts.

Tests cover navigation/filtering, month/year boundaries, daily-note identity, keyboard/drawer focus, read/edit parity, and responsive geometry. Run npm run verify and the complete three-browser suite; inspect desktop, tablet, and phone in both themes.
