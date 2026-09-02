# Search operators — design spec

Date: 2026-09-01
Status: approved

## Decision

Add three search operators to the sidebar search box: `tag:`, `title:`, and
`folder:`. They compose with the surviving scope controls — the
Notes/Archive/Trash lifecycle switch and the tag filter chip — and with
ordinary search words. The earlier four-way scope picker no longer exists
(removed as dead state; see `tasks/lessons.md`), so operators are the
explicit way to narrow a search, and `folder:` is the only way to search
inside one folder. The open folder in the switcher stays ignored by search,
as the focused-search spec and its test already promise.

Parsing and filtering are pure additions to `public/js/search.js`;
presentation changes live in `public/js/search-view.js`; `app.js` only
supplies the folder-name lookup, forwards the parsed filters to the view,
and highlights with the residual text. Ships as v3.20.0.

## Goals

- Let a user narrow a search by tag, title, or folder without a new control,
  and combine those narrowings with each other and with plain words.
- Keep the focused-search contracts intact: case- and diacritic-insensitive
  matching, direct-then-close ranking, match-centered excerpts, keyboard
  traversal, and the flat results mode.
- Keep every existing string and assertion unchanged when no operator is
  present, so current tests stay green and nothing moves for users who never
  type an operator.
- Keep app.js at or below its recorded line ceiling by placing all logic in
  the two strict-typed search modules.

## Query grammar

- An operator is `key:value` where `key` is `tag`, `title`, or `folder`
  (case-insensitive), it appears at the start of the query or after
  whitespace, and `value` runs to the next whitespace. No quoting syntax.
- Any other `word:` sequence is ordinary text and behaves exactly as today.
- An operator whose value is empty (`tag:` while the user is still typing)
  is ignored: it neither filters nor becomes text.
- Operators are removed from the query. The remaining words are the
  residual text. Only the residual text feeds ranking, the close-match
  fallback, excerpts, and highlighting; operator words never appear as
  highlights in rows or in the open note.
- Values are normalized the same way notes are (NFKD, diacritics stripped,
  lower-cased), so `Tag:Café` and `tag:cafe` match the same notes.

## Matching and scope contract

- `tag:value` matches a note that carries a tag equal to the value. This
  mirrors the tag chip, which is an exact match.
- `title:value` matches a note whose stored title contains the value.
- `folder:value` matches a note whose folder display name contains the
  value. Unfiled notes belong to the display name "Notes", so
  `folder:notes` reaches them; substring matching means it also reaches any
  folder whose name contains "notes", such as "Daily Notes".
- Repeated operators AND together: a note must satisfy every value. The tag
  chip and the lifecycle view AND with the operators exactly as they AND
  with text today. Search still ignores the folder open in the switcher.
- Filtering happens before ranking. Residual text ranks the filtered notes
  with the existing direct ladder and falls back to close matches within the
  same filtered set.
- When the residual text is empty and at least one query character is
  present, every filtered note is returned as a direct result in lifecycle
  recency order, with no highlight terms and an excerpt taken from the
  opening of the note.

## Results presentation contract

- The scope line (`#search-results-scope`) reads exactly as today when no
  operator is present: `Notes · all folders`. With operators it lists them
  after the view label, folders first: `Notes · folder daily · tag work`,
  `Archive · all folders · title plan`. Values are shown normalized.
- The live region (`#search-status`) mirrors the scope line in prose. It is
  unchanged without operators (`1 result in Notes across all folders.`) and
  otherwise reads `3 results in Notes, folder daily, tag work.`
- The empty state keeps its title and its "titles, text, and tags" copy,
  substitutes `, folder daily` for ` across all folders` when a folder
  operator is present, and gains one muted hint line:
  `Narrow with tag:name, title:word, or folder:name.` The hint is present in
  every empty state so the syntax is discoverable at the moment it helps.
- Result rows, excerpts, tag pills, the open note's title, and its rendered
  body highlight residual terms only.
- The Clear action, Escape, keyboard traversal, bulk mode inside results,
  dirty-draft protection, and the mobile transition are untouched.

## Keyboard and accessibility contract

- No new shortcuts. `⌘/Ctrl K` and `/` still focus the input; arrows, Enter,
  and Escape behave as before.
- The live region carries the operator scope, so a screen-reader user hears
  which folder, tag, or title narrowing is in effect. The scope line and the
  hint are text, never color-only cues.

## Documentation and verification

- `guide.html`: the Search bullet under "Finding & organizing" and the
  Search bullet under "Folders" describe the three operators, exact tag
  matching, substring title and folder matching, and AND composition.
  `README.md`'s search feature line and `tests/README.md`'s search row gain
  the operators. No new guide section, so `SECTION_IDS` is unchanged.
- Automated coverage in `tests/search-operators.spec.js`, three browsers:
  each operator alone; two tags AND; operator plus residual text ranked
  within the filtered set; `folder:` finding a folder other than the open
  one and `folder:notes` reaching unfiled notes; composition with the tag
  chip and with the Archive view; an unknown `word:` staying literal; no
  highlight on operator words in rows or in the open note; a bare `tag:`
  showing every in-scope note; case and diacritic insensitivity of values;
  the scope line, live region, and empty-state hint strings above.
- `tests/focused-search.spec.js` and `tests/enhanced-search.spec.js` stay
  byte-identical and green. `network-isolation` and `design-tokens` suites
  are untouched.
- No new files to precache and no inline-script change, so the service
  worker shell list and CSP hashes are unchanged. `SCRATCHPAD_VERSION` moves
  to 3.20.0 at release; deploy stays gated on an explicit yes.

## Out of scope

- Quoted values, negation (`-tag:`), OR between values, a `#tag` shorthand,
  date or pinned operators, operator autocomplete, and saved searches.
- Searching the open folder by default, changes to the command palette,
  and changes to the tag chip.
