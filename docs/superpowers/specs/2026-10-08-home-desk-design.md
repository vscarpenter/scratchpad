# Home desk and highlights: design spec

Date: 2026-10-08
Status: approved

Vinny reviewed a clickable mockup on 2026-10-08, built from screenshots of
the Folio notes app, and approved it as shown. He asked for the spec and the
build with no further approval stop. This spec records the decisions the
mockup left open.

## Decision

When no note is open, the document stage shows **Home**: a calm desk with a
time-of-day greeting, three quick starts, pinned notes as cards, and recently
edited notes. Home takes the slot of the "Select a note" placeholder, which
auto-selection made almost unreachable. On wide screens Scratchpad now opens
to Home by default, and Settings > Open to brings back the old landing.

Separately, `==text==` renders as a highlight, and the formatting toolbar
gains a chip for it.

## Where Home appears

- Home is a stage state at viewport widths of 768px and up. Below that, the
  single-pane list/editor model stays exactly as it is, and the note list
  stays the phone's home.
- At launch, Home shows when Open to is Home (the default) and the Notes view
  has at least one note. The first visit still opens the pinned Welcome note,
  as the first-run design requires. An `?action=` launch (new, today,
  capture, save-shared) runs its action as before.
- Clicking Home in the note index opens Home in the Notes view. It resets the
  folder scope as before, clears a tag filter, and asks before discarding
  unsaved edits. In Archive, and below 768px, the Home button keeps its
  current job of resetting the folder scope.
- The palette and the command bar gain "Go to Home".
- Home stays until a note opens or is created, the view changes to Archive or
  Trash, a search starts, or a tag filter applies. Each of those selects a
  note today, so behavior after Home ends is unchanged. Switching folders
  keeps Home open, and New note files into the folder in view, as it does
  today.

## Open to setting

Settings > Appearance gains an Open to row with two choices, Home and Top
note. Top note opens the first note in the list (the latest pinned note,
otherwise the latest note), which is how every launch worked before. The
choice lives in localStorage as `scratchpad:openTo` (`home` or `note`). A
missing or unreadable value means Home. Reloads follow the setting, so a
reload with Home selected returns to Home, where the note you were editing
leads Recently edited.

## What Home shows

1. A header: the local date as a mono eyebrow, a serif greeting by local hour
   (morning before noon, afternoon before 5 p.m., evening otherwise), and one
   line with the note count and the local-only promise. A primary New note
   button sits beside it.
2. Three quick-start tiles, each running an existing command. Today's note
   reports today's word count or "Not started yet". Quick capture adds a line
   to today's note. From a template opens the command palette filtered to
   templates, and its meta counts templates or names the Templates folder
   convention. Tiles carry the same shortcut hints as the command bar.
3. Pinned: up to three cards of pinned active notes, most recently edited
   first. Each card shows the title in the serif, a three-line plain-text
   excerpt, the folder, and when it was last edited. "Show all N" expands the
   grid when more than three are pinned. With nothing pinned, one line
   explains how to pin.
4. Recently edited: the six most recently edited active notes, as a list or a
   grid. The layout choice persists in `scratchpad:deskLayout`. Folder chips
   narrow the six to one folder: All notes plus up to six folders, ordered by
   their latest edit, shown only when recent notes span two or more folders.
5. A closing line: "Everything on Home comes from this browser. Nothing here
   is sent anywhere."

Relative times read "Just now", "12 minutes ago", "3 hours ago",
"Yesterday", a weekday within the last week, then "Oct 2", and "Oct 2, 2025"
for earlier years.

## Visual rules

- Tokens only: no new tokens, no hex values, and no dark-mode rules in
  `app.css`. Home sits on the document stage. Tiles and cards are flat
  `--paper` surfaces with hairline borders, so the document remains the only
  raised surface: no shadows, blur, or gradients. Hover strengthens the
  hairline to `--accent-strong-border` and tints the tile icon.
- The serif carries the greeting and card titles, the sans carries the
  chrome, and mono carries the date eyebrow, times, and shortcut hints.
  Indigo marks the primary button, focus, the hovered icon, and the selected
  chip.
- Grids collapse to one column as the stage narrows, so the 768px case, with
  about 390px of stage beside the index, never overflows.

## Accessibility

- Home is a region labeled by its greeting, an h2. Sections use h3.
- Cards and recent rows are buttons named "Open <title>". Chips and the
  layout toggle expose `aria-pressed`. Shortcut hints are `aria-hidden`, and
  the tiles carry `aria-keyshortcuts` instead.
- Opening a note from Home moves focus to the note title, because the clicked
  card no longer exists. A rebuild of Home keeps focus on the same chip.
- Targets stay at least 44px tall where space allows, focus outlines stay
  visible, and motion respects reduced motion.

## Highlights

- Syntax: `==text==` with a non-space character at both inner ends, the same
  convention Obsidian and iA Writer use. Code spans and code blocks never
  highlight, and `a == b` with spaces never matches.
- Rendering: a marked inline extension emits `<mark>`, which DOMPurify's HTML
  profile already allows. The style is a soft indigo tint (`--accent-soft`)
  with inherited text color, no underline, and normal weight. That reads
  differently from a search hit, which uses the stronger tint, an underline,
  and bold. A search term inside highlighted text still gets its search hit,
  because search-view now skips only existing `mark.search-hit` nodes.
- The share viewer renders highlights the same way. Markdown export, the
  linked folder, and backups keep the `==` source untouched.
- The formatting toolbar gains a Highlight chip that wraps the selection in
  `==`.

## Architecture

- New `public/js/home-desk.js` exports a frozen `window.ScratchpadHomeDesk`
  under `// @ts-check`, within the v18 limits (400 lines per file, 40 per
  function, nesting depth 3). It owns stage switching (`show(which)` for the
  editor, Home, and the four empty states), the Home render, the launch
  decision, the Home button, and the Go to Home command. app.js hands it
  state and existing actions at init. The module joins `index.html` ahead of
  app.js, `APP_SHELL` in `public/service-worker.js`, and `jsconfig.json`.
- `public/js/settings.js` reads and writes Open to and binds both settings
  choice groups.
- app.js nets out below its recorded ceiling. Moving `showEmpty` and
  `hideAllEmpties` into the module pays for the hookup, and the ceiling in
  `config/structure-baseline.json` tightens to the new count.
- No new network calls. `tests/network-isolation.spec.js` gains an assertion
  that opening Home and using its controls sends nothing.

## Tests and docs

- `tests/home-desk.spec.js` covers the launch rules, the first visit, Open to,
  the Home button, every exit, the three tiles, pinned cards and Show all,
  the recent list, grid, and chips, phone width, focus handoff, and zero
  network requests.
- `tests/highlights.spec.js` covers rendering, the code and spacing
  exclusions, sanitization, the toolbar chip, search hits inside a highlight,
  and the share viewer.
- `tests/helpers.js` sets Open to = Top note for existing specs unless a spec
  chooses otherwise, so their landing assumptions hold. The Home spec covers
  the default.
- The coverage workflow visits Home. `guide.html` gains a Home section, the
  highlight syntax, and the setting. README and `tests/README.md` list both
  features.

## Out of scope

Restoring the open note on reload, Home on phones, multiple highlight colors,
converting pasted `<mark>` to `==`, a keyboard shortcut for Home, and editing
on the desk itself.
