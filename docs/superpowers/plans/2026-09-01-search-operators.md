# Search Operators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `tag:`, `title:`, and `folder:` search operators
(`docs/superpowers/specs/2026-09-01-search-operators-design.md`) as v3.20.0.

**Architecture:** `public/js/search.js` gains a pure parse step
(`parseQuery`) that strips operators into filters and residual text, a
filter step over the already lifecycle-and-chip-scoped note array, and a
`searchNotes` composer that ranks the residual text with the existing
`rankNotes`. `public/js/search-view.js` renders the scope line, live-region
sentence, and empty-state hint from the parsed filters. `public/js/app.js`
only swaps `rankNotes` for `searchNotes`, supplies a folder-name callback,
forwards `filters` to the chrome, and highlights with the residual text.

**Tech Stack:** Vanilla browser JavaScript (no build step), Playwright E2E on
Chromium, Firefox, and WebKit, Biome, `tsc` strict checks on the two search
modules.

**Spec:** `docs/superpowers/specs/2026-09-01-search-operators-design.md`

## Global Constraints

- Zero network: no fetch/XHR anywhere; `tests/network-isolation.spec.js`
  untouched.
- No new files to precache and no inline `<script>` edits, so
  `public/service-worker.js` and the CSP hashes stay byte-identical
  (`bash cloudfront/recompute-csp-hashes.sh` must report no change).
- `search.js` and `search-view.js` are in `jsconfig.json` strict `include`
  and carry `// @ts-check`: every new function needs JSDoc types and
  `npm run check:types` must pass. Both files stay under 400 lines, every
  function under 40 lines, nesting depth at most 3.
- `app.js` may not exceed 6204 lines (`config/structure-baseline.json`);
  it is at 6203 today. Never run `biome format --write` on app.js.
- Existing strings stay byte-identical when no operator is typed:
  `Notes · all folders`, `1 result in Notes across all folders.`, and the
  empty-state copy containing `titles, text, and tags`.
- Tests are top-level `test(...)` calls (no `describe` wrappers) and each
  test body stays under 40 lines because the structure ratchet counts test
  functions. Run one spec with `npm test search-operators.spec.js`.
- Commits follow Conventional Commits with a scope and end with the
  `Claude-Session:` trailer; one commit per task.

---

### Task 1: Parse, filter, and rank behind the existing search box

**Files:**
- Modify: `public/js/search.js` (typedefs at lines 6-9, `resultExcerpt` at
  153-160, `rankNotes` at 172-189, export at 213)
- Modify: `public/js/app.js:1350-1356` (`currentSearchResults`,
  `filteredNotes`)
- Test: `tests/search-operators.spec.js` (create)

**Interfaces:**
- Consumes: `rankNotes(notes, query)`, `normalize(value)`, `plainBody(body)`,
  `compareResults(left, right)` already in `search.js`;
  `folderDisplayName(folderId)` and `noteFolderId(note)` in `app.js:784-791`.
- Produces: `window.ScratchpadSearch.parseQuery(query)` returning
  `{ text: string, filters: { tags: string[], titles: string[], folders: string[] } }`;
  `window.ScratchpadSearch.searchNotes(notes, query, { folderNameOf })`
  returning `{ kind, results, text, filters }` where `kind`/`results` match
  `rankNotes`. Task 2 reads `text` and `filters` from that result.

