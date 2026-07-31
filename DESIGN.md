---
name: Scratchpad
description: A privacy-first, local-only notes app — frosted glass chrome around an editorial document.
colors:
  accent: "#4E5FD8"
  accent-deep: "#4553C4"
  accent-text: "#4E5FD8"
  accent-soft: "#EBEEFC"
  accent-soft-2: "#DDE2FB"
  accent-light: "#7A8AD1"
  accent-grad-start: "#5B6CE4"
  wash-base: "#F3F4F8"
  apricot-wash: "rgba(236, 166, 140, 0.14)"
  paper: "#FFFFFF"
  oat: "#ECEDF3"
  glass-bg: "rgba(255, 255, 255, 0.66)"
  glass-bg-strong: "rgba(255, 255, 255, 0.72)"
  glass-fallback: "rgba(255, 255, 255, 0.94)"
  ink: "#1C1E28"
  text-body: "#33353F"
  text-secondary: "#5D6170"
  text-muted: "#9A9EAD"
  text-quote: "#3A3F63"
  control-fill: "rgba(28, 30, 40, 0.05)"
  control-fill-hover: "rgba(28, 30, 40, 0.09)"
  field-bg: "rgba(255, 255, 255, 0.85)"
  hairline: "rgba(28, 30, 40, 0.06)"
  edge: "#C9CBD4"
  success: "#57B26A"
  success-text: "#3B7A4B"
  warning: "#E8A23D"
  warning-text: "#A2701F"
  rust: "#B04A3F"
  rust-deep: "#9A3F3F"
  info: "#5C7CA3"
  sky: "#6A8CAF"
typography:
  display:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(40px, 6vw, 62px)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Iowan Old Style, Palatino, Source Serif Pro, Georgia, serif"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1.18
    letterSpacing: "-0.012em"
  title:
    fontFamily: "Iowan Old Style, Palatino, Source Serif Pro, Georgia, serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  label:
    fontFamily: "ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.12em"
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  xs: "4px"
  code: "7px"
  sm: "8px"
  glyph: "9px"
  seg-track: "11px"
  md: "12px"
  lg: "14px"
  textarea: "16px"
  xl: "20px"
  panel: "22px"
  empty: "26px"
  pill: "999px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "24px"
  sp-6: "32px"
  sp-7: "48px"
  sp-8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
  button-secondary:
    backgroundColor: "{colors.control-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 18px"
  button-secondary-hover:
    backgroundColor: "{colors.control-fill-hover}"
  button-ghost:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 18px"
  button-danger:
    backgroundColor: "{colors.rust}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 18px"
  button-small:
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
  input:
    backgroundColor: "{colors.field-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "38px"
    padding: "0 12px"
  badge-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    height: "22px"
    padding: "0 9px"
  status-chip:
    backgroundColor: "{colors.control-fill}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    height: "26px"
    padding: "0 11px"
  segmented-track:
    backgroundColor: "{colors.control-fill}"
    rounded: "{rounded.seg-track}"
    padding: "3px"
  segmented-option-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "28px"
    padding: "0 12px"
  note-row:
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  note-row-active:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "10px 12px 10px 14px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "24px"
  panel-glass:
    backgroundColor: "{colors.glass-bg}"
    rounded: "{rounded.panel}"
  dialog:
    backgroundColor: "{colors.glass-bg-strong}"
    rounded: "{rounded.panel}"
  brand-glyph:
    rounded: "{rounded.glyph}"
    size: "26px"
---

# Design System: Scratchpad

## Overview

**Creative North Star: "Ink Under Glass"**

Scratchpad is a document seen through a frosted pane. The system has two halves and
they do not mix. The **chrome** is weather: frosted glass panels floating over a
faintly tinted wash, set in system sans, shaped as pills and squircles, lit by soft
diffuse shadows. The **document** is ink: a serif title, serif section headings, a
68ch measure that has not moved since the app's first release. The glass is the room;
the ink is the work; the room is never the subject.

