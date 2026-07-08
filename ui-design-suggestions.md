# UI and Design System Suggestions

This review covers the current Scratchpad web UI, the Inkwell-based design system, and the main app workflows: empty state, populated notes, editing, dialogs, mobile list/editor switching, dark mode, and supporting About/Privacy pages.

## What is working well

- The app has a clear product shape: a calm two-pane notes workspace with a strong local-only privacy message.
- Inkwell tokens give the UI consistent typography, spacing, color, borders, focus rings, and dark-mode behavior.
- The editor surface is pleasant to read, with strong markdown rendering and a focused document width.
- Empty states explain the privacy model and backup path without feeling generic.
- Dark mode is coherent and maintains good contrast across the primary app surfaces.

## Highest-impact improvements

1. Fix the support-page theme toggle.
   The About, Privacy, and Terms pages render `Theme: auto`, but the shared `.theme-toggle` CSS makes the control a 30px square icon button. It visually collapses into cramped text. Use the same icon-only theme toggle as the app page, or add a page-specific text-button style.

2. Fix mobile note opening for the already-selected row.
   On mobile, tapping the currently selected note in the list does not open the editor because `selectNote()` returns before setting `mobileView = 'editor'`. Set and sync the mobile editor view before that early return.

3. Reduce the app-page footer.
   The footer consumes meaningful workspace height, especially on mobile. Collapse version/legal links into About or use a smaller app-only footer, while keeping the richer footer for About, Privacy, and Terms pages.

4. Make backup and export more prominent.
   Export is central to a local-only app. Consider moving backup/export/import actions out of the About modal into a visible toolbar menu or a dedicated "Backup" action.

5. Tone down automatic editorial markdown styling.
   `decorateRendered()` automatically turns long first paragraphs into italic ledes and short blockquotes into pullquotes. It looks polished, but normal notes can feel unexpectedly editorial. Consider making this opt-in through markdown conventions or a note display setting.

## Design system recommendations

- Add Scratchpad-level primitives on top of Inkwell: segmented view switch, icon toolbar, document shell, empty-state panel, tag row, and note-list row.
- Keep Inkwell tokens as the source of truth. Avoid one-off CSS values and keep app-specific CSS focused on layout and composition.
- Standardize icon-button sizing and text-button sizing separately so support pages do not inherit app-toolbar constraints.
- Add a compact app-shell footer variant distinct from the richer document-page footer.
- Treat tag controls as a first-class component. The current tag manager works, but the input plus Rename, Filter, and Delete controls make each row visually busy.

## Usability refinements

- Add clearer state feedback after export, import, restore, delete, and copy actions. Toast-style messages would reduce uncertainty.
- Consider a lightweight "Backup" status in the About dialog or footer, such as last export time if stored locally.
- Add a visible keyboard-shortcuts entry point in the overflow menu. Shortcuts currently live in About, which hides a useful power-user feature.
- Improve the no-results state by offering both "clear filters" and "create note from search" when search text is present.
- On mobile, prioritize editing space by removing or compressing nonessential footer content.

## Suggested implementation order

1. Fix the support-page theme toggle styling.
2. Fix the mobile selected-note tap behavior.
3. Collapse or restyle the app-page footer.
4. Promote backup/export/import into a more discoverable command surface.
5. Revisit automatic editorial markdown styling.
6. Extract small Scratchpad UI primitives for repeated patterns.

## Validation notes

The review used a local static server at `http://127.0.0.1:8080/` with isolated Playwright browser data. The inspected app states produced no console errors or page errors. The in-app Browser target was unavailable during review, so Playwright was used for visual inspection.