- [ ] **Step 1: Write the failing filter tests** in
  `tests/search-operators.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders } = require('./helpers');

async function seedOperatorNotes(page) {
  await seedRawNotes(page, [
    { id: 'plan-work', title: 'Launch plan', body: 'Alpha milestone.', tags: ['work', 'draft'], folderId: 'f-work' },
    { id: 'plan-daily', title: 'Daily plan', body: 'Alpha checklist.', tags: ['work'], folderId: 'f-daily' },
    { id: 'loose-idea', title: 'Loose idea', body: 'Alpha thought at 10:30 sharp.', tags: ['idea'] },
    { id: 'cafe-menu', title: 'Café menu', body: 'Beta list.', tags: ['café'] },
    { id: 'old-work', title: 'Old work', body: 'Alpha archive.', tags: ['work'], archivedAt: Date.now() - 1000 },
  ]);
  await seedFolders(page, [
    { id: 'f-work', name: 'Work' },
    { id: 'f-daily', name: 'Daily Notes' },
  ]);
}

function rowIds(page) {
  return page.locator('.note-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-id')));
}

test('tag: lists notes carrying that tag, newest first', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('tag:work');
  await expect(page.locator('.note-row')).toHaveCount(2);
  expect(await rowIds(page)).toEqual(['plan-daily', 'plan-work']);
  await expect(page.locator('#search-results-count')).toHaveText('2 results');
  await expect(page.locator('.note-row mark.search-hit')).toHaveCount(0);
});

test('repeated operators require every value', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('tag:work tag:draft');
  expect(await rowIds(page)).toEqual(['plan-work']);
});

test('title: matches part of the title and ranks the remaining words', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('title:plan alpha');
  await expect(page.locator('.note-row')).toHaveCount(2);
  await expect(page.locator('.note-row mark.search-hit').first()).toHaveText('Alpha');
  await page.locator('#search').fill('title:idea');
  expect(await rowIds(page)).toEqual(['loose-idea']);
});

test('folder: reaches a folder other than the open one and notes for unfiled', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#folder-switcher-btn').click();
  await page.locator('.folder-switcher-row[data-folder-id="f-work"] .folder-switcher-option').click();
  await page.locator('#search').fill('folder:daily');
  expect(await rowIds(page)).toEqual(['plan-daily']);
  await page.locator('#search').fill('folder:notes');
  expect(await rowIds(page)).toEqual(['cafe-menu', 'loose-idea', 'plan-daily']);
});

test('operators compose with the tag chip', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('.note-row-tag[data-tag="work"]').first().click();
  await page.locator('#search').fill('folder:work');
  expect(await rowIds(page)).toEqual(['plan-work']);
});

test('operators stay inside the archive view', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#archive-view').click();
  await page.locator('#search').fill('tag:work');
  expect(await rowIds(page)).toEqual(['old-work']);
});

test('unknown prefixes stay literal text', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('10:30');
  expect(await rowIds(page)).toEqual(['loose-idea']);
});

test('a bare operator shows every note in scope', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('tag:');
  await expect(page.locator('#search-results-count')).toHaveText('4 results');
});

test('operator values ignore case and diacritics', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('Tag:CAFE');
  expect(await rowIds(page)).toEqual(['cafe-menu']);
  await page.locator('#search').fill('FOLDER:Daily');
  expect(await rowIds(page)).toEqual(['plan-daily']);
});
```

- [ ] **Step 2: Run** `npm test search-operators.spec.js` — expect FAIL:
  `tag:work` today tokenizes to the words `tag` and `work`, so the tag test
  sees zero or wrong rows, and `tag:` alone returns no results.

- [ ] **Step 3: Add parsing and filtering to `search.js`.** Add typedefs
  after line 9:

```js
  /** @typedef {{ tags: string[], titles: string[], folders: string[] }} QueryFilters */
  /** @typedef {{ text: string, filters: QueryFilters }} ParsedQuery */
  /** @typedef {(note: SearchNote) => string} FolderNameOf */
  /** @typedef {{ kind: 'direct' | 'close', results: SearchResult[] }} RankedNotes */
  /** @typedef {RankedNotes & ParsedQuery} SearchOutcome */
```

Replace the `SearchApi` typedef on line 9 with:

```js
  /** @typedef {{ rankNotes(notes: SearchNote[], query: string): RankedNotes, searchNotes(notes: SearchNote[], query: string, options?: { folderNameOf?: FolderNameOf }): SearchOutcome, parseQuery(query: string): ParsedQuery, normalize(value: unknown): string, matchesLoose(text: string, query: string): boolean }} SearchApi */
```

Insert after `queryInfo` (line 50):