This is the **Soft Glass** system (Inkwell v3.0.0), and it deliberately retired three
rules from the app's earlier "Analog Notebook" identity. Surfaces used to be flat —
now they float with `0 20px 50px` shadows. Outer borders used to be a 1.5px signature
hairline — now they are 1px. Gradients used to be forbidden — now three sanctioned
ones exist (the brand glyph, the About display headline, and the page wash). What did
**not** change is the part that matters most: every color still routes through a
`var(--token)`, every asset is same-origin, and the app makes zero network calls for
user data. The reskin changed the room, not the guarantee.

The system rejects four neighbors, and the rejection is what forces character to come
from typography and restraint rather than ornament: **bloated productivity SaaS**
(Notion/Confluence chrome, nested sidebars, slash-command overload); the **generic
AI-template aesthetic** (this one is delicate, because Soft Glass *uses* frosted
panels — the difference is that glass here is a structural material on seven named
surfaces, not a decorative finish sprayed across every card); **consumer-bland
defaults** (Apple/Google Notes, no point of view); and the **over-designed and loud**
(hover-lift, bounce, decoration competing with the writing).

**Key Characteristics:**
- Two type voices with a hard boundary: serif owns the document, sans owns the chrome.
- One accent hue (Lifted Indigo) on controls; apricot exists only in the page wash.
- Frosted glass on exactly seven surfaces; everything else is opaque or transparent.
- Pills and squircles throughout — no square corners anywhere in the system.
- Soft, wide, low-opacity shadows; never a hover-lift, never a bounce on a control.
- Token-only color — a literal hex in `app.css` is a defect.
- Dark mode is a pure token flip; there are no `[data-theme]` rules in `app.css`.

## Colors

A cool, blue-leaning palette: one saturated indigo that survives being seen through
frosted glass, a near-white ground with a deliberate blue cast, and a small semantic
set used strictly for state.

### Primary
- **Lifted Indigo** (`#4E5FD8`): The single brand accent. Primary buttons, active
  selection bar, links, focus rings, tag chips, the brand glyph gradient. "Lifted" is
  literal — it was raised from the old `#3B4A8C` specifically so it stays legible
  through a translucent panel. Hover and pressed states go to **Indigo Deep**
  (`#4553C4`).
- **Indigo Soft** (`#EBEEFC`) and **Indigo Soft 2** (`#DDE2FB`): Tinted chip and
  squircle-gradient backgrounds. `accent-soft` is the standard chip fill; the pair
  forms the empty-state icon gradient.
- **Indigo Light** (`#7A8AD1`): Exists for exactly one job — the second stop of the
  About display-headline gradient. It is not a second accent.
- **Indigo Text** (`--accent-text`): The legibility variant, used wherever accent
  text or a glyph sits *on* an accent tint. In light mode it resolves to
  `var(--accent)` and adds nothing. In dark mode it lifts to `#8F9EE1`, because
  dark `--accent-soft` is translucent and therefore composites lighter over the
  opaque `--paper` active row than it does over the glass panel. It is the same
  sibling relationship `--success-text` and `--warning-dark` already have.

### Secondary (state only — never decorative)
- **Meadow** (`#57B26A`, text `#3B7A4B`, tint at 12%): Success, additions, and the
  "local-only" status dot. The healthy backup chip.
- **Amber** (`#E8A23D`, text `#A2701F`, tint at 14%): Caution. The pinned-row marker,
  the unsaved-changes chip, the aging-backup state.
- **Rust** (`#B04A3F`, deep `#9A3F3F`, tint at 10%): Danger and deletions. Destructive
  buttons, the missing-backup state.
- **Sky** (`#6A8CAF`) / **Info** (`#5C7CA3`): Informational accents and the single
  permitted data-viz alternate hue.

