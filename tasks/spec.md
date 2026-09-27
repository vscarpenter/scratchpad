# Spec: the six high items from the 2026-09-26 usability review

Vinny approved the design in session on 2026-09-26, as written, with three
choices: a Settings dialog that takes over the theme control and the "Your
data" rows, a gear in the sidebar header in place of the theme icon, and a
compact Today row on every width. The standing design-approval correction
authorizes one continuous pass from here.

Branch: `feat/high-review-items`, stacked on `fix/critical-review-items`
(PR #14). The PR targets that branch until #14 merges.

## Goal

Six usability fixes, one commit each, in this order:

1. The folder-delete dialog fits a phone and steers toward the safe choice.
2. The formatting toolbar fits a phone and stops covering the first lines.
3. Edit mode starts at the top of the note, and ⌘/Ctrl+E opens it.
4. Bulk "delete forever" and the erase-with-live-shares warning use
   hold-to-confirm dialogs instead of `window.confirm`.
5. The sidebar shows the first note at least 80px higher.
6. Settings has a home: a dialog with a labeled theme choice and the data rows
   that used to live in About.

## Shared constraints

- Tokens only in `app.css`. No hex values, no new tokens, no `@font-face`, no
  blur or gradient in the shell, no emoji, no `innerHTML`.
- No new network calls. `tests/network-isolation.spec.js` stays untouched.
- `public/js/app.js` sits at 6,167 lines against a 6,168 ceiling. Every line
  added there is paid for by moving code into a module that meets the v18
  limits (400 lines per file, 40 per function, nesting depth 3). The ceiling in
  `config/structure-baseline.json` ends at or below the final count.
- New modules follow the `mobile-view.js` pattern: `// @ts-check`, a block
  scope, a frozen `window.ScratchpadX` export, JSDoc types, and entries in
  `jsconfig.json`, `APP_SHELL` in `public/service-worker.js`, and a script tag
  in `index.html` ahead of `app.js`.
- No inline script changes. The theme script at the bottom of `index.html`
  keeps its CSP hash, so `#theme-toggle` and `#theme-label` stay in the DOM.
  Confirm with `bash cloudfront/recompute-csp-hashes.sh`.
- No dark-mode rules in `app.css`. Color pairs reuse pairs the token tests
  already validate.
- Every touched spec file is biome-formatted in full (the format ratchet).
- Vinny-voice for every string a user reads.

## 1. Folder-delete dialog

Inputs: `#folder-delete-dialog` at `index.html:459`, its `.dialog-foot`, the
vendored `.dialog-foot` rule in `inkwell-components.css:651` (not edited).

Outputs:
- `app.css` rule `#folder-delete-dialog .dialog-foot { flex-wrap: wrap; }`.
- `#folder-delete-keep` becomes `.btn-primary`; label "Keep the notes".
- `#folder-delete-trash` label "Move to Trash". Cancel stays.
- The copy in `#folder-delete-copy` still explains both outcomes.

Edge cases: a folder with zero notes keeps the same dialog (the copy already
handles the count).

Acceptance:
- At 375×812 the dialog's `scrollWidth` equals its `clientWidth`, and every
  footer button's box is inside the dialog's box.
- `#folder-delete-keep` has class `btn-primary`; `#folder-delete-trash` keeps
  `btn-danger`.
- `tests/folders.spec.js` still passes with the new labels.

## 2. Formatting toolbar on phones

Inputs: `.editor-format` at `app.css:1559` (sticky pill, `margin: 0 auto
-14px`), the narrow override at `app.css:70` (`overflow-x: auto`), the
textarea's `padding: 26px 22px 20px` in edit mode at `app.css:1866`.

Outputs, inside the existing `(pointer: coarse), (max-width: 640px)` block:
- `.editor-format { flex-wrap: wrap; justify-content: center; width: 100%;
  overflow: visible; margin: 0 0 8px; }` so the pill wraps to a second row
  and sits above the field.
- `.editor-card.is-editing .note-editor { padding-top: 16px; }` so the field
  no longer reserves space for an overlap that no longer happens.

Edge cases: landscape phones above 640px keep the desktop pill. Reduced
transparency and no-blur fallbacks already cover the pill's background.

Acceptance, at 375×812 in edit mode:
- Every `.fmt-chip` box satisfies `x >= 0` and `x + width <= 375`.
- The pill's bottom edge is at or above the textarea's top edge plus its
  top padding.

## 3. Edit mode entry

Inputs: the Edit handler at `app.js:5768`, the render branch that resets
`editorCard.scrollTop` at `app.js:2113`, `onGlobalKey` at `app.js:5990`,
the shortcut lists in `index.html:618` and `guide.html:553`.

Outputs:
- When edit mode opens for a note (`showInput && (!lastEditorMode ||
  noteChanged)`), the textarea gets `setSelectionRange(0, 0)` and
  `scrollTop = 0` after its value is set.
- ⌘/Ctrl+E in view mode with a selected, non-trashed note runs the same path
  as the Edit button. While editing, or with a dialog open, or with no note,
  it does nothing and does not prevent default.
- About and the guide list "⌘/Ctrl + E: Edit the open note".

Edge cases: ⌘E while typing in search is still "enter edit mode" (search is
not a text field in the note); ⌘E in the palette input is swallowed by the
open dialog rule.

Acceptance:
- After clicking Edit on a note whose body is longer than the textarea,
  `selectionStart === 0` and `scrollTop === 0`.
- ⌘E from view mode shows the textarea with focus inside it.
- ⌘E with the command palette open leaves the palette open and the note in
  view mode.
- `guide.spec.js` and the About shortcut list include the new row.

## 4. Two confirm boxes

Inputs: `bulkDeleteForever` at `app.js:3082` (`window.confirm`), the erase
flow at `app.js:3941` (`window.confirm` after revoke attempts),
`#permanent-delete-dialog` at `index.html:490` with its `data-hold-confirm`
button, `confirmDiscard` at `app.js:3962` (promise around a dialog),
`tests/bulk-actions.spec.js`, `tests/data-erasure.spec.js:116`.

Outputs:
- A promise helper `confirmDialog(dialog, confirmButton)` replaces the
  hand-rolled `confirmDiscard` and serves all three dialogs. It lives in
  `public/js/dialogs.js` (already a module) to pay for the app.js lines.
- Bulk delete forever opens `#permanent-delete-dialog` with its title set to
  "Permanently delete N notes?" and copy "This removes N notes, their drafts,
  and their revision history from this browser." The hold button is reused.
  Single-note wording is restored when the dialog serves one note.
- The erase flow opens a new `#erase-shares-dialog` when links stay live:
  title "Some share links stay live", copy naming the count and the
  consequence, Cancel, and a `data-hold-confirm` button "Hold to erase
  anyway". Cancel keeps local data.
- No `window.confirm` remains in `public/js`.

Edge cases: the erase dialog opens on top of the erase dialog's closure, so
the erase dialog closes first (native dialogs stack, but one modal at a time
keeps focus return simple).

Acceptance:
- `grep -c "window.confirm" public/js/*.js` is 0.
- Bulk delete forever of two trashed notes: the dialog title contains "2
  notes"; a plain click does nothing; a 1.15s hold deletes both.
- Erase with one stubbed share that fails to revoke: the second dialog
  appears with "1 share link"; Cancel leaves the notes in place; a hold
  erases and lands on about.html.

## 5. Sidebar height

Inputs: `.sidebar-head` gap 11px at `app.css:159`, the date heading at
`app.css:4438` (23px serif, wraps to two lines), `.chronicle-daily-card` at
`app.css:4445` (72px min-height, two-line card), the segmented view switch,
the Home/Folders row.

Outputs:
- The heading becomes one line: `font: 600 19px/1.15 var(--serif)`,
  `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
- The Today card becomes a row: `min-height: 36px; padding: 8px 12px;
  display: flex; align-items: center; justify-content: space-between`, the
  title stays, the copy line is removed from the markup, and a small
  chevron glyph (inline SVG stroke) marks it as a link.
- `.sidebar-head` gap drops from 11px to 8px.
- The `aria-label` "Open today's daily note" stays.

Edge cases: the rail still highlights today and its Today button is
untouched. On 375px the brand row is unchanged.

Acceptance, with seeded notes:
- At 1280×800 the first `.note-row` top is at most 335px (was 415).
- At 375×812 the first `.note-row` top is at most 350px (was 430).
- `#today-note` is visible at both sizes and opens today's note.
- `daily-note.spec.js`, `porcelain-chronicle.spec.js`, `touch-targets.spec.js`
  and `layout-scroll.spec.js` stay green (44px target keeps applying under
  coarse pointer).

## 6. Settings dialog

Inputs: the About dialog at `index.html:528` (paragraphs, Your data, Erase,
shortcuts, links), `openAboutDialog` and `renderDiagnostics` at
`app.js:4136`, the theme toggle at `index.html:78` and its inline script at
`index.html:1003`, the command list at `app.js:4492`, specs that reach the
data rows through `#open-about`.

Outputs:
- New `#settings-dialog` with three sections: Appearance (a segmented
  `role="group"` "Theme" with three `aria-pressed` buttons Auto, Light,
  Dark), Your data (the existing `#diagnostics-panel` moved as-is), and
  Erase local data (the existing `.danger-zone` moved as-is).
- The sidebar header's theme icon is replaced by `#open-settings` (gear,
  `aria-label="Settings"`). `#theme-toggle` and `#theme-label` move into the
  settings dialog, hidden, so the inline script keeps working; a comment
  names the CSP coupling.
