# Unlinked Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship unlinked mentions
(`docs/superpowers/specs/2026-09-01-unlinked-mentions-design.md`) as v3.22.0.

**Architecture:** `public/js/mentions.js` (`window.ScratchpadMentions`) owns
detection (`findMentions`), the panel DOM (`render`), and the link action.
app.js passes its helpers once through `init` and calls `render(note)` next
to `renderBacklinks`. Markup is a second `<details>` in `index.html`; CSS
reuses the backlinks tokens.

**Tech Stack:** Vanilla browser JavaScript, Playwright on three browsers,
Biome, `tsc` strict on the module.

**Spec:** `docs/superpowers/specs/2026-09-01-unlinked-mentions-design.md`

## Global Constraints

- Zero network; no inline `<script>` edits; tokens-only CSS appended near
  the backlinks rules in `public/css/app.css`.
- `mentions.js` carries `// @ts-check`, joins `jsconfig.json` include,
  `APP_SHELL`, and the `index.html` script order; under 400 lines,
  functions under 40, nesting at most 3.
- app.js is at 6203 as the ratchet counts (ceiling 6204). This plan adds
  five lines and removes six.
- Tests are top-level `test(...)` calls under 40 lines.
- Conventional Commits with the `Claude-Session:` trailer; lower-case
  subject under 72 characters.

---

### Task 1: Detection and the panel

**Files:**
- Create: `public/js/mentions.js`
- Modify: `index.html` (markup after `#backlinks-section`, script tag),
  `public/service-worker.js`, `jsconfig.json`, `public/js/app.js`
  (`linkingNotesTo`, `renderBacklinks`, boot init, `renderEditor` call),
  `public/css/app.css` (after the `.backlinks-list .backlink-btn:hover` rule)
- Test: `tests/unlinked-mentions.spec.js` (create)

**Interfaces:**
- Consumes: `window.ScratchpadMarkdown.scanOutsideFences(src, cb)`;
  app.js `deriveTitle`, `isTrashed`, `isArchived`, `openNoteFromCommand`,
  `mutateNoteBody`, `renderEditor`, `toast`, `DB.getAllDrafts`, `state`.
- Produces: `ScratchpadMentions.findMentions(notes, title, excludeId)`
  returning `[{ note, excerpt, original }]`; `init(deps)`; `render(note)`.

- [ ] **Step 1: Write the failing tests** in `tests/unlinked-mentions.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

async function seedHub(page, extra) {
  await seedRawNotes(page, [
    { id: 'hub', title: 'Hub', body: 'hub body' },
    { id: 'alpha', title: 'Alpha', body: 'Talk to hub about it.' },
    { id: 'beta', title: 'Beta', body: 'see [[Hub]] linked' },
    { id: 'gamma', title: 'Gamma', body: 'inline `Hub` and\n```\nHub\n```' },
    { id: 'delta', title: 'Delta', body: 'Hubcap is different' },
    { id: 'trashed', title: 'Trashed', body: 'Hub here', deletedAt: Date.now() },
    ...(extra || []),
  ]);
  await page.locator('.note-row[data-id="hub"]').click();
}

test('lists plain-text mentions of the open note title with an excerpt', async ({ page }) => {
  await seedHub(page);
  const section = page.locator('#mentions-section');
  await expect(section).toBeVisible();
  await expect(page.locator('#mentions-summary')).toHaveText('Mentioned in 1 note');
  await section.locator('summary').click();
  await expect(section.locator('.mention-row')).toHaveCount(1);
  await expect(section.locator('.mention-row .backlink-btn')).toHaveText('Alpha');
  await expect(section.locator('.mention-excerpt')).toContainText('Talk to hub about it.');
  await expect(page.locator('#backlinks-summary')).toHaveText('Linked from 1 note');
});

test('linking a mention keeps the original casing as an alias and moves it to backlinks', async ({ page }) => {
  await seedHub(page);
  await page.locator('#mentions-section summary').click();
  await page.locator('.mention-link-btn').click();
  await expect(page.locator('#mentions-section')).toBeHidden();
  await expect(page.locator('#backlinks-summary')).toHaveText('Linked from 2 notes');
  const body = await page.evaluate(async () => (await window.ScratchpadDB.get('alpha')).body);
  expect(body).toBe('Talk to [[Hub|hub]] about it.');
});

test('short and untitled titles never produce mentions', async ({ page }) => {
  await seedRawNotes(page, [
    { id: 'ab', title: 'AB', body: 'two letters' },
    { id: 'mentions-ab', title: 'Other', body: 'AB is short' },
    { id: 'untitled', title: '', body: '' },
    { id: 'mentions-untitled', title: 'Third', body: 'An Untitled note is here' },
  ]);
  await page.locator('.note-row[data-id="ab"]').click();
  await expect(page.locator('#mentions-section')).toBeHidden();
  await page.locator('.note-row[data-id="untitled"]').click();
  await expect(page.locator('#mentions-section')).toBeHidden();
});

test('a mentioning note with an unsaved draft shows a disabled link', async ({ page }) => {
  await seedHub(page);
  await page.evaluate(() =>
    window.ScratchpadDB.putDraft({ noteId: 'alpha', title: 'Alpha', body: 'Talk to hub later.', updatedAt: Date.now() }),
  );
  await page.locator('.note-row[data-id="beta"]').click();
  await page.locator('.note-row[data-id="hub"]').click();
  await page.locator('#mentions-section summary').click();
  const link = page.locator('.mention-link-btn');
  await expect(link).toBeDisabled();
  await expect(link).toHaveText('Unsaved changes');
});

test('the section is hidden when nothing mentions the note', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'lonely', title: 'Lonely', body: 'no mentions' }]);
  await page.locator('.note-row').first().click();
  await expect(page.locator('#mentions-section')).toBeHidden();
});
```