### Neutral
- **Cool Vellum** (`#F3F4F8`): The page ground. Near-white with a blue cast —
  deliberately not the cream or sand that reads as the AI default.
- **Paper** (`#FFFFFF`): The opaque raised surface. The selected note row, chips on
  white, the active segmented option.
- **Oat** (`#ECEDF3`): Tertiary surface.
- **Blue-Black Ink** (`#1C1E28`): Primary text. Never true black; the blue undertone
  is what keeps it on the same page as the indigo.
- **Body** (`#33353F`) / **Secondary** (`#5D6170`) / **Muted** (`#9A9EAD`): The text
  ramp — rendered markdown body, secondary UI text, and timestamps/placeholders
  respectively. `--gray-700` and `--gray-500` are legacy aliases of Secondary and
  Muted; prefer the semantic names in new code.
- **Edge** (`#C9CBD4`): The one visible element border — checkbox idle, dashed add-tag,
  meta dots. Distinct from the near-invisible `hairline` at 6% ink.
- **Glass** (`rgba(255,255,255,0.66)`, strong `0.72`, fallback `0.94`): The frosted
  panel fill. The fallback is the opaque value used when blur is unsupported or the
  user prefers reduced transparency.

### Named Rules

**The One Accent Rule (amended).** Indigo is the only accent that may touch a control.
Meadow, Amber, Rust, and Sky carry state exclusively. The **one** amendment: apricot
`rgba(236,166,140,0.14–0.18)` is legal inside the `--wash-app` and `--wash-hero`
radial stacks and nowhere else. Apricot on a button, chip, border, icon, or text is a
bug. If you can point at an apricot pixel that sits above the wash layer, that's a
defect.

**The No Inline Color Rule.** Every color in app CSS is a `var(--token)`. A literal hex
in `app.css` breaks the dark-mode flip, so it is a defect regardless of how correct it
looks in light mode. Gradients assembled from token colors (`--accent-grad`) are fine.

**The Legibility-Through-Glass Rule.** Any text that sits on a frosted panel must clear
AA against the *fallback* opaque color, not the translucent one. Blur composites
unpredictably across backdrops; the fallback is the only stable thing to measure.

**The Accent-On-Tint Rule.** A saturated hue used as text on its own tint gets a
dedicated legibility sibling — `--accent-text`, `--success-text`, `--warning-dark` —
and the base hue is never set as text on its own tint directly. This exists because
the dark-mode tints are translucent, so the same text color measures differently over
the glass panel than over the opaque `--paper` row. Verify any new tint pairing against
the **lightest** backdrop it can land on, which is `--paper`, not the glass. Current
margins are 4.60:1 in light and 4.61:1 in dark — deliberately matched, so neither theme
is the fragile one.

## Typography

**Document Font:** Iowan Old Style (with Palatino, Source Serif Pro, Georgia)
**Chrome Font:** system-ui (with -apple-system, Segoe UI, Roboto, Helvetica, Arial)
**Metadata Font:** ui-monospace (with SF Mono, Menlo, Monaco, Consolas)

**Character:** The pairing is the whole system in miniature. The platform serif gives
anything the user wrote or came to read an editorial, booklike warmth — without
shipping a single web font. The system sans keeps the surrounding machinery neutral
and native at every DPI, and it is what the frosted panels are set in. The monospace
is a deliberate signal that appears only where content is literally machine data.
Platform fonts only: no `@font-face`, ever, on any surface.

### Hierarchy
- **Display** (sans 800, `clamp(40px, 6vw, 62px)`, lh 1.08, -0.035em): The About hero
  headline, and the only fluid type in the system. One phrase inside it carries the
  accent gradient.
- **Headline** (serif 400, 34px, lh 1.18, -0.012em): The note document title. This is
  the signature moment — the first serif the user meets, at weight 400 rather than a
  bolded 600, so it reads as typeset rather than shouted.
