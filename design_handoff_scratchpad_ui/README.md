# Handoff: Scratchpad UI improvements (five changes)

## Overview

Five scoped UI changes to Scratchpad (`vscarpenter/scratchpad`, deployed at notes.vinny.dev). They reduce sidebar chrome, promote backup to a first-class control, make the note list scannable, remove the type jump between reading and editing, and stop the editor toolbar from reshuffling when edit mode opens.

Every change stays inside the shipped Inkwell design system. No new colors, no web fonts, no build step, no new dependencies.

## About the design files

`Scratchpad UI Review.dc.html` in this bundle is a **design reference**, not production code. It is a static review canvas that draws each proposal side by side with the current UI at 1:1, using literal values copied out of `public/css/inkwell-tokens.css`. Do not copy its markup into the app.

The target environment already exists and it is the same repo this design was read from: pure static HTML, CSS, and vanilla JS with no build step. So almost all of this work lands as edits to `public/css/app.css`, plus small changes to `index.html` and `public/js/app.js`. Reuse the existing class names and token variables. Where this document names a hex value, prefer the token that holds it.

## Fidelity

**High fidelity.** Colors, type, spacing, radii, and shadows below are exact and already exist as Inkwell tokens. Match them. The one piece of genuinely new artwork is the focus mode icon in change 5, and any 4-corner bracket icon at `stroke-width: 1.7` fits the existing icon set.

## Repo facts to know before starting

- `public/css/app.css` is about 3,325 lines. It owns layout and composition. `public/css/inkwell-components.css` owns primitives (`.btn`, `.input`, `.popover-menu`). `public/css/inkwell-tokens.css` owns all custom properties and the dark mode cascade. Add nothing to the token file unless a change needs a value that does not exist.
- Dark mode runs Pattern B: `prefers-color-scheme` plus a `data-theme` override, with two byte-parallel dark blocks in the token file. If you touch a token, update both blocks.
- `index.html` contains inline `<script>` blocks. The CloudFront CSP allowlists them by hash. If you edit any inline script, run `cloudfront/recompute-csp-hashes.sh` and redeploy the header policy.
- `@media (pointer: coarse), (max-width: 640px)` blocks raise controls to 44px in several places. `tests/touch-targets.spec.js` enforces that. Keep every coarse-pointer target at 44px or larger.
- Playwright specs cover most of this surface. Expect to update selectors in the specs named under each change.

## Design tokens used

All of these already exist in `public/css/inkwell-tokens.css`. Reference them, do not inline the hex.

**Color**

| Token | Light | Use in this work |
| --- | --- | --- |
| `--accent` | `#4E5FD8` | Primary fill, active rail, tag chip text |
| `--accent-d` | `#4553C4` | Primary hover |
| `--accent-soft` | `#EBEEFC` | Tag chip background, active toggle background |
| `--accent-soft-2` | `#DDE2FB` | Tag chip hover |
| `--accent-strong-border` | `rgba(78,95,216,.35)` | Active row border (being retired in change 3) |
| `--ink` | `#1C1E28` | Titles, primary text |
| `--text-secondary` | `#5D6170` | Excerpts, secondary labels |
| `--text-muted` | `#9A9EAD` | Timestamps, placeholders, section heads |
| `--text-body` | `#33353F` | Note body copy |
| `--control-fill` | `rgba(28,30,40,.05)` | Segmented track, icon button rest, breadcrumb pill |
| `--control-fill-hover` | `rgba(28,30,40,.09)` | Icon button hover |
| `--row-hover` | `rgba(28,30,40,.04)` | Note row hover |
| `--hairline-color` | `rgba(28,30,40,.06)` | Panel dividers |
| `--paper` | `#FFFFFF` | Active row surface, active segment |
| `--success` / `--success-tint` / `--success-text` | `#57B26A` / `rgba(87,178,106,.12)` / `#3B7A4B` | Backup healthy state |
| `--warning` / `--warning-tint` / `--warning-dark` | `#E8A23D` / `rgba(232,162,61,.14)` / `#A2701F` | Backup aging state, unsaved chip |
| `--rust` / `--rust-tint` | `#B04A3F` / `rgba(176,74,63,.10)` | Backup missing state, destructive |

