# Spec: Home desk and highlights

Vinny approved the clickable mockup on 2026-10-08 and asked for the spec and
the build without another approval stop. The design record is
`docs/superpowers/specs/2026-10-08-home-desk-design.md`; this file is the
working contract.

Branch: `claude/busy-keller-sj34zq`. One draft PR.

## Goal

1. When no note is open on a wide screen, the stage shows Home: greeting,
   quick starts, pinned cards, and recently edited notes. Scratchpad opens to
   Home by default, and Settings > Open to restores the old landing.
2. `==text==` renders as a highlight, and the toolbar can insert one.

## Inputs

- Stage switching: `showEmpty`, `hideAllEmpties`, and the `renderAll`
  decision tree in `public/js/app.js`; `#empty-pick-one` in `index.html`.
- Selection: `ensureSelectionForView`, `selectNote`, `openNoteFromCommand`,
  `createNote`, `openTodayNote`, `openQuickCapture`, `openCommandPalette`.
- Home button: `els.homeView` click handler (`setFolderView(null)`).
- Boot: `init`, `maybeSeedFirstRun`, `handleActionParam`.
- Settings: `#settings-dialog` Appearance section, `public/js/settings.js`
  `bindThemeChoice`.
- Highlights: `public/js/markdown.js` marked setup,
  `public/js/search-view.js` `highlightElement`, `public/js/editor-format.js`,
  `#editor-format` chips, `.note-rendered` and `.share-body` prose rules.

## Outputs

- `public/js/home-desk.js`, `window.ScratchpadHomeDesk` with
  `init(deps)`, `holds()`, `show(which)`, `goHome()`, and `commands()`.
- `#home-desk` section in `index.html` replacing `#empty-pick-one`, plus
  `#open-to-choice` in Settings and a Highlight chip.
- `.home-desk*` rules and a `mark` rule in `public/css/app.css`.
- `scratchpad:openTo` (`home` | `note`) and `scratchpad:deskLayout`
  (`list` | `grid`) in localStorage.

## Constraints

- No network calls, no third-party assets, no `innerHTML`, no emoji, no hex in
  `app.css`, no new tokens, no dark-mode rules, no inline-script edits (CSP
  hashes stay valid).
- app.js is at 6,021 lines against a 6,022 ceiling. The hookup must net
  negative, and the ceiling tightens to the final count.
- New module: `// @ts-check`, `'use strict'` at script level, a block scope, a
  frozen export, JSDoc types, under 400 lines, functions under 40 lines,
  nesting at most 3. Biome-formatted.
- Every new or touched spec file is Biome-formatted in full; tests stay
  top-level or in small describes so no function passes 40 lines.
- Commit subjects are lower case and at most 72 characters.

## Edge cases

- No active notes: the no-notes empty state wins over Home.
- Only archived notes: same, with the View Archive button.
- First visit: Welcome opens, not Home.
- Narrow viewport at launch or on Home click: the list-first model, no Home.
- Unsaved edits when Home is clicked: the discard dialog decides; Cancel stays
  in the note.
- Tag filter active when Home is clicked: cleared.
- Home clicked in Archive: folder scope reset only, as today.
- Search typed on Home: the first result opens, as today.
- Folder switched on Home: Home stays; New note files into that folder.
- Pinned note archived or trashed: it leaves Home on the next render.
- More than three pinned: Show all N, then Show fewer.
- Recent notes all in one folder: no chips.
- A chosen chip's folder disappears: the filter resets to All notes.
- Today's note missing: "Not started yet"; present: its word count.
- No Templates folder: the tile says how to make one, and the palette shows
  the guidance command.
- Storage blocked: Open to falls back to Home, layout to list; nothing
  throws.
- Cross-tab changes while Home is open: Home re-renders with fresh data.
- Highlights: `a == b`, `` `==code==` ``, fenced code, `====`, a highlight
  spanning emphasis (`==**bold**==`), and raw `<mark>` HTML.

## Anti-goals

- No desk on phones, no restore-on-reload, no new keyboard shortcut, no
  multi-color highlights, no change to how notes are selected once Home ends.

## Acceptance criteria

1. A returning visitor with notes, default settings, at 1280×800, lands on
   `#home-desk` visible and `#editor-view` hidden.
2. The first visit lands on the Welcome note.
3. With Open to = Top note, launch opens the first pinned note, as before.
4. At 390px wide, launch shows the note list and `#home-desk` stays hidden.
5. Clicking Home from an open note shows Home; with unsaved edits it asks
   first, and Cancel keeps the note open.
6. Opening a pinned card, a recent row, Today's note, or New note leaves Home
   and focuses the note title or editor.
7. A search, a tag filter, or the Archive view ends Home and selects a note as
   before.
8. Pinned shows at most three cards until Show all; with none pinned it shows
   the pin hint.
9. Recently edited shows six notes, newest first; the grid toggle persists
   across reloads; a chip narrows the list to its folder.
10. Quick capture from Home appends to today's note and Home updates the word
    count.
11. From a template opens the palette with "template" filled in.
12. "Go to Home" appears in the palette and opens Home.
13. Opening Home and using every control makes zero network requests.
14. `==text==` renders as `<mark>`; code spans and `a == b` do not; the
    toolbar chip wraps a selection; a search hit inside a highlight still
    marks; the share viewer renders the highlight.
15. Both themes pass the token contract, including the new highlight pair.
16. `npm run verify` passes, and the Chromium suite passes apart from the
    iPhone-emulation specs this container cannot launch.

## Test stubs

```js
// tests/home-desk.spec.js
test('a returning visitor opens to Home');
test('the first visit still opens the Welcome note');
test('Open to Top note restores the old landing');
test('a phone-width launch stays on the note list');
test('Home asks before discarding unsaved edits');
test('opening a pinned card leaves Home and focuses the title');
test('search, tag filters, and Archive end Home');
test('pinned cards cap at three until Show all');
test('recent notes switch to a grid that survives a reload');
test('folder chips narrow recent notes');
test('quick capture from Home updates the today tile');
test('the template tile opens the palette filtered to templates');
test('Go to Home runs from the palette');
// tests/highlights.spec.js
test('==text== renders as a highlight');
test('code and spaced equals never highlight');
test('the toolbar chip wraps the selection');
test('search hits still mark inside a highlight');
test('the share viewer renders highlights');
```

## Assumptions

- "Love this" covers both items shown in the mockup: Home and highlights.
- Feature PRs do not bump the version; the release commit does.
- The iPhone-emulation specs fail to launch here because the container's
  Chromium is older than Playwright expects; CI runs the pinned browsers.