- **Title** (serif 600, 28px, lh 1.2, -0.01em): Page titles on the content pages.
  Section headings within those pages drop to serif 600 18px.
- **Body** (sans 400, 16.5px, lh 1.75): Reading and writing text, capped at the shared
  `--measure-doc` of 68ch. Read mode and edit mode use identical type, so toggling
  between them does not reflow a single line.
- **Label / Eyebrow** (mono 500, 11px, +0.12em, UPPERCASE): Metadata kickers and
  section labels. Short only (≤4 words), and used sparingly — Soft Glass explicitly
  removed the eyebrow that used to sit above the note title.
- **Mono body** (mono 400, 13px, lh 1.6): Code blocks, inline code, `kbd` chips.

### Named Rules

**The Ink-and-Chrome Rule.** Serif belongs to content the user wrote or came to read:
the note title, rendered markdown `h2`/`h3`, page titles, the wordmark. Sans belongs
to everything the app says about itself: buttons, rows, chips, labels, search,
dialogs, meta. A serif button is a bug. A sans note title is a bug. The boundary is
what makes the document feel like a document instead of another panel.

**The Mono-Means-Metadata Rule.** Monospace is reserved for actual machine data —
timestamps, counts, tags, shortcuts, code. Since the editor textarea moved to sans,
this rule is *stricter* than it was under the previous system: mono no longer appears
anywhere the user types prose. Never set body copy or a heading in mono for flavor.

**The Fixed-Scale Rule.** Product UI uses a fixed px scale, not fluid `clamp()`. The
About hero display is the sole exception. A heading that shrinks inside a sidebar looks
worse, not better.

## Layout

The app shell is a two-column CSS grid — `grid-template-columns: 302px 1fr`,
`grid-template-rows: 1fr` — with a 16px gap and 18px of padding, so both glass panels
float clear of the viewport edge on every side. The wash sits on `body` with
`background-attachment: fixed`, which keeps the radial stops anchored while content
scrolls inside the panels.

Three rules in `app.css` are load-bearing and interact across page types. The app page
caps `body` at `100dvh` so inner scroll regions have a definite size; `.app-shell` pins
its single grid row to `1fr` so the row does not auto-size to its children; and
`.sidebar` sets `min-height: 0` to override the grid item default so `.note-list` can
actually scroll. The content pages (`about`, `guide`, `privacy`, `terms`) opt out of
the height cap via `.page-privacy` and let the window scroll naturally. If the sidebar
starts growing past the viewport with many notes, those three rules are where to look.

Content pages use a 760px card inside a page that maxes at `--content-default` (920px),
with `--content-narrow` (820px) and `--content-wide` (1120px) available. The document
measure is 68ch everywhere it appears — title, byline, tag bar, textarea, and rendered
markdown all share it, so the left edge of the document never shifts.

Spacing is an 8px base with a 4px micro step (4/8/12/16/24/32/48/64).

**Responsive.** The system collapses structurally rather than fluidly. Below 768px the
grid becomes a single pane: the sidebar *is* the list, and selecting a note swaps to a
full-screen editor with a Back button. Under `(pointer: coarse)` or `(max-width: 640px)`
every small control is promoted to a 44px minimum hit area — buttons, icon buttons,
tag pills, filter chips, the format bar, and the search field. The format pill scrolls
sideways instead of wrapping. Type sizes do not change; only structure does.

## Elevation & Depth

Soft Glass is a **floating** system, and this is the sharpest break from the app's
earlier flat identity. Depth comes from three stacked cues: the tinted wash at the
back, translucent frosted panels above it, and wide low-opacity shadows that read as
diffuse ambient light rather than a hard drop. Shadow color is not black — it is
`rgba(35, 42, 90, …)`, a blue-violet that belongs to the same family as the wash, so
panels look lit rather than cut out.

Blur is compositing-expensive, so it is rationed. Frosted panels are large,
non-repeating surfaces; repeated elements (rows, chips, tags, buttons) get opacity and
shadow but never `backdrop-filter`.

