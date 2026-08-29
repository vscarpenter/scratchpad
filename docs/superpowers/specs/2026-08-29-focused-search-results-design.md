# Focused search results — design spec

Date: 2026-08-29
Status: approved

## Decision

Turn sidebar search into a focused, ranked results mode. Search must retrieve
notes, not merely annotate the normal chronological list: irrelevant notes and
date buckets disappear, the result count and global scope become explicit, and
each row previews the text around the match.

## Goals

- Make a specific note findable within a few seconds in a large local library.
- Eliminate false positives caused by fuzzy character matching across complete
  note bodies.
- Preserve the current local-only, lifecycle, folder, dirty-draft, and mobile
  navigation contracts.
- Keep search fast and keyboard-first without duplicating the command palette.

## Matching and ranking contract

- Search remains case- and diacritic-insensitive across title, body, and tags.
- Direct results require either the complete query phrase or every query token.
  A character subsequence through unrelated body text is not a match.
- Direct results rank by title phrase, title terms, tag phrase, tag terms, body
  phrase, body terms, then lifecycle recency as a tie-breaker.
- Typo-tolerant matching is a fallback only when no direct result exists. It
  compares query terms with complete words in titles and tags, never bodies,
  and the interface labels the returned rows as close matches.
- Tag filters continue to compose with text search. Text search remains global
  across folders inside the selected Notes, Archive, or Trash lifecycle view.

## Results-mode interaction

- A non-empty query hides the Today card and folder/list-management header but
  keeps New note and the Notes/Archive/Trash switch available.
- Results render as one flat relevance-ranked list with no Pinned, Today,
  Yesterday, This week, or Earlier headings.
- The list begins with a visible count and scope such as
  `1 result · Notes · all folders`, plus a Clear action.
- A result excerpt is centered on the first body match. Exact phrases or terms
  are highlighted in the title, excerpt, and tags using existing Indigo tokens.
- Search does not automatically replace the open editor. Opening a result uses
  the existing dirty-draft protection and mobile list-to-editor transition.

## Keyboard and accessibility contract

- `⌘/Ctrl K` and `/` continue to focus and select the search input.
- Down Arrow from the input focuses the first result; Up Arrow focuses the last.
  Arrow keys continue through result rows and return to the input at the edge.
- Enter from the input opens the first result. Escape clears active search and
  tag filters and returns focus to the search input.
- A persistent polite live region announces result count, lifecycle, folder
  scope, and whether the list contains close matches.
- The result summary and highlight are redundant cues; color is never the only
  indication of search state or matching text.

## Empty and responsive states

- No-results copy quotes the query, explains that titles, text, and tags were
  searched across all folders in the current lifecycle, and offers one-step
  clearing of search and filters.
- On narrow viewports the result count, Clear action, excerpt, and row metadata
  fit without horizontal scrolling. The input remains at least 44px high and
  16px on mobile to avoid focus zoom.
- Search introduces no loading or offline state because every operation remains
  synchronous over IndexedDB data already loaded into memory.

## Documentation and verification

- Update the in-app help, guide, README, and test map to describe ranked global
  results, close-match fallback, keyboard traversal, and result clearing.
- Automated coverage verifies false-positive rejection, field ranking, fuzzy
  fallback labeling, match-centered excerpts, flat mode, empty state, lifecycle
  and folder scope, dirty drafts, keyboard traversal, announcements, dark mode,
  and mobile bounds in Chromium, Firefox, and WebKit.

## Out of scope

- Saved or recent searches, search history, remote indexing, and search analytics.
- Search operators, quoted-query syntax, or a separate full-screen search page.
- Deployment, publication, or changes to the command palette.
