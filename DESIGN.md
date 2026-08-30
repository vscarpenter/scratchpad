---
name: Scratchpad
direction: Indigo on Paper
version: 5
description: A private daily chronicle on warm paper, with a quiet date rail, a calm note index, and a raised writing surface with a serif voice.
colors:
  canvas: "#ECE7DC"
  paper: "#FFFFFF"
  ink: "#211E1A"
  text-secondary: "#55504A"
  text-muted: "#797368"
  accent: "#5661B3"
  accent-hover: "#414B91"
  accent-soft: "#E8E9F4"
  accent-soft-2: "#DBDDF1"
typography:
  chrome: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  prose: "Iowan Old Style, Palatino, Georgia, serif"
  metadata: "ui-monospace, SFMono-Regular, Menlo, monospace"
document-measure: "620px"
---

# Design System: Porcelain Chronicle

## North star

Scratchpad is a quiet private chronicle. The interface should make the current
day easy to find, the recent past easy to scan, and the open note feel like the
only thing that matters. It is calm without becoming anonymous: the vertical
date rail and the document date spine are its recognizable signature.

The design has three layers:

1. A narrow chronology rail for orientation and daily-note entry.
2. A compact note index for navigation and local-only trust cues.
3. A generous document stage with one raised paper writing surface.

The application remains local-only. Visual changes must never add remote fonts,
assets, analytics, or user-content requests.

## Color

Indigo is the only decorative accent. Use it for the selected date, primary
actions, links, tags, focus rings, the date spine, and the active daily-note
callout. Semantic success, warning, and danger colors are reserved for actual
state.

- Canvas: `#ECE7DC`
- Paper: `#FFFFFF`
- Ink: `#211E1A`
- Secondary text: `#55504A`
- Muted text: `#797368`
- Indigo: `#5661B3`
- Indigo hover: `#414B91`
- Indigo tint: `#E8E9F4`
- Indigo pressed/strong tint: `#DBDDF1`

All application CSS colors route through tokens in
`public/css/inkwell-tokens.css`. Do not put literal color values in
`public/css/app.css`.

Dark mode is a token flip, not a separate composition. Keep auto-dark and the
explicit `[data-theme="dark"]` token blocks synchronized and verify contrast on
the opaque active note row, the tinted daily-note card, and primary controls.

## Surfaces and depth

The Chronicle shell is opaque and architectural:

- The date rail is the quietest surface.
- The note index is a slightly brighter adjacent plane.
- The main area is a warm sunken document stage.
- The document card is the sole raised surface in the shell.

Do not add blur or gradients to the app shell. Use one-pixel separators and
restrained existing elevation on the document. Dialogs and static pages may
continue using legacy glass tokens until they receive their own redesign.

## Typography

Use platform fonts only.

- The editorial serif carries the display voice: the document title, the list
  date heading, the date-spine numeral, and rendered prose headings.
- System sans owns the chrome: rail, note index rows, controls, and dialog
  bodies. Dialog titles take the serif (see Dialogs).
- Monospace is reserved for compact metadata and keyboard hints — it is
  Scratchpad's second signature alongside indigo.

Desktop document titles should be substantial but not promotional: serif at
weight 600, 36px rising to about 44px at the wide breakpoint, with gentle
tracking. Body prose stays readable at a maximum measure of 620px.

## Layout

At 1200px and wider, the shell is approximately:

- 104px chronology rail
- 330px note index
- flexible document stage

At 900–1199px, compress to an 80px rail and 296px index. Below 900px the date
spine may disappear; below 768px preserve the proven single-pane list/editor
navigation and hide the chronology rail entirely.

The rail displays five local dates ending today. Selecting a date opens the
matching daily note or creates it if absent. The active date follows the open
daily note; ordinary notes fall back to their creation date.

## Signature elements

### Chronology rail

The rail carries the brand mark, abbreviated month, five vertically stacked
dates, and a Today shortcut. The selected date uses solid Indigo with white
text. Non-selected dates remain quiet and use a tinted hover state.

### Daily-note card

The daily-note callout appears in the note index, using a restrained Indigo
tint and border. It explains the daily-writing behavior without competing with
the primary New note action.

### Document date spine

At desktop widths the open document has a left-hand date marker and a thin
vertical Indigo rule. It should align with the title block and feel printed into
the page, not floated above it.

## Dialogs

Every dialog follows the Chronicle dialog recipe (2026-08 design review).
Rules, in priority order:

1. **Serif titles.** Dialog titles render in the editorial serif at weight 600,
   20px, -0.01em tracking. Everything else in the dialog chrome stays sans.
2. **Mono small-caps zone labels.** Sections inside a dialog are named by a
   `.zone-label`: mono, 600, 9.5–10px, 0.14em tracking, uppercase. Labels name
   trust boundaries, not headings — "On this device — nothing is sent",
   "Public link — uploads an encrypted copy", "This browser will forget".
3. **Hairlines for structure.** Zones are `--r-md` boxes with hairline or
   tinted one-pixel borders. No new shadows; dialog primary and danger buttons
   carry no glow.
4. **Indigo for action only.** Primary buttons, the command palette's selected
   row (accent-soft fill plus a two-pixel inset indigo bar — the app's
   selected-row signature), and the public share zone's border.
5. **Rust reserved for erasure.** The rust-tinted zone treatment appears only
   in the erase-local-data dialog and the About danger zone.

## Interaction and accessibility

- Interactive targets are at least 44px where space allows.
- All controls retain visible keyboard focus.
- Selected dates expose an accessible current state.
- Color is never the only signal for destructive or backup status.
- Motion is brief and functional; respect reduced-motion and
  reduced-transparency preferences.
- Never hide focus outlines unless a replacement is present.

## Responsive behavior

Desktop expresses the full Chronicle concept. Mobile keeps the familiar
single-pane model: list first, then editor with a Back control. The rail and
document date spine are hidden rather than squeezed into the narrow viewport.
No horizontal page overflow is permitted at 390px, 1000px, or 1440px.

## Source of truth

- Approved spec:
  `docs/superpowers/specs/2026-07-31-porcelain-chronicle-indigo-design.md`
- Implementation plan:
  `docs/superpowers/plans/2026-07-31-porcelain-chronicle-indigo.md`
- Working craft brief: `.ui-craft/brief.md`
- Token rationale: `.ui-craft/tokens.md`