### Shadow Vocabulary
- **`--shadow-sm`** (`0 1px 2px rgba(28,30,40,0.05)`): The faintest cue. Switch knobs.
- **`--shadow-row-active`** (`0 2px 8px rgba(35,42,90,0.07)`): The selected note row.
- **`--shadow-seg`** / **`--shadow-chip`**: The active segmented option and the active
  format chip — small white surfaces lifting off a control-fill track.
- **`--shadow-md`** / **`--shadow-card`** (`0 8px 20px rgba(35,42,90,0.10–0.12)`):
  Popovers, toasts, the active note card.
- **`--shadow-primary`** (`0 8px 18px rgba(78,95,216,0.35)`): The indigo glow beneath
  primary and danger pills. This is a *colored* shadow — it is the accent's own hue,
  which is what makes a primary button read as lit rather than merely filled.
- **`--glass-shadow`** / **`--shadow-lg`** (`0 20px 50px rgba(35,42,90,0.12)`): The
  floating glass panels and modal dialogs.
- **`--shadow-empty`** (`0 30px 70px rgba(35,42,90,0.16)`): The first-run card, the
  deepest float in the system.

### Named Rules

**The Blur Allowlist Rule.** `backdrop-filter` appears on exactly seven surfaces, and
the list is closed: `.sidebar`, `.main`, `.dialog`, `.onboarding-panel`,
`.editor-format`, `.status-chip.is-floating`, and the About nav pill
(`.page-about .privacy-header`). The dialog scrim blurs separately at 8px. Each is a
single, large, rarely-repeated surface. Adding an eighth requires a reason; blur on a
repeated row, chip, or tag is a bug. Note that `CLAUDE.md` describes this as "the two
top-level panels" — that is understated, and this list is the accurate one.

**The Triple-Fallback Rule.** Every blurred surface ships three things or it is
incomplete: the `-webkit-backdrop-filter` prefix alongside the standard property, an
`@supports not (backdrop-filter…)` opaque fallback, and a
`prefers-reduced-transparency: reduce` opaque fallback. `contain: layout style paint`
on the two shell panels isolates their rendering cost.

**The No-Lift Rule.** Nothing moves toward the viewer on hover. Hover changes fill and
color; press changes scale to 0.98 over 120ms. There is no `translateY` hover, no
shadow-growth-on-hover, and no bounce on any control — the one `--ease-pop` overshoot
in the system belongs to the dialog entrance and nowhere else.

## Shapes

Nothing in this system has a square corner. The form language is pills for anything
interactive and squircles for anything that holds content, with a twelve-step radius
scale that is genuinely used rather than aspirational: 4 (micro), 7 (inline code and
`kbd`), 8 (segmented options, hints), 9 (the brand glyph), 11 (segmented track),
12 (inputs), 14 (note rows, cards, code blocks, blockquotes), 16 (the writing
textarea), 20 (icon squircles), 22 (floating panels and dialogs), 26 (the first-run
card), and 999 (pills).

The scale ascends with surface size — the bigger and more floating the thing, the
rounder it gets, which is what makes the two shell panels read as soft objects rather
than as a rounded rectangle layout. Interactive controls skip the scale entirely and
go straight to `pill`.

Borders are 1px hairlines. Three weights exist: `--border` at the visible Edge color
for elements that need a real outline, `--border-hair` at 6% ink for internal dividers,
and `--glass-border` at 90% white for panels — which is not a border in the usual sense
but a specular highlight along the panel's top edge, the thing that makes glass read as
glass.

### Named Rules

**The Hairline Rule.** Every outer border is 1px. The previous system's 1.5px signature
border is retired — if you find a 1.5px outer border, it is a leftover, not a rule. The
one sanctioned exception is `outline: 2px solid var(--accent)` on `:focus-visible`,
which must never be removed or thinned.