**Type**

`--sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
`--serif: "Iowan Old Style", "Palatino", "Palatino Linotype", "Source Serif Pro", Georgia, serif` (defined today, used nowhere, activated in change 4)
`--mono: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace`

**Radius** `--r-sm: 8px`, `--r-code: 7px`, `--r-seg-track: 11px`, `--r-md: 12px`, `--r-lg: 14px`, `--r-textarea: 16px`, `--r-panel: 22px`, `--r-pill: 999px`

**Spacing** 8px base with a 4px micro step: `--sp-1: 4px` through `--sp-8: 64px`

**Shadow** `--shadow-sm`, `--shadow-md`, `--shadow-seg: 0 2px 6px rgba(28,30,40,.10)`, `--shadow-card: 0 8px 20px rgba(35,42,90,.12)`, `--shadow-primary: 0 8px 18px rgba(78,95,216,.35)`, `--shadow-pill-float: 0 14px 34px rgba(35,42,90,.12)`, `--glass-shadow: 0 20px 50px rgba(35,42,90,.12)`

**Motion** `--t-fast: 120ms`, `--t-base: 150ms`, `--ease-out: cubic-bezier(.2,.8,.2,1)`

---

## Change 1: collapse the five-row sidebar header into two

### Why

`.sidebar-head` stacks five rows: brand, search, a two-row action block, the Notes/Trash/Tags segmented control, and the Folders/Recent pair. Measured from `app.css`, that is 16 + 28 + 11 + 38 + 11 + 88 + 11 + 34 + 11 + 6 + 26 + 10, so about **290px of chrome in a 302px-wide column** before the first note. Three toggle idioms sit back to back: a segmented track, a ghost pill pair, and standalone pill buttons.

"Tags" also lies. It sits inside a view switch beside Notes and Trash, but it opens `#tag-manager-dialog` instead of switching the list.

### Target: about 217px, two rows plus the segmented control

Row 1, brand: 26px gradient glyph, the wordmark at `700 16px/1 var(--sans)` with `letter-spacing: -.01em`, then a right-aligned pair of 28px circular buttons (theme toggle, then About). Both use `background: var(--control-fill)`, `border-radius: var(--r-pill)`, `color: var(--text-secondary)`, and `--control-fill-hover` on hover.

Under the wordmark, restore the kicker at `500 11px/1 var(--sans)` in `--text-muted`, reading `24 notes · local-only, never syncs` with "local-only" in `--accent`. `app.css:219` currently sets `.sidebar-kicker { display: none; }` and `app.js` already writes `#note-count`, so delete the rule and update the copy in `index.html`. Gap between wordmark and kicker is 4px.

Row 2, search: unchanged. 38px tall, `--r-md`, `--field-bg`, `1px solid var(--hairline-color-2)`, `--field-inset-shadow`, focus ring `0 0 0 3px var(--accent-focus-ring)`, with the `⌘K` hint pill at `500 11px/1` in `--text-muted` on `--control-fill`.

Row 3, actions: one row only. `New note` as `flex: 1`, 40px tall, `--r-md`, `--accent` fill, `--shadow-primary`. Then two 40px circular ghost buttons: today's note, then command palette. Drop `Select` and the About icon from this row.

Row 4, view switch: `Notes | Trash` only. Track keeps `--control-fill`, `--r-seg-track`, `padding: 3px`. Segments are 28px tall, `--r-sm`, `500 12.5px/1`. The active segment gets `--paper`, `--ink`, `font-weight: 600`, and `--shadow-seg`.

### Where Folders, Recent, Tags, and Select go

Add a list header row as the first child of `.note-list`, 26px tall with `padding: 4px 10px 6px` and `border-bottom: 1px solid var(--hairline-color)`:

- The existing 5px triangle chevron (`border-left: 5px solid var(--text-muted)`, rotated 90deg when expanded).
- `FOLDERS` / `RECENT` as a two-item text toggle at `600 10.5px/1`, `letter-spacing: .08em`, `text-transform: uppercase`. Active is `--text-secondary`, inactive is `--text-muted`, separated by a `/` in `--gray-300`. Keep `#group-folders` and `#group-recent` as the ids so the existing handlers and `tests/note-organization.spec.js` keep working.
- A right-aligned overflow trigger reusing `.popover-menu`, holding `Manage tags…` (`#manage-tags`), `New folder…`, and `Select notes` (`#bulk-toggle`).

### Files

`index.html` (`.sidebar-head` block), `public/css/app.css` L168-390 and L631-638, `public/js/app.js` (move the `#manage-tags` and `#bulk-toggle` listeners, render the new list header row).

### Acceptance

- `.sidebar-head` measures 217px or less at 1440x900 in light mode.
- Every control keeps its current id, so no keyboard shortcut or command palette action breaks.
- At `(pointer: coarse)`, the two icon buttons and the search field are 44px tall.
- Specs to update: `tests/note-organization.spec.js`, `tests/bulk-actions.spec.js`, `tests/folders.spec.js`, `tests/layout-scroll.spec.js`, `tests/mobile-navigation.spec.js`.

---

## Change 2: turn the footer slogan into a live backup status

### Why

Export is the durability story of a local-only app. Today all four export paths live inside `#about-dialog`, behind an icon button labeled "About Scratchpad," alongside diagnostics, the erase-everything zone, the shortcut list, and the legal links. That is one dialog doing six jobs.

Meanwhile `.sidebar-foot` spends permanent real estate on `Local-only · never syncs`, which repeats a promise the user already read. Change 1 moves that promise into the kicker, which frees the footer for the one fact that actually changes.

### The chip

Keep `.status-chip` geometry exactly: `height: 26px`, `padding: 0 11px`, `--r-pill`, `500 11px/1 var(--sans)`, a 6px dot, `gap: 7px`. Convert the `<span>` to a `<button>` with `aria-haspopup="menu"` and `aria-expanded`, and add a 9px caret glyph in `--text-muted` after the label.

Three states, driven by days since last backup:

| State | Threshold | Background | Text | Dot | Label |
| --- | --- | --- | --- | --- | --- |
| Healthy | 0 to 7 days | `--success-tint` | `--success-text` | `--success` | `Backed up 3 days ago` |
| Aging | 8 to 30 days | `--warning-tint` | `--warning-dark` | `--warning` | `Last backup 12 days ago` |
| Missing | over 30 days or never | `--rust-tint` | `--rust` at `font-weight: 600` | `--rust` | `Never backed up. Export now.` |

Keep every label short enough to fit the 274px content box.

### The popover

Reuse `.popover-menu` verbatim: `--paper`, `var(--border)`, `--r-sm`, `--shadow-md`, `padding: 4px`, items at `14px/1 var(--sans)` with `padding: 8px 10px` and `--r-xs`. Open upward from the chip. Items in order: `Export backup (JSON)` (`#export-btn`), `Export encrypted backup…` (`#export-encrypted-btn`), `Export Markdown ZIP` (`#export-markdown-btn`), a `.menu-divider`, then `Import notes…` (`#import-btn`). Close with a muted meta line at `400 11px/1.4` in `--text-muted`: `24 notes · 1.2 MB · storage protected`.

Move the buttons rather than duplicating them, so there is one handler per action. `.about-row` in the About dialog then disappears, and `#backup-reminder` can retire because the chip is a standing, non-nagging reminder.

### Data

The value already exists. `#diagnostic-last-backup` reads it, and `tests/backup-reminder.spec.js` covers the storage key. Read the same key, compute whole days elapsed, and re-render the chip after every successful export.

### Files

