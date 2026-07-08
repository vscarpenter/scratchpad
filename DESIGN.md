---
name: Scratchpad
description: A privacy-first, local-only notes app — calm, editorial, restrained.
colors:
  accent: "#3B4A8C"
  accent-deep: "#2A3768"
  accent-tint: "#3B4A8C24"
  ivory: "#F4F4F0"
  paper: "#FFFFFF"
  slate: "#13141B"
  oat: "#DDDCDF"
  olive: "#788C5D"
  rust: "#B04A3F"
  warning: "#C78E3F"
  warning-text: "#A06A2A"
  info: "#5C7CA3"
  sky: "#6A8CAF"
  gray-100: "#EDEDEA"
  gray-300: "#CFCFCC"
  gray-500: "#6F6F75"
  gray-700: "#3A3B41"
typography:
  display:
    fontFamily: "Iowan Old Style, Palatino, Source Serif Pro, Georgia, serif"
    fontSize: "48px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Iowan Old Style, Palatino, Source Serif Pro, Georgia, serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.018em"
  title:
    fontFamily: "Iowan Old Style, Palatino, Source Serif Pro, Georgia, serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.12em"
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Monaco, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "20px"
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
    rounded: "{rounded.sm}"
    height: "38px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.slate}"
    rounded: "{rounded.sm}"
    height: "38px"
    padding: "0 16px"
  button-ghost:
    textColor: "{colors.gray-700}"
    rounded: "{rounded.sm}"
    height: "38px"
    padding: "0 16px"
  button-danger:
    backgroundColor: "{colors.rust}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    height: "38px"
    padding: "0 16px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.slate}"
    rounded: "{rounded.sm}"
    height: "38px"
    padding: "0 12px"
  badge-accent:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    height: "22px"
    padding: "0 9px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "24px"
  dialog:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
---

# Design System: Scratchpad

## 1. Overview

**Creative North Star: "The Analog Notebook"**

Scratchpad is a paper notebook that happens to live in a browser tab. The
governing idea is locality: what you write stays where you put it, the way ink
stays on a page, until you decide to move it. The interface is built to recede —
serif headings and generous margins give the words a quiet room to sit in, and
nothing on screen competes with the sentence the user is writing. This is a
**product** surface, not a showcase; its highest compliment is that you stop
noticing it.

The palette is a single deep indigo accent on a cool off-white (Ivory) page, with
a true-white (Paper) surface floating just above it. Type does the heavy lifting:
a platform serif for anything titled, a system sans for reading, and a monospace
reserved for genuine metadata (timestamps, counts, tags, shortcuts). Borders are a
consistent 1.5px hairline; surfaces are flat. Motion is brief and only ever reports
a state change. The whole system is designed so a developer who lives in their
editor trusts it on sight and never has to think about it.

This system explicitly rejects four neighbors: **bloated productivity SaaS**
(Notion/Confluence sprawl — nested chrome, slash-command overload, database views);
the **generic AI-template aesthetic** (gradient hero text, glassmorphism, identical
icon-card grids, an uppercase tracked eyebrow over every section); **consumer-bland
defaults** (Apple/Google Notes — characterless, no point of view); and the
**over-designed and loud** (heavy shadows, motion everywhere, decoration competing
with the writing). With all four ruled out, character has to come from typography,
spacing, and restraint — never from ornament.

**Key Characteristics:**
- One deep-indigo accent; everything else is a tinted neutral.
- Serif for titles, sans for body, mono strictly for metadata.
- 1.5px hairline borders everywhere; flat surfaces, no surface shadows.
- Token-only color — every value is a `var(--token)`, never an inline hex.
- Dark mode is a pure token flip; no theme-specific component rules exist.
- Motion is functional (150ms state changes), never choreographed.

## 2. Colors

A restrained palette: one saturated accent, a cool-neutral surface stack, and a
small semantic set used only for state. Color is information here, not decoration.

### Primary
- **Indigo** (`#3B4A8C`): The single brand accent. Primary buttons, the active
  selection, links, focus rings, the sidebar/footer top edge, and tag badges.
  Carried as a periwinkle (`#7A8AD1`) in dark mode so it lifts off the dark surface.
- **Indigo Deep** (`#2A3768`): Hover/pressed state of the accent only. Never a
  second brand color.

### Secondary (semantic only — never decorative)
- **Olive** (`#788C5D`): Success and additions. Tinted background for "safe" chips.
- **Rust** (`#B04A3F`): Danger and deletions. Destructive buttons, danger alerts.
- **Warning** (`#C78E3F`, text `#A06A2A`): Caution. The pinned-row edge marker.
- **Info / Sky** (`#5C7CA3` / `#6A8CAF`): Informational accents and the one
  permitted data-viz alternate.

