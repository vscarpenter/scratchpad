---
name: Scratchpad
direction: Porcelain Chronicle
version: 4
description: A private daily chronicle with a quiet date rail, a calm note index, and a raised writing surface.
colors:
  canvas: "#EFF1F7"
  paper: "#FFFEFE"
  ink: "#25283A"
  text-secondary: "#484B61"
  text-muted: "#73788C"
  accent: "#5661B3"
  accent-hover: "#414B91"
  accent-soft: "#E8EAFA"
  accent-soft-2: "#D9DDF4"
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
3. A generous document stage with one raised porcelain writing surface.

The application remains local-only. Visual changes must never add remote fonts,
assets, analytics, or user-content requests.

## Color

Indigo is the only decorative accent. Use it for the selected date, primary
actions, links, tags, focus rings, the date spine, and the active daily-note
callout. Semantic success, warning, and danger colors are reserved for actual
state.

- Canvas: `#EFF1F7`
- Paper: `#FFFEFE`
- Ink: `#25283A`
- Secondary text: `#484B61`
- Muted text: `#73788C`
- Indigo: `#5661B3`
- Indigo hover: `#414B91`
- Indigo tint: `#E8EAFA`
- Indigo pressed/strong tint: `#D9DDF4`

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
- The main area is a cool document stage.
- The document card is the sole raised surface in the shell.

Do not add blur or gradients to the app shell. Use one-pixel separators and
restrained existing elevation on the document. Dialogs and static pages may
continue using legacy glass tokens until they receive their own redesign.

## Typography

Use platform fonts only.

- System sans owns the rail, note index, controls, metadata, and desktop note
  title.
- The editorial serif remains available for rendered note prose and mobile
  continuity.
- Monospace is reserved for compact metadata and keyboard hints.

Desktop document titles should be substantial but not promotional: about 44px
at the wide breakpoint with tight tracking. Body prose stays readable at a
maximum measure of 620px.

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