`index.html` (`.sidebar-foot`, `#about-dialog`), `public/css/app.css` L576-612, `public/js/app.js` (chip state, popover wiring, re-render on export).

### Acceptance

- The chip reflects the correct state on load and updates immediately after an export.
- Keyboard: Enter or Space opens the menu, Escape closes it and returns focus to the chip, and arrow keys move between items.
- All four export and import actions still work, with no duplicate listeners.
- The About dialog keeps the explainer, diagnostics, danger zone, shortcuts, and legal links.
- Specs to update: `tests/backup-reminder.spec.js`, `tests/share-export.spec.js`, `tests/encrypted-backup.spec.js`, `tests/import.spec.js`, `tests/diagnostics.spec.js`.

---

## Change 3: let every row carry its metadata

### Why

`app.css:843-850` hides `.note-row-tags` unless the row is `.is-active`, and `.note-row-excerpt` clamps to one line until then. So the list only informs you about the note you are already reading, and tags, the main organizing device, vanish exactly when you scan for one.

### Row spec, all states

Keep the grid: `grid-template-columns: 1fr auto`, `column-gap: 10px`, `row-gap: 3px`, `padding: 10px 12px`, `--r-lg`.

- Title: `600 13.5px/1.3 var(--sans)`, `letter-spacing: -.006em`, `--ink`, one line clamped.
- Timestamp: `500 10.5px/1`, `--text-muted`, `margin-top: 3px`, `white-space: nowrap`, right column.
- Excerpt: `400 12px/1.45`, `--text-secondary`, `-webkit-line-clamp: 2` for every row. Delete the `.is-active` override.
- Tags: always `display: flex`, `gap: 5px`, `margin-top: 3px`. Chips keep 18px height, `padding: 0 8px`, `--r-pill`, `--accent-soft` background, `600 10px/1` in `--accent`. Render at most two chips, then a `+n` counter at `500 10px/1` in `--text-muted`. Hover stays `--accent-soft-2`.

Rows grow by roughly 18px. Change 1 pays that back.

### Active row

Retire the current treatment (`--paper` plus `--accent-strong-border` plus `--shadow-card`), which makes the heaviest object on screen mean nothing more than "here." Replace with:

```
background: var(--paper);
border: 1px solid var(--hairline-color);
box-shadow: 0 2px 8px rgba(35, 42, 90, .07);
padding-left: 14px;
position: relative;
overflow: hidden;
```

Plus a rail: `position: absolute; left: 0; top: 8px; bottom: 8px; width: 2.5px; border-radius: var(--r-pill); background: var(--accent);`

Add the shadow value to the token file as `--shadow-row-active` and mirror it in both dark blocks.

Because padding and clamping no longer change with selection, the list stops shifting as you arrow through it.

### Files

`public/css/app.css` L698-880, `public/js/app.js` (cap rendered tags at two plus the counter).

### Acceptance

- Every row renders two excerpt lines and up to two tag chips plus `+n`.
- Row height stays identical between active and inactive states, so arrowing through the list causes no layout shift.
- A note with 8 tags does not widen or wrap the row.
- Tag chips remain clickable to filter, and `.note-row-open` still covers the row beneath them.
- Specs to update: `tests/note-organization.spec.js`, `tests/notes-crud.spec.js`, `tests/enhanced-search.spec.js`.

---

## Change 4: stop the page from reflowing on Edit

### Why

Reading uses `700 32px/1.2 var(--sans)` for the title over sans body copy. Editing uses `400 14px/1.85 var(--mono)`. Pressing Edit or Save changes typeface, size, line height, and every line break at once, which is the moment the tool is least invisible.

Separately, `--serif` is defined in the token file and used nowhere, while PRODUCT.md asks for serif headings.

### The rule

**Headings serif, body matched, mono where it earns it.**

