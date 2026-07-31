# Porcelain Chronicle Indigo — design spec

Date: 2026-07-31
Status: approved design → implementation

## Goal

Replace the Soft Glass application shell with the approved Porcelain Chronicle composition and selected Indigo palette while preserving Scratchpad’s local-only behavior, information architecture, and existing feature set.

## Composition

Desktop uses three structural regions:

1. A narrow chronological rail containing the Scratchpad mark, month, five recent dates, and a Today shortcut.
2. The existing note-list sidebar, restyled as a quiet porcelain panel with the current date, search, capture actions, lifecycle switch, folders, notes, and backup state.
3. The existing editor stage, with its toolbar above a raised document and a persistent date spine inside the document.

The document remains the focal point. The calendar rail is wayfinding rather than a second navigation system.

## Calendar behavior

- Render five local dates ending today.
- The selected note’s `dailyDate`, or its creation date for ordinary notes, marks the active date when it is in the visible range.
- Activating a date opens its daily note if one exists and creates that date’s daily note otherwise.
- Daily-note identity remains the existing `dailyDate` field and continues to use the managed Daily Notes folder.
- Today’s existing button and keyboard shortcut reuse the same date-opening path.

## Visual system

- Use the approved Indigo palette: `#5661B3` accent, `#414B91` hover, `#E8EAFA` tint, and cool porcelain neutrals.
- Remove decorative wash gradients, frosted blur, and floating shell cards from the app surface.
- Use Indigo only for primary actions, current date/state, focus, and restrained metadata.
- Keep semantic warning, error, and backup colors only where state meaning requires them.
- Preserve intentional dark mode through token remapping.

## Responsive behavior

- At 900px and above, show the date rail.
- From 768px through 899px, keep the current two-pane desktop shell without the rail.
- Below 768px, retain the tested mobile list/editor switching model and hide the rail and document spine.
- Focus mode hides both the rail and note list.

## Accessibility

- Date controls are native buttons with full accessible names and `aria-current` on the active date.
- Focus remains visible and uses the Indigo focus token.
- Color is not the only indicator of date selection: the active button also exposes `aria-current="date"`.
- Existing keyboard, dialog, menu, and touch-target contracts remain unchanged.

## Non-goals

- No scheduling, events, calendar sync, or remote data.
- No database schema or backup-format change.
- No new dependency, font, build step, or external request.
- No About-page redesign in this pass beyond shared token changes.
- No deployment.

## Verification

- Targeted Playwright tests for date rail rendering, daily-note opening/creation, document date spine, desktop containment, and mobile hiding.
- Existing daily-note, layout, mobile-navigation, editor-rail, accessibility, and theme tests.
- Full Chromium, Firefox, and WebKit suite.
- Live screenshots at wide desktop, compact desktop, mobile, and dark mode.