```js
  const OPERATOR_PATTERN = /(^|\s)(tag|title|folder):(\S*)/giu;

  /** @param {QueryFilters} filters @param {string} key */
  function filterBucket(filters, key) {
    const lower = key.toLowerCase();
    if (lower === 'tag') return filters.tags;
    if (lower === 'title') return filters.titles;
    return filters.folders;
  }

  /** @param {string} query @returns {ParsedQuery} */
  function parseQuery(query) {
    /** @type {QueryFilters} */
    const filters = { tags: [], titles: [], folders: [] };
    const text = String(query || '')
      .replace(OPERATOR_PATTERN, (_match, lead, key, value) => {
        const normalized = normalize(value);
        if (normalized) filterBucket(filters, key).push(normalized);
        return lead;
      })
      .replace(/\s+/g, ' ')
      .trim();
    return { text, filters };
  }

  /** @param {SearchNote} note @param {QueryFilters} filters @param {FolderNameOf | undefined} folderNameOf */
  function passesFilters(note, filters, folderNameOf) {
    const tags = (note.tags || []).map(normalize);
    if (!filters.tags.every((value) => tags.includes(value))) return false;
    const title = normalize(note.title);
    if (!filters.titles.every((value) => title.includes(value))) return false;
    const folder = normalize(folderNameOf ? folderNameOf(note) : '');
    return filters.folders.every((value) => folder.includes(value));
  }
```

Replace the tail of `resultExcerpt` (line 159) so the lead excerpt is shared:

```js
  /** @param {string} text */
  function leadExcerpt(text) {
    return text.length > 112 ? text.slice(0, 111).trimEnd() + '…' : text;
  }

  /** @param {SearchNote} note @param {QueryInfo} query */
  function resultExcerpt(note, query) {
    const text = plainBody(note.body || '');
    if (!text) return '';
    const position = matchPosition(text, query);
    return position ? clipAround(text, position.index, position.length) : leadExcerpt(text);
  }
```

Insert before the export (line 211):

```js
  /** @param {SearchNote[]} notes @returns {RankedNotes} */
  function recentResults(notes) {
    const results = notes.map((note) => ({
      note,
      score: 0,
      kind: /** @type {'direct'} */ ('direct'),
      highlightTerms: [],
      excerpt: leadExcerpt(plainBody(note.body || '')),
    }));
    return { kind: 'direct', results: results.sort(compareResults) };
  }

  /** @param {SearchNote[]} notes @param {string} query @param {{ folderNameOf?: FolderNameOf }} [options] @returns {SearchOutcome} */
  function searchNotes(notes, query, options) {
    const parsed = parseQuery(query);
    const folderNameOf = options ? options.folderNameOf : undefined;
    const scoped = notes.filter((note) => passesFilters(note, parsed.filters, folderNameOf));
    const ranked = parsed.text ? rankNotes(scoped, parsed.text) : recentResults(scoped);
    return { ...ranked, ...parsed };
  }
```

Change the export to
`Object.freeze({ rankNotes, searchNotes, parseQuery, normalize, matchesLoose })`.

- [ ] **Step 4: Wire `app.js`.** Replace lines 1350-1356 with:

```js
  function currentSearchResults() {
    const folderNameOf = (note) => folderDisplayName(noteFolderId(note));
    return Search.searchNotes(tagFilteredNotes(), state.search.trim(), { folderNameOf });
  }
  function filteredNotes() {
    return state.search.trim() ? currentSearchResults().results.map((result) => result.note) : tagFilteredNotes();
  }
```

That is a net change of zero lines (7 lines before, 7 after).

- [ ] **Step 5: Run** `npm test search-operators.spec.js` — expect PASS on all
  three browsers. Then `npm test focused-search.spec.js enhanced-search.spec.js`
  — expect PASS unchanged.

- [ ] **Step 6: Run** `npm run check:types && npm run check:structure` —
  expect both green (search.js under 400 lines, app.js at 6203).

- [ ] **Step 7: Commit**

```bash
git add public/js/search.js public/js/app.js tests/search-operators.spec.js
git commit -m "feat(search): tag, title, and folder operators filter before ranking"
```

---

### Task 2: Scope line, live region, empty-state hint, residual highlights

**Files:**
- Modify: `public/js/search-view.js` (typedefs at lines 6-10, `createSummary`,
  `createEmpty`, `createChrome`)
- Modify: `public/js/app.js` (`highlightedChildren` at 685-688,
  `renderSearchMode` at 1388-1405, rendered-body highlight at 2226)