**The Accent-Bar Rule.** The selected-note indicator is a 2.5px pill-radius bar inset
8px from the row's top and bottom — an inset floating bar, not a full-height
`border-left`. A thick colored `border-left` as a decorative stripe on a card or callout
is the pattern this system replaced; the rendered-markdown blockquote uses the same
inset-pill treatment at 3.5px.

## Components

Controls are **soft-pressed and quiet**. Everything is a pill or a squircle; nothing is
a rectangle. Press is the only theatrical moment — `scale(0.98)` over 120ms — and there
is no lift, glow, bounce, or travel anywhere else. Familiarity is the feature.

### Buttons
- **Shape:** Pill (`999px`), 40px tall, 18px horizontal padding, sans 600 14px. The
  small variant is 32px tall with 14px padding.
- **Primary:** Indigo fill, white text, and the colored `--shadow-primary` glow.
  Hover → Indigo Deep. Used for the single most important action in a context.
- **Secondary:** `control-fill` (5% ink) with ink text and no border — a tinted pill
  rather than an outlined one. Hover → 9% ink.
- **Ghost:** Transparent with secondary text. Hover → `control-fill` and ink text.
- **Danger:** Rust fill, white text, smaller colored shadow. Destructive only.
- **Icon button:** 32–34px circle, `control-fill` on hover; `.is-active` flips to the
  accent trio (accent text on `accent-soft`).
- **All variants:** `:active { transform: scale(0.98) }` at 120ms.

### Chips / Tags / Badges
- **Style:** Pill, 22px tall, 9px padding, 12px sans 500. `badge-accent` is
  `accent-soft` fill with accent text; success, warning, and danger use their tints.
- **Tag:** Interactive — click to filter — with an optional `×` remove control. Hover
  deepens to `accent-soft-2`. The active filter appears as a badge with a clear `×`
  beside the search field.
- **Status chip:** 26px pill, `control-fill`, sans 500 11px, with a 6px status dot. It
  carries backup state through `data-backup-state`: healthy (meadow tint), aging (amber
  tint), missing (rust tint, weight 600). This is the app's privacy guarantee made
  visible — it sits at the sidebar foot on the app page and floats bottom-left on
  first run.

### Cards / Containers
- **Glass panel:** 22px radius, `glass-bg`, 26px blur, white specular border,
  `--glass-shadow`, `contain: layout style paint`. The two shell panels and the dialog.
- **Opaque card:** 14px radius, Paper fill, 1px Edge border, 24px padding. **Never nest
  a card inside a card**, and never put `backdrop-filter` on one.
- **First-run card:** 26px radius, `glass-bg-strong`, 28px blur, the deepest shadow in
  the system.

### Inputs / Fields
- **Style:** `field-bg` (85% white) with a 1px hairline, 12px radius, 38px tall, sans
  14px, and an inset shadow that makes the field read as pressed into the panel rather
  than raised off it. The textarea uses 16px radius and a 70% white fill.
- **Focus:** Border shifts to accent plus a 3px `--accent-focus-ring` halo. The global
  `*:focus-visible` adds a 2px accent outline at 2px offset.
- **Error:** Rust border and rust focus halo. **Disabled:** `gray-100` fill, muted text,
  `not-allowed`.
- **Placeholder:** Muted (`#9A9EAD`) — not a fainter gray.
- **Search:** A dedicated 38px control with a leading icon, a borderless inner input,
  and a trailing `⌘K` hint chip that hides on coarse pointers.

### Navigation
- **Note rows:** Full `<button>` elements, never divs. Transparent at rest with a 14px
  radius; hover adds `row-hover` (4% ink). The selected row becomes a Paper card with a
  hairline border, `--shadow-row-active`, and the inset 2.5px accent bar.
- **Segmented switch:** Notes / Trash / Tags on an 11px `control-fill` track with 3px
  padding; the active option is a white 8px-radius pill with `--shadow-seg` and
  weight 600. Marked with `aria-pressed`.