### Neutral (the page is built from these)
- **Ivory** (`#F4F4F0`): Page background. A cool stone off-white, barely warm —
  deliberately *not* the cream/sand AI default.
- **Paper** (`#FFFFFF`): Raised surface — cards, the editor, dialogs, the sidebar.
- **Slate** (`#13141B`): Primary text, with a faint cool undertone.
- **Oat** (`#DDDCDF`): Tertiary surface, hover thumbnails, tooltip/inverse text.
- **Putty grays** (`#EDEDEA` / `#CFCFCC` / `#6F6F75` / `#3A3B41`): Hairline fills,
  borders, muted text, and strong secondary text respectively. `gray-500` is the
  muted-text floor and is documented at AA (5.05:1 on Paper, 4.64:1 on Ivory).

### Named Rules
**The One Accent Rule.** There is exactly one brand hue: Indigo. Olive, Rust,
Warning, Sky exist only to carry state (success/danger/caution/info). If a second
saturated color shows up as decoration, it is a bug.

**The No Inline Color Rule.** Every color in app CSS is a `var(--token)`. A literal
hex in `app.css` is forbidden — it breaks the dark-mode flip and the palette swap.

## 3. Typography

**Display / Title Font:** Iowan Old Style (with Palatino, Source Serif Pro, Georgia)
**Body Font:** system-ui (with -apple-system, Segoe UI, Roboto, Arial)
**Label / Metadata Font:** ui-monospace (with SF Mono, Menlo, Monaco)

**Character:** A platform serif gives every heading and note title an editorial,
booklike warmth without shipping a single web font. The system sans keeps reading
neutral and native at every DPI. The monospace is a deliberate metadata signal — it
appears *only* where the content is literally machine data (timestamps, word counts,
tags, keyboard shortcuts), so its presence always means "this is a fact about the
note," never decoration. Platform fonts only: no `@font-face`, ever.

### Hierarchy
- **Display** (serif 600, 48px, lh 1.05, -0.025em): Marketing hero on `about.html`;
  the only place clamp-scaling is used (`clamp(40px, 5.6vw, 68px)`).
- **Headline** (serif 600, 32px, lh 1.2, -0.018em): Top page titles. The note
  document title renders at 34px in this family.
- **Title** (serif 600, 19–24px): Section headings, dialog headings, sidebar empty
  states.
- **Body** (sans 400, 16px, lh ~1.6): Reading text. Prose capped at 60–65ch;
  rendered markdown runs at line-height 1.68 for comfort.
- **Label / Eyebrow** (mono 500, 11px, +0.12em, UPPERCASE): Metadata kickers and
  section labels. Short only (≤4 words).
- **Mono body** (mono 400, 14px, lh 1.6): The raw-markdown editor and code blocks.

### Named Rules
**The Mono-Means-Metadata Rule.** Monospace is reserved for actual machine data —
timestamps, counts, tags, shortcuts, breadcrumbs. Never set body copy or a heading
in mono "for flavor."

**The Fixed-Scale Rule.** Product UI uses a fixed rem/px scale, not fluid clamp().
Only the `about.html` marketing hero clamps. A heading that shrinks inside a sidebar
looks worse, not better.

## 4. Elevation

The system is **flat by default**. Surfaces (cards, the editor, the sidebar, note
rows) carry depth through a 1.5px hairline border and tonal layering — Ivory page,
Paper surface, gray-100 hairline fills — not through shadow. Shadows exist *only* on
true overlays that float above the page: dialogs, the overflow popover, and toasts.
There are no hover-lift effects and no shadows on resting surfaces.

### Shadow Vocabulary (overlays only)
- **`--shadow-sm`** (`0 1px 2px rgba(20,20,19,0.06)`): The faintest cue; reserved
  for genuinely floating chips. Not for resting content surfaces.
- **`--shadow-md`** (`0 4px 14px rgba(20,20,19,0.08)`): The overflow popover menu
  and toasts.
- **`--shadow-lg`** (`0 12px 28px rgba(20,20,19,0.12)`): Modal dialogs.

### Named Rules
**The Flat-Surface Rule.** Resting surfaces are flat. If a card, list row, or panel
has a `box-shadow`, that's a defect — depth comes from the 1.5px border and the
Ivory/Paper/gray tonal stack. Shadows belong to overlays alone.

**The Hairline Rule.** Every outer border is `1.5px` via `var(--border)`. Never 1px
or 2px for an outer border. Internal dividers use the 1px `--border-hair`.

## 5. Components

The component vocabulary is one consistent set, applied identically across every
screen. Same button shapes, same form controls, same icon style (inline SVG strokes,
never emoji). Familiarity is the feature; surprise is the bug.

### Buttons
- **Shape:** Gently rounded (8px, `--r-sm`), 38px tall, 1.5px border.
- **Primary:** Indigo fill, Paper text (`background: var(--accent)`); hover → Indigo
  Deep. Used for the single most important action in a context.
