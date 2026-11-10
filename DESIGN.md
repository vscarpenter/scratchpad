---
name: Scratchpad
direction: Open Canvas
version: 6
description: A private notebook with persistent navigation, a month calendar, and an open serif writing canvas.
colors:
  canvas: "#F8F7F4"
  paper: "#FFFEFC"
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
document-measure: "680px"
---

# Design System: Open Canvas

The user approved v6 on November 10, 2026. The canonical specification is
[Open Canvas](docs/superpowers/specs/2026-11-10-open-canvas-design.md), with token decisions in [.ui-craft/tokens.md](.ui-craft/tokens.md).

## Composition and typography

Persistent 208px navigation, a 330px note index with month calendar, and a flat document occupy desktop widths from 1100px. Tablets keep 176px navigation beside a single list/editor pane. Phones use a named native navigation dialog. The calendar starts collapsed on phones.

Use platform serif for title and prose, system sans for navigation and section headings, mono for code. Reading and Markdown editing share a 680px maximum measure and identical metrics: 20px/1.6 desktop/tablet and 18px/1.6 phone.

## Surfaces and interaction

The document and stage share one warm near-white surface. The app shell uses flat rows and hairline column dividers. Indigo marks focus, links, and current state. All colors resolve through tokens; dark mode is driven by byte-parallel auto/manual token blocks. Existing dialog treatment stays scoped to dialogs.

Calendar dates use local numeric arithmetic at noon, expose today separately from selection, and offer arrows, week Home/End, and month Page Up/Down. Navigation and calendar actions retain draft confirmation and existing daily-note identity. Mobile navigation uses native modal focus and Escape handling; no decorative entrance motion.

## Product invariants

Keep Markdown Edit/Save, local-only IndexedDB, encrypted opt-in sharing, offline precache, backup visibility, platform fonts, sanitized rendering, keyboard access, and visible focus. No remote assets, telemetry, data migration, or new network requests.

V4/v5 historical rationale remains in docs/superpowers/specs; v6 supersedes the date rail, date spine, raised page, and serif section headings.