- `.note-doc-title` becomes `400 34px/1.18 var(--serif)` with `letter-spacing: -.012em`, in `--ink`. `.note-doc-title-input` inherits the same font so the title does not jump either.
- Rendered `h2` and `h3` inside `.note-rendered` move to `--serif` at the existing sizes (`--t-h2: 24px`, `--t-h3: 20px`) with `font-weight: 400`.
- Body copy in `.note-rendered` becomes `400 16.5px/1.75 var(--sans)` in `--text-body`, on a 68ch measure. `.editor-doc-head`, `.tag-bar`, and `.note-editor` currently cap at `max-width: 720px`. Keep one shared measure value for all four.
- `.note-editor` uses the same family, size, line height, and measure as the rendered view. Change `400 14px/1.85 var(--mono)` to `400 16.5px/1.75 var(--sans)`.
- Byline stays `400 12.5px/1.4 var(--sans)` in `--text-muted`. Margin below the head grows from 22px to 26px to sit with the larger title.
- Mono survives for `code`, `pre`, `.kbd`, and the `</>` format chip.

Every serif face in the stack ships with the OS, so there is no web font and no CSP change.

### If you keep mono for writing

Plenty of markdown-fluent people prefer it, and that is a fair call. Keep `--mono` in the textarea, but set it to `15px/1.75` so it lands on the same rhythm as the rendered view. The reflow is the defect. The serif is the upside.

### Files

`public/css/app.css` L1226-1330 and the `.note-rendered` prose rules, `public/css/inkwell-tokens.css` if the shared measure becomes a token.

### Acceptance

- Toggling Edit and Save on a 500-word note leaves paragraph line breaks in the same places.
- Title, body, and textarea share one measure.
- Code spans and blocks stay mono.
- Dark mode contrast holds at AA for `--text-body` on the glass surface.
- Specs to update: `tests/focus-mode.spec.js`, `tests/print.spec.js`, `tests/task-lists.spec.js`.

---

## Change 5: split the editor rail

### Why

One `flex-wrap: wrap` row in `.editor-head` holds Back, breadcrumb, the unsaved chip, pin, share, a divider, four format chips, Edit or Save, Restore, Delete forever, and overflow. Entering edit mode adds about 120px of chips, so the rail reshuffles or wraps to two lines exactly when the user starts typing. Focus mode, the best thing in the app, has no button at all.

### Top rail, fixed

Remove `flex-wrap: wrap` from `.editor-head`. Keep `padding: 14px 18px 12px` and `border-bottom: 1px solid var(--hairline-color)`. Six slots, identical in read and edit mode:

1. Back, a 30px circular icon button on `--control-fill`, with the existing 15px chevron. Mobile only, per current behavior.
2. Breadcrumb pill: `height: 28px`, `padding: 0 12px`, `--r-pill`, `--control-fill`, `500 12px/1` in `--text-secondary`, current crumb at `600` in `--ink`. It already declares `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, so keep all three and add `min-width: 0` so it truncates instead of pushing.
3. `margin-left: auto`, then the unsaved chip, unchanged: `height: 24px`, `padding: 0 10px`, `--warning-tint`, `600 11px/1` in `--warning-dark`, 5px `--warning` dot.
4. Focus mode, a 30px icon button. New icon, a 4-corner bracket at `stroke-width: 1.7`, drawn as `M4 9V5h4 M20 9V5h-4 M4 15v4h4 M20 15v4h-4`. It toggles the same state as `⌘/Ctrl+Shift+F` and pairs with the existing `#focus-exit-btn`.
5. Primary: `Edit` or `Save`, `.btn-sm` at 32px with `--shadow-primary-sm`.
6. Overflow `.icon-btn`.

Pin and Share move into `#overflow-menu`, which already holds Move, Duplicate, History, Export, and Delete. Restore and Delete forever only exist in Trash, so move them into the same menu and stop budgeting width for them in the common case.

### Format pill, contextual

Move `#editor-format` out of `.editor-head` and float it above the textarea, visible in edit mode only. Center it, overlap the writing surface by 14px, and give the textarea `padding-top: 26px` so the first line clears it.

