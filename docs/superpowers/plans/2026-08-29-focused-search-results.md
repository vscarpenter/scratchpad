# Focused search results implementation plan

**Goal:** Implement the approved focused, relevance-ranked sidebar search in
`docs/superpowers/specs/2026-08-29-focused-search-results-design.md` while
preserving local-only storage and existing note workflows.

**Architecture:** Extract pure query normalization, scoring, conservative
title/tag typo matching, and match-centered excerpt generation into a small
`public/js/search.js` module. Keep DOM rendering and application state in
`public/js/app.js`, use the existing note-row component and token system, and
cache the new same-origin module in the offline app shell.

## Task 1: Search semantics and ranking through TDD

- Add failing Playwright cases that reject full-body subsequence false positives.
- Cover phrase/all-term matching, title/tag/body relevance order, recency
  tie-breaking, direct-result precedence, and labeled title/tag fuzzy fallback.
- Implement and load the typed search module, then route sidebar filtering
  through its ranked result model.
- Run enhanced-search and folder/lifecycle search coverage; commit the slice.

## Task 2: Focused results presentation through TDD

- Add failing cases for the flat count/scope header, hidden chronology/folder
  chrome, retained New note/lifecycle controls, match-centered excerpts,
  highlights, and actionable no-results copy.
- Render dedicated search-result rows and summary state using existing note-row
  semantics and Indigo-on-Paper tokens only.
- Preserve selection, dirty drafts, tag composition, bulk-mode safety, and
  mobile list-to-editor behavior; commit the slice.

## Task 3: Keyboard, announcements, and responsive behavior

- Add cases for Enter, Up/Down traversal, Escape clearing, persistent polite
  announcements, 44px targets, mobile input sizing, and horizontal bounds.
- Wire native keyboard focus behavior without animation and verify the result
  state in light, dark, desktop, and mobile browser renders.
- Update guide, About help, README, service-worker shell, and test map; commit.

## Task 4: Final verification

- Run focused search, folders, archive, keyboard, mobile, network-isolation,
  design-token, touch-target, layout-scroll, service-worker, and guide coverage.
- Run `npm run verify`, `npm test`, and the CSP hash consistency check.
- Inspect the local app visually at desktop and mobile sizes, review the final
  diff and commit history, and leave deployment/push for an explicit request.
