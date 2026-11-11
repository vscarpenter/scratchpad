# Open Canvas token decisions (v6)

- Source of truth: public/css/inkwell-tokens.css. Application colors use semantic tokens.
- Warm near-white canvas/navigation; document and stage share one opaque surface. Dark surfaces retain a subtle warm neutral temperature.
- Indigo remains #5661B3 in light and #8593D6 in dark. Accent text, AA pairs, and matching auto/manual dark blocks remain enforced.
- Platform serif for title/prose. System sans for chrome, note rows, section headings, and metadata. Mono for code.
- Title: 44px desktop, 36px tablet, 30px phone, weight 500. Prose: 20px desktop/tablet, 18px phone, 1.6 line height, 680px maximum measure shared by read/edit.
- Navigation: 208px desktop, 176px tablet, modal drawer on phone. Notes: 330px desktop. Below 1100px, list/editor share one pane.
- Flat rows/document, 1px dividers, 6–8px control corners. Dialog depth stays scoped to dialogs.
- No entrance animation. Brief hover/focus feedback respects reduced motion.