- **About nav:** The page header becomes a centered floating glass pill, 48px tall, at
  pill radius with `--shadow-pill-float`.
- **Mobile:** Single pane, structural collapse, Back button. Not fluid type.

### Signature Component — The Editor Document

The right pane reads like a page rather than a form. A serif 34px title at weight 400
sits above a sans byline of real metadata (created / updated / word count / read time)
in muted 12.5px. Below that, the document runs at 68ch: sans 16.5px/1.75 in Body ink,
with serif `h2`/`h3` picking up the title's voice, `accent-soft` blockquotes carrying
an inset 3.5px accent pill, 7px-radius inline code, and 14px-radius borderless code
blocks. Edit mode swaps in a textarea at *identical* type and measure, gaining only an
inset glass writing surface — so switching between reading and writing moves nothing on
screen. A decorative format pill floats above the document in edit mode, frosted and
sticky.

## Do's and Don'ts

### Do:
- **Do** route every color through `var(--token)`. A literal hex in `app.css` is a
  defect even when it looks right.
- **Do** keep serif for the document and sans for the chrome — the Ink-and-Chrome Rule
  is the system's most load-bearing line.
- **Do** keep every outer border at 1px; use `--glass-border` on floating panels and
  `--border-hair` for internal dividers.
- **Do** ship all three fallbacks with any blurred surface: the `-webkit-` prefix, the
  `@supports not` opaque path, and the `prefers-reduced-transparency` opaque path.
- **Do** keep blur on the seven allowlisted surfaces and give repeated elements
  opacity and shadow instead.
- **Do** use `--accent-text` (not `--accent`) for any accent text or glyph sitting on
  an accent tint, and verify new tint pairings against `--paper` — the lightest
  backdrop a tint can composite over.
- **Do** reserve monospace for real machine data — timestamps, counts, tags, shortcuts,
  code.
- **Do** use inline SVG stroke icons and a `<template>` + `cloneNode` for static icons;
  never emoji, never an icon font.
- **Do** give every interactive control its full state set — default, hover,
  focus-visible, active, disabled — plus `aria-pressed`/`aria-expanded` where it toggles.
- **Do** keep motion at 120–150ms for state changes and 300ms for entrances, with a
  `prefers-reduced-motion` path for every animation including smooth scroll.
- **Do** validate dark mode by flipping tokens in `inkwell-tokens.css`, and keep the
  `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]` blocks identical.

### Don't:
- **Don't** add a second saturated accent. Indigo is the only hue that touches a
  control; apricot is legal in the wash gradient and nowhere else.
- **Don't** put `backdrop-filter` on a row, chip, tag, button, or any element that
  repeats. Compositing cost scales with instance count.
- **Don't** add a hover-lift, a shadow that grows on hover, or a bounce easing on a
  control. `--ease-pop` belongs to the dialog entrance alone.
- **Don't** use a 1.5px outer border — that signature belonged to the retired Analog
  Notebook system and any surviving instance is a leftover.
- **Don't** use a thick colored `border-left` as a decorative stripe. Selection and
  quotation both use an inset pill-radius bar (2.5px and 3.5px).
- **Don't** set the note title in sans or a button in serif.
- **Don't** ship the **generic AI-template aesthetic**: no gradient text outside the
  About display headline, no glassmorphism as decoration beyond the allowlist, no
  identical icon-card grids, and no uppercase tracked eyebrow over every section.
- **Don't** drift toward **bloated productivity SaaS** chrome — no nested sidebars,
  slash-command overload, or feature-stuffed toolbars. Scratchpad stays a scratchpad.
- **Don't** add `[data-theme="dark"] {…}` rules to `app.css`. If something renders
  wrong in dark mode, the token usage is wrong.
- **Don't** load a web font, a CDN script, or any third-party asset. Platform fonts
  only; everything same-origin; zero network calls for user data.
