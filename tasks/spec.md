# Spec: colorize pass, Indigo marks where you are

Status: direction approved by Vinny on 2026-11-12 from before and proposed
screenshots in `.verify/colorize-compare/`. Branch `feat/colorize-wayfinding`.

## Goal

A person can see where they are at a glance in both themes. The current
navigation item, the open note, today's date, and each folder's identity use
the one accent and the folder colors people already pick. No new hues.

## What the audit found

- Open Canvas v6 shows "current" two ways. The calendar's selected day, the
  folder switcher's current row, the command bar's active item, and
  bulk-selected rows use `--accent-soft`. The navigation's current item and
  the open note's row use gray `--control-fill`, the same family as hover.
- `--text-muted` fails AA on the Indigo tint: 3.90:1 in light and 3.83:1 in
  dark. Bulk-selected rows already carry this failure.
- Folder colors (accent, olive, sky, gray) appear as dots on Home, in the
  folder switcher, and in the move dialog. The v6 navigation draws every
  folder with the same gray glyph.
- Today's 2px underline collides with the has-note dot under the same numeral.

## Inputs and outputs

- `workspace-navigation.js` `folderButton(folder, selected)` sets
  `data-color` when `folder.color` is set. `app.js` already passes full folder
  records, and `normalizeFolder` limits `color` to the four palette names or
  null, so the module trusts the value.
- `inkwell-tokens.css` gains one derived token, `--accent-text-secondary`, for
  secondary text on an accent tint:
  `color-mix(in srgb, var(--accent-text) 45%, var(--ink))`. It's declared once
  in `:root` and resolves per theme, the way `--surface-rail` does.
- `app.css` changes, all in the Open Canvas section:
  1. `.workspace-item[aria-current]` uses `--accent-soft`. Text stays ink at
     600, and the icon stays `--accent-text`. Hover on other items stays
     `--control-fill-hover`.
  2. `.note-row.is-active` outside bulk mode uses `--accent-soft`. In bulk mode
     the open note stays `--control-fill` until it's checked, so it never reads
     as selected.
  3. On a tinted row (the open note, or a checked row in bulk mode), the
     excerpt uses `--accent-text-secondary`, and the time and "+N" use
     `--accent-text`. Tag chips on the open note sit on `--paper`.
  4. `.chronicle-day.is-today` drops the underline and uses `--accent-text` at
     weight 650. Under `forced-colors: active` the underline comes back,
     because that mode discards author colors.
  5. A colored folder's glyph strokes in
     `color-mix(in srgb, <folder color> 72%, var(--ink))` and fills with
     `color-mix(in srgb, <folder color> 24%, transparent)`. It keeps that color
     when it's the current item. Uncolored folders keep the muted glyph. Under
     forced colors the fill drops to none.

## Constraints

- Tokens only in `app.css`, with no hex. `color-mix()` over tokens is fine.
- Indigo stays the sole accent. Success, warning, and danger stay state-only.
  The folder palette is user data that already ships.
- The dark blocks stay byte-parallel. The new token is derived, so neither
  dark block changes.
- No `app.js` change, so its line ceiling holds.
- The new spec file meets the v18 limits: 40 lines per function, nesting depth
  three, and 400 lines per file.
- No raw DOM writes. The module only assigns `dataset`.

## Edge cases

- Bulk mode: an unchecked open note stays neutral, and a checked note is
  tinted whether or not it's open.
- Today in the leading or trailing days of another month keeps Indigo over the
  muted `is-outside` color.
- Today and selected: tint plus the Indigo numeral. Selected only: tint. Today
  only: the Indigo numeral with no fill.
- Hovering the current nav item or the open row keeps the tint.
- Archive and Trash tint the open row the same way. Trashed titles use
  `--text-secondary`, which clears AA on the tint (6.61:1 light, 5.78:1 dark).
- A stored folder color outside the palette never reaches the navigation,
  because `normalizeFolder` replaces it with null.
- Phones host the navigation in the native dialog, with the same rules.
- Forced colors: the existing block already outlines tint-only selection.
  Today gets its underline back, and folder fills drop.

## Anti-goals

- No tinted tags, colored headings, or new hues.
- No change to Home, prose, callouts, highlights, or the pin color.
- No colored side stripes. The craft floor bans side borders over 1px on list
  items.
- No folder dots in the breadcrumb or the list header in this pass.

## Acceptance criteria

1. The current navigation item and the open note's row compute to
   `--accent-soft`. A hovered nav item that isn't current doesn't.
2. Title, excerpt, time, "+N", and tag text on the open note's row clear 4.5:1
   against their composited backgrounds in light and dark.
3. In bulk mode the open note computes to `--control-fill` until it's checked,
   then to `--accent-soft`.
4. Today's button computes to `--accent-text`, weight 600 or more, with no
   underline. Under forced colors it shows an underline (Chromium only).
5. A colored folder's glyph has a fill other than `none` and a stroke that
   clears 3:1 against the navigation in light and dark. It keeps that stroke
   when current. An uncolored folder's glyph has fill `none`.
6. The open note's excerpt computes to the resolved `--accent-text-secondary`,
   so a missing token fails instead of falling back to ink.
7. `npm run verify` passes, and the Chromium and WebKit suites pass locally.
   Firefox runs in CI.
8. Desktop, tablet, and phone captures in both themes match the approved
   comparison.

## Test stubs

`tests/wayfinding-color.spec.js` (new):

- `test('the current nav item and the open note share the selection tint')`
- `test('text on the open note clears AA in light and dark')`
- `test('bulk mode keeps the open note neutral until it is checked')`
- `test('today is an Indigo numeral, underlined only in forced colors')`
- `test('folder glyphs carry their chosen color, current or not')`

`tests/design-tokens.spec.js` stays untouched. It has never been formatted, so
editing it drags the whole file into the format sweep, and formatting pushes
`assertContracts` past the 40-line ratchet. The rendered tests above check the
same pairs on the real tint in both themes.

## Assumptions

- The 72% stroke mix and 24% fill match the approved mock. If a stroke misses
  3:1 on the navigation, the mix moves toward ink.
- Today uses the selected day's weight (650), so the two share one numeral
  style and differ by fill.
- `DESIGN.md`, `CLAUDE.md`, and the Open Canvas spec each get a short note on
  this color grammar, because each lists what Indigo marks.
