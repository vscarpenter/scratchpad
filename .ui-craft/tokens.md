## Porcelain Chronicle token decisions

### Color

- Canvas: `#EFF1F7`
- List surface: `#F4F5FA`
- Rail surface: `#FAFAFE`
- Document surface: `#FFFEFE`
- Ink: `#25283A`
- Secondary ink: `#484B61`
- Muted ink: `#73788C`
- Hairline: `#D9DBEA`
- Indigo: `#5661B3`
- Indigo hover: `#414B91`
- Indigo tint: `#E8EAFA`
- Indigo faint: `#F2F3FB`

Indigo is the only non-semantic accent. It appears on the selected date, primary action, document date spine, focus ring, and restrained current-state tints.

### Typography

- Chrome and document use the system sans stack.
- Document title: 44px desktop, 34px compact desktop, 28px mobile; weight 700; tight tracking.
- Reading body: 16–16.5px with 1.7–1.75 line height and a 620px target measure.
- Dates and compact metadata use the existing system mono stack.

### Shape and depth

- Controls: 10–12px radius.
- Note rows: 13–14px radius.
- Document: 22px top corners on desktop.
- Active note and document use layered Indigo-tinted shadows; structural rails use hairline borders.
- No decorative gradients or glass blur in the application shell.

### Layout

- Wide desktop: 104px date rail, 330px note list, remaining document stage.
- Compact desktop: 80px date rail, 296px note list, remaining document stage.
- Below 900px: hide the date rail and retain the existing two-pane layout.
- Below 768px: preserve the existing one-pane list/editor navigation.

### Motion

- No shell entrance animation.
- Hover and press feedback stays under 150ms.
- All motion honors `prefers-reduced-motion`.