- `public/js/settings.js` owns the theme control: reads `theme-preview`,
  applies `data-theme` on `<html>` the same way the inline script does,
  writes the key, sets `aria-pressed`, and keeps the hidden label in step.
- About keeps its paragraphs, the shortcut list, and the footer links. The
  "Your data" and Erase sections leave it.
- Palette command "Open settings" (keywords: theme, dark, light, backup,
  storage, folder, erase).
- `tests/helpers.js` gains `openSettings(page)`; the specs that used
  `#open-about` to reach data rows switch to it.
- `theme.spec.js` drives the new control: Light and Dark set the attribute,
  Auto removes it, the choice persists across reload, and the pre-paint
  script still applies it before first paint.
- The guide's About mention of the theme is added to its Settings paragraph.

Edge cases: a stored value outside auto/light/dark reads as auto. The
content pages keep their own toggle. Erase still clears `theme-preview`.

Acceptance:
- `#open-settings` opens the dialog; Escape closes it and returns focus.
- The three theme buttons reflect the stored value on open; clicking Dark
  sets `data-theme="dark"` and `aria-pressed="true"`; reload keeps it.
- `#theme-toggle` no longer appears in the sidebar header.
- Diagnostics, storage protection, linked folder, PWA lifecycle, and erase
  specs pass through `openSettings`.