- [ ] **Step 2: Run** `npx playwright test tests/unlinked-mentions.spec.js --reporter=line`
  — expect FAIL: no `#mentions-section` exists.

- [ ] **Step 3: Markup and CSS.** In `index.html` after the backlinks
  `</details>` add:

```html
          <details id="mentions-section" class="backlinks" hidden>
            <summary id="mentions-summary" class="backlinks-summary">Mentioned in 0 notes</summary>
            <ul id="mentions-list" class="backlinks-list mentions-list"></ul>
          </details>
```

Add `<script src="/public/js/mentions.js"></script>` after `paste.js`, the
`APP_SHELL` entry after `paste.js`, and the jsconfig include entry. Append
to `app.css` after `.backlinks-list .backlink-btn:hover`:

```css
.mentions-list {
  flex-direction: column;
  gap: 8px;
}
.mention-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.mention-excerpt {
  flex: 1 1 200px;
  color: var(--text-muted);
  font-size: 13.5px;
}
.mention-link-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--control-fill);
  color: var(--accent-text);
  padding: 3px 11px;
  font-size: 13.5px;
  cursor: pointer;
}
.mention-link-btn:hover:not(:disabled) {
  border-color: var(--accent);
}
.mention-link-btn:disabled {
  color: var(--text-muted);
  cursor: default;
}
```

- [ ] **Step 4: Create `public/js/mentions.js`:**