- Test: `tests/search-operators.spec.js` (append)

**Interfaces:**
- Consumes: `searchResults.filters` and `Search.parseQuery(query).text`
  from Task 1.
- Produces: `ChromeOptions.filters` (optional `QueryFilters`) on
  `SearchView.createChrome`; the DOM ids are unchanged
  (`#search-results-scope`, `#search-status`, `.search-empty`) plus one new
  element `p.search-empty-hint` inside the empty state.

- [ ] **Step 1: Append the failing presentation tests** to
  `tests/search-operators.spec.js`:

```js
test('the scope line and live region name the operators', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('folder:daily tag:work');
  await expect(page.locator('#search-results-scope')).toHaveText('Notes · folder daily · tag work');
  await expect(page.locator('#search-status')).toHaveText('1 result in Notes, folder daily, tag work.');
  await page.locator('#search').fill('title:plan');
  await expect(page.locator('#search-results-scope')).toHaveText('Notes · all folders · title plan');
  await expect(page.locator('#search-status')).toHaveText('2 results in Notes across all folders, title plan.');
});

test('the empty state names the operators and the folder scope', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('folder:zzz');
  await expect(page.locator('.search-empty')).toContainText('titles, text, and tags in Notes, folder zzz.');
  await expect(page.locator('.search-empty-hint')).toHaveText('Narrow with tag:name, title:word, or folder:name.');
  await page.locator('#search').fill('tag:zzz');
  await expect(page.locator('.search-empty')).toContainText('in Notes across all folders, tag zzz.');
});

test('operator words never highlight rows or the open note', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('tag:work alpha');
  const rowMarks = page.locator('.note-row mark.search-hit');
  await expect(rowMarks.first()).toHaveText('Alpha');
  expect(await rowMarks.allTextContents()).not.toContain('work');
  await page.locator('.note-row[data-id="plan-work"]').click();
  await expect(page.locator('#note-rendered mark.search-hit')).toHaveText(['Alpha']);
  await expect(page.locator('#note-title-display mark.search-hit')).toHaveCount(0);
});
```

- [ ] **Step 2: Run** `npm test search-operators.spec.js` — expect the three
  new tests to FAIL: the scope line still says `Notes · all folders`, there
  is no `.search-empty-hint`, and `work` is highlighted in tag pills.

- [ ] **Step 3: Render filters in `search-view.js`.** Add after the
  `SearchKind` typedef:

```js
  /** @typedef {{ tags: string[], titles: string[], folders: string[] }} QueryFilters */
```

Replace the `ChromeOptions` typedef with:

```js
  /** @typedef {{ kind: SearchKind, count: number, view: string, query: string, hasTagFilter: boolean, filters?: QueryFilters, onClear: () => void }} ChromeOptions */
```

Insert after `countLabel`:

```js
  /** @type {QueryFilters} */
  const EMPTY_FILTERS = { tags: [], titles: [], folders: [] };

  /** @param {QueryFilters} filters */
  function filterParts(filters) {
    const parts = [];
    if (filters.folders.length) parts.push('folder ' + filters.folders.join(', '));
    if (filters.tags.length) parts.push('tag ' + filters.tags.join(', '));
    if (filters.titles.length) parts.push('title ' + filters.titles.join(', '));
    return parts;
  }

  /** @param {ChromeOptions} options */
  function scopeLabel(options) {
    const filters = options.filters || EMPTY_FILTERS;
    const parts = filterParts(filters);
    if (!filters.folders.length) parts.unshift('all folders');
    return [viewLabel(options.view), ...parts].join(' · ');
  }

  /** @param {ChromeOptions} options */
  function scopeSentence(options) {
    const filters = options.filters || EMPTY_FILTERS;
    const folderScope = filters.folders.length ? '' : ' across all folders';
    return viewLabel(options.view) + folderScope + filterParts(filters).map((part) => ', ' + part).join('');
  }
```

In `createSummary` replace `text: viewLabel(options.view) + ' · all folders'`
with `text: scopeLabel(options)`. In `createEmpty` replace the copy text
with `'Search checks titles, text, and tags in ' + scopeSentence(options) + '.'`
and append a third child to the `empty.append(...)` call:

```js
      element('p', { className: 'sidebar-empty-copy search-empty-hint', text: 'Narrow with tag:name, title:word, or folder:name.' }),
```

In `createChrome` replace the `status` expression with
`countLabel(options.kind, options.count) + ' in ' + scopeSentence(options) + '.'`.

- [ ] **Step 4: Forward filters and highlight residual text in `app.js`.**
  In `renderSearchMode` add `filters: searchResults.filters,` after the
  `hasTagFilter` line (app.js reaches 6204, its ceiling). Change line 687 to

```js
    return SearchView.highlightText(text || '', terms || Search.parseQuery(state.search).text);
```

and line 2226 to

```js
        SearchView.highlightElement(els.rendered, Search.parseQuery(state.search).text);
```

- [ ] **Step 5: Run** `npm test search-operators.spec.js focused-search.spec.js enhanced-search.spec.js`
  — expect PASS on all three browsers; the two older specs prove the
  no-operator strings are unchanged.

- [ ] **Step 6: Run** `npm run check:types && npm run check:structure` —
  expect green; app.js must report at most 6204 lines.

- [ ] **Step 7: Commit**

```bash
git add public/js/search-view.js public/js/app.js tests/search-operators.spec.js
git commit -m "feat(search): scope line, live region, and hint name the operators"
```

---

### Task 3: Documentation, version bump, and release verification

**Files:**
- Modify: `guide.html` (Search bullets at 261-264 and 306-312),
  `README.md:42`, `tests/README.md` (search row), `public/js/version.js:6-7`

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1 and 2.
- Produces: v3.20.0 release commit; no deploy.

- [ ] **Step 1: Guide copy.** In the `#organizing` Search bullet, after
  "<kbd class="kbd">Esc</kbd> to clear search." add:

```html
          Narrow with operators: <code>tag:work</code> matches a whole tag, while
          <code>title:plan</code> and <code>folder:daily</code> match part of a title or folder
          name. Mix them with ordinary words, and repeat one to require every value.
```

In the `#folders` Search bullet, after "even when one folder is open." add:

```html
          Type <code>folder:name</code> to search inside one folder.
```

If `guide.html` styles inline code differently (check for an existing
`<code>` in the file), match that markup instead.

- [ ] **Step 2: README and test map.** Extend the README search feature
  line (line 42) with "narrow with `tag:`, `title:`, and `folder:` operators",
  and add `search-operators.spec.js` to the "Focused ranked search, filters,
  tags, ordering, bulk actions, and mobile navigation" row in `tests/README.md`.

- [ ] **Step 3: Run** `npm test guide.spec.js static-pages.spec.js` — expect
  PASS (no section ids changed).

- [ ] **Step 4: Commit**

```bash
git add guide.html README.md tests/README.md
git commit -m "docs(guide): search operators in the guide, readme, and test map"
```

- [ ] **Step 5: Version bump.** Set `window.SCRATCHPAD_VERSION = '3.20.0'`
  and `window.SCRATCHPAD_BUILD_DATE = '2026-09-01'` in
  `public/js/version.js`. Regenerate `public/og-image.png` only if
  `public/og-image.svg` is newer than it (it is not expected to be).

- [ ] **Step 6: Full verification.** Run, in order, and record the results:

```bash
npm run verify
npm test
bash cloudfront/recompute-csp-hashes.sh
./deploy.sh --dry-run
```

Expected: verify green with coverage at or above 36.2%; the suite green on
three browsers with only the CI-scoped guide popup test skipped locally; the
hash script reports every source `[OK]` with no change; the dry run lists
`public/js/search.js`, `public/js/search-view.js`, `public/js/app.js`,
`public/js/version.js`, and `guide.html` among the uploads.

- [ ] **Step 7: Release commit**

```bash
git add public/js/version.js
git commit -m "chore(release): v3.20.0 search operators"
```

- [ ] **Step 8: Handoff.** Update `tasks/todo.md` with a "Resuming From
  Here" block (done, next, blockers, assumptions) and mark the v3.20 line in
  the release train. Deploy only on an explicit "yes, deploy".