Reuse the existing floating-pill treatment: `background: var(--glass-bg-pill)`, `backdrop-filter: blur(var(--glass-blur-pill))`, `border: var(--glass-border)`, `box-shadow: var(--shadow-pill-float)`, `--r-pill`, `padding: 4px`, `gap: 4px`, `z-index: var(--z-raised)`.

Chips grow slightly to 28x26 with `--r-pill` instead of `--r-code`, keeping their current fonts: bold sans `B`, italic serif `I`, mono `</>`, and the 13px link glyph. Then a 1px `rgba(28,30,40,.10)` divider and three text chips at `600 11.5px/1` in `--text-secondary`: `H2`, `List`, and `Quote`. Hover matches `.fmt-chip:hover` today: `--paper` background, `--ink` text, `--shadow-chip`.

On coarse pointers, raise chips to 44px and let the pill scroll horizontally rather than wrap.

### Files

`index.html` (`.editor-head`, `#editor-format`, `#overflow-menu`), `public/css/app.css` L932-1080 and L1226-1330, `public/js/app.js` (focus toggle button, the three new format actions, overflow menu items).

### Acceptance

- The top rail never wraps between 900px and 1920px, in read or edit mode.
- Rail slot positions do not move when edit mode opens.
- The format pill only renders in edit mode and never covers the first line of text.
- Focus mode is reachable by mouse and by `⌘/Ctrl+Shift+F`, and `#focus-exit-btn` still works.
- Every moved control keeps its `aria-label` and `title`.
- Specs to update: `tests/focus-mode.spec.js`, `tests/keyboard-shortcuts.spec.js`, `tests/accessibility-semantics.spec.js`, `tests/touch-targets.spec.js`, `tests/share-export.spec.js`, `tests/revision-history.spec.js`.

---

## Suggested order

1. **Change 1**, sidebar header. It frees the vertical budget that change 3 spends.
2. **Change 3**, note rows. Pure CSS plus a small render cap.
3. **Change 5**, editor rail. Structural but self-contained.
4. **Change 2**, backup status. Touches the most JS, so land it with the surface settled.
5. **Change 4**, typography. Do it last and look at it for a day before shipping.

Changes 1, 3, and 5 are mostly CSS. Change 2 is mostly JS. Change 4 is a judgment call worth living with.

## Open question to settle before change 4

PRODUCT.md names glassmorphism, gradient hero text, and purple-to-blue palettes as anti-references, and asks for serif headings and restraint. Inkwell 3.0 "Soft Glass" is built on frosted panels, a gradient brand glyph, a two-hue wash, and a glowing indigo shadow under every primary button. Its own header says it deliberately retires the flat, shadowless surface.

Both directions are coherent. They are not the same product. All five changes work either way, but change 4 makes the answer visible, so decide it first.

## Existing bugs worth fixing in the same pass

Both come from the repo's own `ui-design-suggestions.md`:

1. On mobile, tapping the already-selected row does not open the editor. `selectNote()` returns early before setting `mobileView = 'editor'`. Set and sync the mobile view before that return.
2. On about.html, privacy.html, and terms.html, the theme control renders as text but inherits the 30px square icon-button rule from `.theme-toggle`, so it collapses. Give the support pages a text-button variant, or use the app's icon-only toggle.

## Assets

No new image assets. The brand glyph is an inline SVG in `index.html` with `--accent-grad` applied via CSS. All icons in these designs are inline 24x24 stroke SVGs already in the repo, except the focus mode bracket described in change 5.

## Files in this bundle

- `README.md`, this document.
- `CLAUDE-CODE-PROMPT.md`, a paste-ready kickoff prompt.
- `Scratchpad UI Review.dc.html`, the visual reference. Open it in a browser. Each proposal has a stable id (`1a` through `1e`) matching changes 1 through 5 in this document. `support.js` sits beside it and has to stay in the same folder for the file to render.
- `reference/inkwell-tokens.css`, a copy of the shipped token file as of this handoff, so the values above can be checked without opening the repo.