- **Secondary:** Paper fill, Slate text, gray-300 border; hover → gray-100 fill.
- **Ghost:** Transparent, gray-700 text; hover → gray-100. Icon-adjacent actions.
- **Danger:** Rust fill, Paper text; hover → Rust Deep. Destructive only.
- **Icon button:** 34×34, transparent, 1.5px border, gray-700 stroke icon; `.is-active`
  flips to the accent trio (accent text + tint fill + accent border).

### Chips / Tags
- **Style:** `.badge-accent` — Indigo-tint fill (`#3B4A8C24`), Indigo text, pill
  radius, mono 11px. A tag is a filter button plus an optional `×` remove control.
- **State:** Tags are interactive (click to filter). The active filter shows as a
  badge with a clear `×` near the search box.

### Cards / Containers
- **Corner Style:** 14px (`--r-lg`) for the editor card and dialogs; 12px (`--r-md`)
  for panels.
- **Background:** Paper on the Ivory page.
- **Shadow Strategy:** None at rest (see Elevation). Border carries the edge.
- **Border:** 1.5px `var(--border)`.
- **Internal Padding:** 24px (`--sp-5`) typical. **Never nest a card inside a card.**

### Inputs / Fields
- **Style:** Paper fill, 1.5px border, 8px radius, 38px tall, sans 14px.
- **Focus:** Border shifts to Indigo plus a 3px `--accent-focus-ring` halo. The
  global `:focus-visible` adds a 2px accent outline at 2px offset.
- **Error:** Rust border + rust focus halo (`.is-error`). Disabled: gray-100 fill,
  gray-500 text, `not-allowed`.
- **Placeholder:** gray-500 — meets the 4.5:1 placeholder-contrast bar, not a faint gray.

### Navigation
- **Sidebar list:** Note rows are full `<button>`s (never divs) with a 1.5px
  transparent left edge that turns Indigo when active, Warning when pinned. The row
  is flat — selection reads from the left edge + Paper fill, no shadow.
- **Segmented view switch:** Notes / Trash / Tags as an equal 3-up button group.
- **Mobile:** Single pane. The sidebar is the list; selecting a note swaps to a
  full-screen editor with a Back button. Structural collapse, not fluid type.

### Signature Component — The Editor Document
The right pane reads like a page: a mono eyebrow ("Note · draft"), a 34px serif
title, a mono byline (created / updated / word count / read time), a hairline rule,
then the rendered markdown at a comfortable 60–65ch measure. Read mode renders
sanitized markdown; edit mode is a borderless mono `<textarea>` at the same measure.
A first long paragraph becomes an italic serif lede; a short standalone blockquote
becomes a pullquote — editorial touches the JS applies, not the author.

## 6. Do's and Don'ts

### Do:
- **Do** route every color through `var(--token)`. No literal hex in `app.css`.
- **Do** keep borders at exactly 1.5px (`var(--border)`); 1px only for internal
  hairline dividers (`--border-hair`).
- **Do** reserve monospace for real metadata — timestamps, counts, tags, shortcuts.
- **Do** keep surfaces flat; let the 1.5px border and Ivory/Paper/gray layering
  carry depth.
- **Do** use inline SVG stroke icons (1.4–1.8px stroke), and open external links
  with `rel="noopener noreferrer"`.
- **Do** give every interactive control its full state set: default, hover,
  focus-visible, active, disabled — plus `aria-pressed`/`aria-expanded` where it toggles.
- **Do** keep motion to ~150ms state changes, and provide a `prefers-reduced-motion`
  path for every animation (including smooth scroll).

### Don't:
- **Don't** add a second saturated accent. One hue (Indigo); Olive/Rust/Warning/Sky
  are state only.
- **Don't** ship the **generic AI-template aesthetic**: no gradient text, no
  glassmorphism as decoration, no identical icon-card grids, and **no uppercase
  tracked eyebrow over every section** (one or two as deliberate accents, never a
  per-section reflex).
- **Don't** drift toward **bloated productivity SaaS** chrome — no nested sidebars,
  slash-command overload, or feature-stuffed toolbars. Scratchpad stays a scratchpad.
- **Don't** settle for **consumer-bland** system defaults (Apple/Google Notes). The
  serif, the hairline borders, and the indigo are the point of view.
- **Don't** go **over-designed or loud**: no drop shadows on resting surfaces, no
  hover-lift, no decoration competing with the writing.
- **Don't** put a `box-shadow` on a resting card, panel, or list row. Shadows are for
  overlays (dialogs, popover, toasts) only.
- **Don't** use a `border-left`/`border-right` thicker than 1.5px as a colored
  accent stripe on cards or callouts.
- **Don't** load a web font or any third-party asset. Platform fonts only; everything
  same-origin. The app makes zero network calls for user data.