- The About dialog no longer contains `#diagnostics-panel`.

## Anti-goals

- No density, font-size, or default-view settings.
- Archive and Trash stay in the segmented control.
- The Today row is not hidden beside the rail.
- No change to the inline theme script or any CSP hash.
- No rework of the medium or low review items.

## Test stubs

- `tests/folder-delete-dialog.spec.js`: fits a phone; keep is primary.
- `tests/format-toolbar-mobile.spec.js`: chips inside the viewport; pill
  above the field.
- `tests/edit-mode-entry.spec.js`: caret at top; ⌘E opens; ⌘E ignored with a
  dialog open.
- `tests/bulk-actions.spec.js`: delete forever needs a hold; the dialog names
  the count.
- `tests/data-erasure.spec.js`: live-share warning is a hold dialog; Cancel
  keeps data.
- `tests/sidebar-chrome.spec.js`: first row ceilings at both sizes; Today row
  opens today.
- `tests/settings.spec.js`: opens, theme control, sections present, About
  slimmed.
- `tests/theme.spec.js`: rewritten for the segmented control.

## Assumptions

- Stacking on `fix/critical-review-items` is acceptable; GitHub retargets
  the PR to main once #14 merges.
- The 80px sidebar target is met by the heading, the Today row, and the gap
  change alone. If it falls short, the segmented control's height is the next
  lever, not its removal.
- Keeping a hidden legacy toggle is the price of an unchanged CSP hash. It is
  removed the next time the inline script changes for another reason.