```js
// @ts-check
/* Unlinked mentions: plain-text occurrences of the open note's title in other notes. */
{
  ('use strict');

  /** @typedef {{ id: string, title?: string, body?: string, updatedAt?: number, archivedAt?: number | null, deletedAt?: number | null }} MentionNote */
  /** @typedef {{ note: MentionNote, excerpt: string, original: string }} Mention */
  /** @typedef {{ notes(): MentionNote[], editing(): boolean, deriveTitle(note: MentionNote): string, isTrashed(note: MentionNote): boolean, isArchived(note: MentionNote): boolean, openNote(id: string): void, mutateNoteBody(id: string, transform: (body: string) => string): Promise<unknown>, getDrafts(): Promise<Array<{ noteId: string }>>, rerender(): void, toast(message: string): void }} Deps */

  const MIN_TITLE = 3;
  const MAX_ROWS = 50;
  /** @type {Deps | null} */
  let deps = null;
  let renderToken = 0;

  /** @type {Window & typeof globalThis & { ScratchpadMarkdown?: { scanOutsideFences(src: string, cb: (line: string, offset: number) => void): void }, ScratchpadMentions?: object }} */
  const root = window;

  /** @param {string} text */
  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** @param {string} line */
  function maskLine(line) {
    return line.replace(/\[\[[^\]\n]*\]\]|`[^`\n]*`/g, (match) => ' '.repeat(match.length));
  }

  /** @param {string} title */
  function eligible(title) {
    const clean = (title || '').trim();
    return clean.length >= MIN_TITLE && clean !== 'Untitled note';
  }

  /** @param {string} body @param {string} title @returns {{ line: string, index: number, original: string } | null} */
  function firstMention(body, title) {
    const scan = root.ScratchpadMarkdown && root.ScratchpadMarkdown.scanOutsideFences;
    if (!scan || !eligible(title)) return null;
    const pattern = new RegExp('(^|[^\\p{L}\\p{N}])(' + escapeRegExp(title.trim()) + ')(?![\\p{L}\\p{N}])', 'iu');
    /** @type {{ line: string, index: number, original: string } | null} */
    let found = null;
    scan(body || '', (line) => {
      if (found) return;
      const match = pattern.exec(maskLine(line));
      if (match) found = { line, index: match.index + match[1].length, original: match[2] };
    });
    return found;
  }

  /** @param {string} line @param {number} index @param {number} length */
  function excerptAround(line, index, length) {
    const start = Math.max(0, index - 40);
    const end = Math.min(line.length, index + length + 60);
    return (start > 0 ? '…' : '') + line.slice(start, end).trim() + (end < line.length ? '…' : '');
  }

  /** @param {MentionNote} note */
  function noteTime(note) {
    return note.deletedAt || note.archivedAt || note.updatedAt || 0;
  }

  /** @param {MentionNote[]} notes @param {string} title @param {string} excludeId @returns {Mention[]} */
  function findMentions(notes, title, excludeId) {
    /** @type {Mention[]} */
    const mentions = [];
    for (const note of notes) {
      if (note.id === excludeId || note.deletedAt) continue;
      const hit = firstMention(note.body || '', title);
      if (hit) mentions.push({ note, excerpt: excerptAround(hit.line, hit.index, hit.original.length), original: hit.original });
    }
    return mentions.sort((left, right) => noteTime(right.note) - noteTime(left.note)).slice(0, MAX_ROWS);
  }

  /** @param {string} body @param {string} title */
  function linkFirstMention(body, title) {
    const hit = firstMention(body, title);
    if (!hit) return body;
    const link = hit.original === title.trim() ? '[[' + title.trim() + ']]' : '[[' + title.trim() + '|' + hit.original + ']]';
    const target = hit.line.slice(0, hit.index) + link + hit.line.slice(hit.index + hit.original.length);
    return body.replace(hit.line, target);
  }

  /** @param {string} tag @param {{ className?: string, text?: string, disabled?: boolean, title?: string, onClick?: () => void }} options */
  function element(tag, options) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.title) node.setAttribute('title', options.title);
    if (node instanceof HTMLButtonElement) {
      node.type = 'button';
      node.disabled = !!options.disabled;
    }
    if (options.onClick) node.addEventListener('click', options.onClick);
    return node;
  }

  /** @param {Mention} mention @param {string} title @param {boolean} hasDraft @param {Deps} api */
  function row(mention, title, hasDraft, api) {
    const li = element('li', { className: 'mention-row' });
    const label = api.deriveTitle(mention.note) + (api.isArchived(mention.note) ? ' · Archived' : '');
    li.append(
      element('button', { className: 'backlink-btn', text: label, onClick: () => api.openNote(mention.note.id) }),
      element('span', { className: 'mention-excerpt', text: mention.excerpt }),
      element('button', {
        className: 'mention-link-btn',
        text: hasDraft ? 'Unsaved changes' : 'Link',
        disabled: hasDraft,
        title: hasDraft ? 'This note has unsaved changes; save or discard them first.' : 'Turn this mention into a link',
        onClick: () => linkMention(mention, title, api),
      }),
    );
    return li;
  }

  /** @param {Mention} mention @param {string} title @param {Deps} api */
  async function linkMention(mention, title, api) {
    const result = await api.mutateNoteBody(mention.note.id, (body) => linkFirstMention(body, title));
    if (!result) return;
    api.toast('Linked in ' + api.deriveTitle(mention.note));
    api.rerender();
  }

  /** @param {Deps} api */
  function init(api) {
    deps = api;
  }

  /** @param {MentionNote | null} note */
  async function render(note) {
    const section = document.getElementById('mentions-section');
    const summary = document.getElementById('mentions-summary');
    const list = document.getElementById('mentions-list');
    if (!deps || !section || !summary || !list) return;
    const token = (renderToken += 1);
    const show = !!note && !deps.isTrashed(note) && !deps.editing();
    const title = show && note ? deps.deriveTitle(note) : '';
    const mentions = show && note ? findMentions(deps.notes(), title, note.id) : [];
    section.hidden = !mentions.length;
    if (!mentions.length) {
      list.replaceChildren();
      return;
    }
    const drafts = new Set((await deps.getDrafts()).map((draft) => draft.noteId));
    if (token !== renderToken) return;
    summary.textContent = 'Mentioned in ' + mentions.length + ' note' + (mentions.length === 1 ? '' : 's');
    const api = deps;
    list.replaceChildren(...mentions.map((mention) => row(mention, title, drafts.has(mention.note.id), api)));
  }

  root.ScratchpadMentions = Object.freeze({ findMentions, linkFirstMention, init, render });
}
```

- [ ] **Step 5: Wire app.js.** Replace the body of `linkingNotesTo`'s filter
  so the `.some` call sits on one line, and collapse `renderBacklinks`:

```js
  function renderBacklinks(note) {
    const show = note && !isTrashed(note) && !state.editing;
    const sources = show ? linkingNotesTo(deriveTitle(note), note.id) : [];
    els.backlinksSection.hidden = !sources.length;
    els.backlinksSummary.textContent = 'Linked from ' + sources.length + ' note' + (sources.length === 1 ? '' : 's');
    els.backlinksList.replaceChildren(...sources.map((source) => el('li', {
      children: [el('button', {
        class: 'backlink-btn',
        text: deriveTitle(source) + (isArchived(source) ? ' · Archived' : ''),
        attrs: { type: 'button' },
        on: { click: () => openNoteFromCommand(source.id) },
      })],
    })));
  }
```

After `renderBacklinks(note);` in `renderEditor` add
`if (window.ScratchpadMentions) window.ScratchpadMentions.render(note);`.
After the `ScratchpadPaste` bind line at boot add:

```js
    if (window.ScratchpadMentions) window.ScratchpadMentions.init({
      notes: () => state.notes, editing: () => state.editing, deriveTitle, isTrashed, isArchived,
      openNote: openNoteFromCommand, mutateNoteBody, getDrafts: () => DB.getAllDrafts(), rerender: renderEditor, toast,
    });
```

- [ ] **Step 6: Run** the spec and `tests/wikilinks.spec.js` on all browsers
  — expect PASS; then `npm run check:types && npm run check:structure && npm run check:shell`
  (app.js at or below 6203).

- [ ] **Step 7: Commit**

```bash
git add public/js/mentions.js public/js/app.js index.html public/css/app.css public/service-worker.js jsconfig.json tests/unlinked-mentions.spec.js
git commit -m "feat(links): unlinked mentions panel with one-click linking"
```

---

### Task 2: Docs, version, and release

- [ ] **Step 1:** Add to the `#linking` list in `guide.html`:

```html
        <li>
          <strong>Unlinked mentions.</strong> Below the backlinks, Scratchpad lists notes that
          mention this note's title in plain text without linking it. Press <em>Link</em> on a
          row to turn that mention into a <code>[[link]]</code>, keeping the sentence as written.
        </li>
```

Extend the README linking bullet with "and lists unlinked mentions you can
link with one click", and add `unlinked-mentions.spec.js` to the wikilinks
row in `tests/README.md`.

- [ ] **Step 2:** Run guide and static specs; commit
  `docs(guide): unlinked mentions`.
- [ ] **Step 3:** Bump to 3.22.0; run `npm run verify`, `npm test`, the CSP
  hash script, and the deploy dry run; commit
  `chore(release): v3.22.0 unlinked mentions`; update `tasks/todo.md`.
