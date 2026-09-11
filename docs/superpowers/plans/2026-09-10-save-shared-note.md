# Save a Shared Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a share recipient save the decrypted note into their own
Scratchpad, tagged `shared`, through a same-tab `sessionStorage` handoff.

**Architecture:** `public/js/shared-copy.js` (`window.ScratchpadSharedCopy`)
owns the handoff. The viewer calls `stash(note)` and navigates to
`/?action=save-shared`. The app calls `saveStashed()` from
`handleActionParam`, which validates the stash, checks for a duplicate, and
creates the note through app.js helpers passed at init. app.js offsets its new
init lines by turning the action dispatch into a `Map` lookup and tightening
the comment above it.

**Tech Stack:** Vanilla JavaScript with no build step, IndexedDB through
`window.ScratchpadDB`, Playwright across Chromium, Firefox, and WebKit, Biome,
and `tsc` checks over JSDoc.

**Spec:** `docs/superpowers/specs/2026-09-10-save-shared-note-design.md`

## Global Constraints

- `public/js/app.js` stays at most 6204 lines as the ratchet counts. It is 6202 by `wc -l` today, and this plan nets 0.
- The new module has `// @ts-check`, strict JSDoc, under 400 lines, functions under 40 lines, and nesting of 3 or less.
- The module joins `APP_SHELL`, `index.html`, `share.html`, and `jsconfig.json`.
- The viewer never opens IndexedDB. The existing no-IndexedDB test in `tests/share-viewer.spec.js` stays unchanged.
- No inline `<script>` changes in any HTML shell. `bash cloudfront/recompute-csp-hashes.sh` reports no new hash.
- CSS uses `var(--token)` only, with no hex values.
- Tests are top-level `test()` calls under 40 lines. Changed `.js` and `.json` files outside the legacy list pass `bun run check:format`.
- Shipped copy and commit messages follow vinny-voice: no em dashes, en dashes, or double hyphens in prose.
- Commit headers are Conventional, lower-case, at most 72 characters, and end with the `Claude-Session:` trailer. Never use `--no-verify`.
- Run Playwright as `SCRATCHPAD_TEST_PORT=8091 bun run test <files>`.

Exact strings, used verbatim everywhere:

| Name | Value |
| --- | --- |
| Stash key | `scratchpad:pendingSharedNote` |
| Action | `save-shared` |
| Tag | `shared` |
| Button | `Save to my Scratchpad` |
| Hint | `Adds an editable copy to Scratchpad in this browser. It stays after the link expires.` |
| Viewer error | `This browser blocked saving the note. Allow site data for this site, then try again.` |
| Saved toast | `Saved to your Scratchpad.` |
| Duplicate toast, info tone | `This note is already in your Scratchpad.` |
| Refused toast, error tone | `Couldn't save the shared note.` |

---

### Task 1: The app saves a stashed note

**Files:**
- Create: `public/js/shared-copy.js`
- Create: `tests/shared-copy.spec.js`
- Modify: `public/js/app.js` (`handleActionParam` near line 6147, and boot `init` after the `ScratchpadTemplates.init` statement near line 6172)
- Modify: `index.html` (script list near line 995), `public/service-worker.js` (`APP_SHELL`), `jsconfig.json` (`include`)

**Interfaces:**
- Produces: `window.ScratchpadSharedCopy.stash(note: { title?: unknown, body?: unknown, tags?: unknown }): void`, which throws when the browser refuses `sessionStorage`.
- Produces: `window.ScratchpadSharedCopy.init(deps: Deps): void` and `window.ScratchpadSharedCopy.saveStashed(): Promise<void>`.
- Produces for tests: `saveStash(page, value)` and `storedNotes(page)`, local to `tests/shared-copy.spec.js`.

- [ ] **Step 1: Write the failing tests**

Create `tests/shared-copy.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, seedFolders } = require('./helpers');

const STASH_KEY = 'scratchpad:pendingSharedNote';

// Stands in for the share viewer: stash on the current same-origin page, then
// land on the action URL in the same tab, exactly as the viewer does.
async function saveStash(page, value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  await page.evaluate(([key, text]) => sessionStorage.setItem(key, text), [STASH_KEY, raw]);
  await page.goto('/?action=save-shared');
  await expect(page.locator('#app-shell')).toBeVisible();
}

function storedNotes(page) {
  return page.evaluate(() => window.ScratchpadDB.getAll());
}

test('a stashed shared note is saved as a tagged, unfiled copy and opened', async ({ page }) => {
  await gotoApp(page);
  await saveStash(page, { v: 1, title: 'Trip plan', body: '# Day one\n\nPack light.', tags: ['travel', 'Ideas', 'shared'] });
  await expect(page.locator('#toast-region')).toContainText('Saved to your Scratchpad.');
  await expect(page.locator('#note-title-display')).toHaveText('Trip plan');
  expect(new URL(page.url()).search).toBe('');
  expect(await page.evaluate((stashKey) => sessionStorage.getItem(stashKey), STASH_KEY)).toBeNull();
  const copies = (await storedNotes(page)).filter((note) => note.title === 'Trip plan');
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatchObject({
    body: '# Day one\n\nPack light.',
    tags: ['travel', 'ideas', 'shared'],
    folderId: null,
    pinned: false,
    deletedAt: null,
  });
});

test('saving the same shared note twice opens the first copy', async ({ page }) => {
  await gotoApp(page);
  const stash = { v: 1, title: 'Twice', body: 'Same words.', tags: [] };
  await saveStash(page, stash);
  await expect(page.locator('#toast-region')).toContainText('Saved to your Scratchpad.');
  await saveStash(page, stash);
  await expect(page.locator('#toast-region')).toContainText('This note is already in your Scratchpad.');
  await expect(page.locator('#note-title-display')).toHaveText('Twice');
  expect((await storedNotes(page)).filter((note) => note.title === 'Twice')).toHaveLength(1);
});

test('a matching note in Trash does not count as already saved', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'gone', title: 'Gone', body: 'Old words.', deletedAt: Date.now() - 1000 }]);
  await saveStash(page, { v: 1, title: 'Gone', body: 'Old words.', tags: [] });
  await expect(page.locator('#toast-region')).toContainText('Saved to your Scratchpad.');
  const live = (await storedNotes(page)).filter((note) => !note.deletedAt);
  expect(live).toHaveLength(1);
  expect(live[0].id).not.toBe('gone');
});

test('an archived match counts as already saved', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'kept', title: 'Kept', body: 'Filed away.', archivedAt: Date.now() - 1000 }]);
  await saveStash(page, { v: 1, title: 'Kept', body: 'Filed away.', tags: [] });
  await expect(page.locator('#toast-region')).toContainText('This note is already in your Scratchpad.');
  expect(await storedNotes(page)).toHaveLength(1);
});

test('a restored folder view switches to Home so the list shows the copy', async ({ page }) => {
  await seedFolders(page, [{ id: 'f-work', name: 'Work' }]);
  await page.evaluate(() => localStorage.setItem('scratchpad:folderView', 'f-work'));
  await saveStash(page, { v: 1, title: 'Unfiled copy', body: 'Lands at Home.', tags: [] });
  await expect(page.locator('#toast-region')).toContainText('Saved to your Scratchpad.');
  await expect(page.locator('.note-row', { hasText: 'Unfiled copy' })).toBeVisible();
});

test('a first visit saves the copy alongside the starter notes', async ({ page }) => {
  await page.goto('/share.html');
  await saveStash(page, { v: 1, title: 'First contact', body: 'Hello from a friend.', tags: [] });
  await expect(page.locator('#note-title-display')).toHaveText('First contact');
  await expect(page.locator('.note-row', { hasText: 'Welcome to Scratchpad' })).toBeVisible();
});

test('a damaged or oversized stash is refused and creates nothing', async ({ page }) => {
  await gotoApp(page);
  const refused = [
    '{not json',
    JSON.stringify({ v: 2, title: 't', body: 'b', tags: [] }),
    JSON.stringify({ v: 1, title: 'x'.repeat(241), body: 'b', tags: [] }),
    JSON.stringify({ v: 1, title: 't', body: 'b', tags: Array.from({ length: 21 }, (_, i) => 'tag' + i) }),
  ];
  for (const raw of refused) {
    await saveStash(page, raw);
    await expect(page.locator('#toast-region')).toContainText("Couldn't save the shared note.");
    expect(await storedNotes(page)).toHaveLength(0);
  }
});

test('the save action with nothing stashed creates nothing and says nothing', async ({ page }) => {
  await gotoApp(page);
  await page.goto('/?action=save-shared');
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  expect(await storedNotes(page)).toHaveLength(0);
  await expect(page.locator('#toast-region .toast')).toHaveCount(0);
});

test('a hostile shared title renders as text in the app', async ({ page }) => {
  await gotoApp(page);
  await saveStash(page, { v: 1, title: '<img src=x onerror="window.__pwned=true">', body: 'b', tags: [] });
  await expect(page.locator('#note-title-display')).toContainText('<img');
  await expect(page.locator('#note-title-display img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test tests/shared-copy.spec.js --project=chromium`
Expected: FAIL. The toast assertions time out waiting for `Saved to your Scratchpad.` because nothing handles `save-shared`. The no-stash and hostile-title tests may pass or fail; they are guards, not the red driver.

- [ ] **Step 3: Create the module**

Create `public/js/shared-copy.js`:

```js
// @ts-check
/* Save a shared note: the share viewer stashes the decrypted note for one same-tab
   navigation, and the app turns that stash into an ordinary note tagged "shared". */
{
  ('use strict');

  /** @typedef {{ v: 1, title: string, body: string, tags: string[] }} Stash */
  /** @typedef {{ id: string, title: string, body: string }} CopyNote */
  /** @typedef {{ title: number, body: number, tag: number, tags: number }} Limits */
  /**
   * @typedef {{
   *   notes(): CopyNote[],
   *   isTrashed(note: CopyNote): boolean,
   *   normalizeNote(note: object): CopyNote,
   *   normalizeTag(tag: string): string,
   *   putNoteRecord(note: CopyNote): Promise<unknown>,
   *   addNote(note: CopyNote): unknown,
   *   openNote(id: string): Promise<unknown>,
   *   uuid(): string,
   *   now(): number,
   *   toast(message: string, opts?: { tone: string }): void,
   *   limits: Limits,
   * }} Deps
   */

  const STASH_KEY = 'scratchpad:pendingSharedNote';
  const SHARED_TAG = 'shared';
  /** @type {Deps | null} */
  let deps = null;

  /** Viewer side. Throws when the browser refuses session storage. @param {{ title?: unknown, body?: unknown, tags?: unknown }} note */
  function stash(note) {
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ v: 1, title: note.title, body: note.body, tags: note.tags }));
  }

  // Read and delete before any await, so a reload or a second call cannot replay it.
  /** @returns {string | null} */
  function takeStash() {
    const raw = sessionStorage.getItem(STASH_KEY);
    sessionStorage.removeItem(STASH_KEY);
    return raw;
  }

  /** @param {unknown} value @param {number} max @returns {value is string} */
  function isText(value, max) {
    return typeof value === 'string' && value.length <= max;
  }

  // The stash came from a remote share, so it has to meet the JSON import limits.
  /** @param {Deps} api @param {string} raw @returns {Stash | null} */
  function parseStash(api, raw) {
    /** @type {any} */
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!value || value.v !== 1 || !Array.isArray(value.tags)) return null;
    const { limits } = api;
    /** @type {unknown[]} */
    const tags = value.tags;
    if (!isText(value.title, limits.title) || !isText(value.body, limits.body) || tags.length > limits.tags) return null;
    const tagsFit = tags.every((tag) => typeof tag === 'string' && api.normalizeTag(tag).length <= limits.tag);
    return tagsFit ? { v: 1, title: value.title, body: value.body, tags: /** @type {string[]} */ (tags) } : null;
  }

  /** @param {Deps} api @param {Stash} note */
  function findSaved(api, note) {
    return api.notes().find((saved) => !api.isTrashed(saved) && saved.title === note.title && saved.body === note.body);
  }

  /** @param {Deps} api @param {Stash} note */
  async function createCopy(api, note) {
    const t = api.now();
    const copy = api.normalizeNote({
      id: api.uuid(),
      title: note.title,
      body: note.body,
      tags: [...note.tags, SHARED_TAG],
      pinned: false,
      folderId: null,
      createdAt: t,
      updatedAt: t,
      archivedAt: null,
      deletedAt: null,
      lastDraftAt: null,
    });
    await api.putNoteRecord(copy);
    api.addNote(copy);
    await api.openNote(copy.id);
    api.toast('Saved to your Scratchpad.');
  }

  /** App side, called from the save-shared action URL after notes load. */
  async function saveStashed() {
    const raw = takeStash();
    if (raw === null || !deps) return;
    const api = deps;
    const note = parseStash(api, raw);
    if (!note) {
      api.toast("Couldn't save the shared note.", { tone: 'error' });
      return;
    }
    const saved = findSaved(api, note);
    if (saved) {
      await api.openNote(saved.id);
      api.toast('This note is already in your Scratchpad.', { tone: 'info' });
      return;
    }
    await createCopy(api, note);
  }

  /** @param {Deps} api */
  function init(api) {
    deps = api;
  }

  /** @type {Window & typeof globalThis & { ScratchpadSharedCopy?: object }} */
  const root = window;
  root.ScratchpadSharedCopy = Object.freeze({ stash, init, saveStashed });
}
```

- [ ] **Step 4: Register the module**

In `index.html`, after `<script src="/public/js/linked-folder.js"></script>`, add:

```html
  <script src="/public/js/shared-copy.js"></script>
```

In `public/service-worker.js` `APP_SHELL`, after `'/public/js/linked-folder.js',`, add:

```js
    '/public/js/shared-copy.js',
```

In `jsconfig.json` `include`, after `"public/js/search-view.js",`, add:

```json
    "public/js/shared-copy.js",
```

- [ ] **Step 5: Wire app.js with zero net lines**

Replace the comment and the three dispatch lines in `handleActionParam`:

```js
  // OS-level PWA shortcuts land on /?action=<name>. Handle once at boot,
  // then clean the URL so reload/bookmark behaves normally. The service
  // worker matches navigations by pathname, so these URLs work offline.
```

with:

```js
  // PWA shortcuts and the share viewer's save button land on /?action=<name>. Handle once at boot, then clean
  // the URL so reload/bookmark behaves normally. The service worker matches navigations by pathname, so these work offline.
```

and:

```js
    if (action === 'new') await createNote();
    else if (action === 'today') await openTodayNote();
    else if (action === 'capture') openQuickCapture();
```

with:

```js
    const handler = new Map([['new', () => createNote()], ['today', openTodayNote], ['capture', openQuickCapture], ['save-shared', () => window.ScratchpadSharedCopy && window.ScratchpadSharedCopy.saveStashed()]]).get(action);
    if (handler) await handler();
```

In `init`, directly after the `window.ScratchpadTemplates.init({ … });` statement, add:

```js
    if (window.ScratchpadSharedCopy) window.ScratchpadSharedCopy.init({ notes: () => state.notes, isTrashed, normalizeNote, normalizeTag, putNoteRecord, uuid, now, toast,
      addNote: (note) => state.notes.push(note), openNote: (id) => { if (state.folderViewId) setFolderView(null, false); return openNoteFromCommand(id); }, limits: { title: NOTE_TITLE_MAX, body: NOTE_BODY_MAX, tag: NOTE_TAG_MAX, tags: NOTE_TAGS_MAX } });
```

Line math: the comment loses 1 line, the dispatch loses 1, and init gains 2.

Run: `wc -l < public/js/app.js`
Expected: `6202`

- [ ] **Step 6: Run the tests and the checks**

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test tests/shared-copy.spec.js --project=chromium`
Expected: 9 passed.

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test tests/daily-note.spec.js -g "action URLs" --project=chromium`
Expected: 3 passed. This is the regression net for the `Map` dispatch.

Run: `./node_modules/.bin/biome format --write public/js/shared-copy.js tests/shared-copy.spec.js jsconfig.json && bun run check:format && bun run check:types && bun run check:structure && bun run check:shell`
Expected: all pass, and the structure ratchet still reports 102 long and 11 deeply nested legacy functions.

- [ ] **Step 7: Run the new spec on all three browsers**

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test tests/shared-copy.spec.js tests/daily-note.spec.js`
Expected: every test passes on Chromium, Firefox, and WebKit.

- [ ] **Step 8: Commit**

```bash
git add public/js/shared-copy.js tests/shared-copy.spec.js public/js/app.js index.html public/service-worker.js jsconfig.json
git commit -F - <<'EOF'
feat(share): save a stashed shared note into the app

The app reads a one-time sessionStorage stash on /?action=save-shared,
checks it against the import limits, and opens an existing identical
note instead of saving a duplicate. A new copy is unfiled, tagged
shared, and written through putNoteRecord.

Claude-Session: https://claude.ai/code/session_01RGRkBGiTTnrxmgThaUj2Da
EOF
```

---

### Task 2: The share viewer's save button

**Files:**
- Modify: `tests/helpers.js` (gains `makeShare` and `stubShare`), `tests/share-viewer.spec.js:13-33` (imports them instead)
- Modify: `share.html` (action row after `#share-tags`; script tag before `share.js`)
- Modify: `public/js/share.js` (header comment, `els`, `bindSave`, `main`)
- Modify: `public/css/app.css` (after the `.share-tag` rule near line 3602)
- Test: `tests/shared-copy.spec.js`, `tests/network-isolation.spec.js`

**Interfaces:**
- Consumes: `window.ScratchpadSharedCopy.stash(note)` from Task 1.
- Produces: `#share-save` (button), `#share-save-error` (hidden alert), and `makeShare(page, payload)` returning `{ envelope, key }` plus `stubShare(page, envelope, { expiresAt?, status? })` from `tests/helpers.js`.

- [ ] **Step 1: Move the share fixtures into helpers**

Cut `makeShare` and `stubShare` from `tests/share-viewer.spec.js` and paste them into `tests/helpers.js` above `module.exports`, unchanged:

```js
async function makeShare(page, payload) {
  await page.goto('/share.html');
  await page.waitForFunction(() => !!window.ScratchpadCrypto);
  return page.evaluate(async (p) => {
    const C = window.ScratchpadCrypto;
    const key = await C.generateShareKey();
    return { envelope: await C.encryptShare(p, key), key: await C.exportShareKey(key) };
  }, payload);
}

async function stubShare(page, envelope, options = {}) {
  const { expiresAt = Date.now() + 86400000, status = 200 } = options;
  await page.route('**/api/share/*', (routeCall) =>
    routeCall.fulfill({
      status,
      contentType: 'application/json',
      body: status === 200 ? JSON.stringify({ ...envelope, expiresAt }) : JSON.stringify({ error: 'nope' }),
    }),
  );
}
```

Add `makeShare,` and `stubShare,` to `module.exports`. In `tests/share-viewer.spec.js`, add after the `@playwright/test` require:

```js
const { makeShare, stubShare } = require('./helpers');
```

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test tests/share-viewer.spec.js --project=chromium`
Expected: all pass, unchanged.

- [ ] **Step 2: Write the failing viewer tests**

In `tests/shared-copy.spec.js`, change the helpers require to:

```js
const { gotoApp, seedRawNotes, seedFolders, makeShare, stubShare } = require('./helpers');
```

Append:

```js
test('saving from the share viewer opens the copy in the app', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
  const note = { v: 1, title: 'From a friend', body: 'Read this.', tags: ['ideas'], updatedAt: 1 };
  const { envelope, key } = await makeShare(page, note);
  await stubShare(page, envelope);
  await page.goto('/share.html?id=AbCdEf123456#k=' + key);
  await page.locator('#share-save').click();
  await expect(page.locator('#note-title-display')).toHaveText('From a friend');
  await expect(page.locator('#toast-region')).toContainText('Saved to your Scratchpad.');
  expect(new URL(page.url()).search).toBe('');
  const copy = (await storedNotes(page)).find((stored) => stored.title === 'From a friend');
  expect(copy).toMatchObject({ body: 'Read this.', tags: ['ideas', 'shared'], folderId: null });
  expect(await page.evaluate((stashKey) => sessionStorage.getItem(stashKey), STASH_KEY)).toBeNull();
});

test('the save action exists but stays hidden when the share has expired', async ({ page }) => {
  await stubShare(page, null, { status: 410 });
  await page.goto('/share.html?id=AbCdEf123456#k=' + 'A'.repeat(43));
  await expect(page.locator('#share-expired')).toBeVisible();
  await expect(page.locator('#share-save')).toHaveCount(1);
  await expect(page.locator('#share-save')).toBeHidden();
});

test('a blocked stash write shows the error and stays on the share', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage is blocked', 'SecurityError');
    };
  });
  const { envelope, key } = await makeShare(page, { v: 1, title: 'Stuck', body: 'b', tags: [], updatedAt: 1 });
  await stubShare(page, envelope);
  await page.goto('/share.html?id=AbCdEf123456#k=' + key);
  await page.locator('#share-save').click();
  await expect(page.locator('#share-save-error')).toHaveText(
    'This browser blocked saving the note. Allow site data for this site, then try again.',
  );
  expect(new URL(page.url()).pathname).toBe('/share.html');
});
```

In `tests/network-isolation.spec.js`, change the helpers require to:

```js
const {
  gotoApp,
  createAndSaveNote,
  importJson,
  openBackupMenu,
  openOverflowMenu,
  makeShare,
  stubShare,
} = require('./helpers');
```

Inside `test.describe('with the share API stubbed', …)`, after the plaintext test, add:

```js
    test('saving a shared note adds no API request and carries no plaintext or key', async ({ page, baseURL }) => {
      await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
      const secret = 'CANARY-SHARED-4721';
      const { envelope, key } = await makeShare(page, { v: 1, title: 'Canary share', body: secret, tags: [], updatedAt: 1 });
      await stubShare(page, envelope);
      const seen = [];
      page.on('request', (req) => {
        if (/^(data|blob):/.test(req.url())) return;
        seen.push({ url: new URL(req.url()), method: req.method(), text: req.url() + ' ' + (req.postData() || '') });
      });

      await page.goto('/share.html?id=AbCdEf123456#k=' + key);
      await page.locator('#share-save').click();
      await expect(page.locator('#note-title-display')).toHaveText('Canary share');

      const allowedHost = new URL(baseURL || 'http://127.0.0.1:8080').host;
      const apiCalls = seen.filter((r) => r.url.pathname.startsWith('/api/')).map((r) => `${r.method} ${r.url.pathname}`);
      expect(apiCalls).toEqual(['GET /api/share/AbCdEf123456']);
      for (const r of seen) {
        expect(r.url.host).toBe(allowedHost);
        expect(r.text).not.toContain(secret);
        expect(r.text).not.toContain(key);
      }
    });
```

- [ ] **Step 3: Run them and watch them fail**

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test tests/shared-copy.spec.js tests/network-isolation.spec.js --project=chromium`
Expected: FAIL. The three viewer tests and the isolation test time out or fail on `#share-save` because the button does not exist yet.

- [ ] **Step 4: Add the action row and script to share.html**

After `<ul class="share-tags" id="share-tags"></ul>`, add:

```html
      <div class="share-save">
        <button class="btn btn-primary btn-sm" id="share-save" type="button">Save to my Scratchpad</button>
        <p class="share-save-hint">Adds an editable copy to Scratchpad in this browser. It stays after the link expires.</p>
        <p class="share-link-error" id="share-save-error" role="alert" hidden>This browser blocked saving the note. Allow site data for this site, then try again.</p>
      </div>
```

Before `<script src="/public/js/share.js"></script>`, add:

```html
  <script src="/public/js/shared-copy.js"></script>
```

- [ ] **Step 5: Bind the button in share.js**

Replace the header comment's second paragraph:

```js
   This page touches no storage: no IndexedDB, no note state, no writes. It is
   also the only surface in the product that renders markdown originating
   outside the user's own browser, so all rendering goes through
   Markdown.renderMarkdownInto and every other field is set with textContent. */
```

with:

```js
   This page opens no IndexedDB and holds no note state. Its one write is a
   sessionStorage stash, made only when the reader clicks Save to my Scratchpad.
   It is also the only surface in the product that renders markdown originating
   outside the user's own browser, so all rendering goes through
   Markdown.renderMarkdownInto and every other field is set with textContent. */
```

Add to `els`, after `offline`:

```js
    save: document.getElementById('share-save'),
    saveError: document.getElementById('share-save-error'),
```

Add after `renderExpiry`:

```js
  // The app creates the note, not this page: the app's save path writes the
  // linked folder, tells other tabs, and seeds a first visit.
  function bindSave(note) {
    els.save.addEventListener('click', () => {
      try {
        ScratchpadSharedCopy.stash(note);
      } catch {
        els.saveError.hidden = false;
        return;
      }
      location.assign('/?action=save-shared');
    });
  }
```

In `main`, directly before `show('doc');`, add:

```js
    bindSave(note);
```

- [ ] **Step 6: Style the row with tokens**

In `public/css/app.css`, after the `.share-tag { … }` rule, add:

```css
.share-save {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin: 0 0 20px;
}

.share-save-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.share-save .share-link-error {
  flex-basis: 100%;
  margin: 0;
}
```

- [ ] **Step 7: Run the tests and the checks**

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test tests/shared-copy.spec.js tests/network-isolation.spec.js tests/share-viewer.spec.js --project=chromium`
Expected: all pass, including the unchanged no-IndexedDB viewer test.

Run: `./node_modules/.bin/biome format --write public/js/share.js tests/helpers.js tests/share-viewer.spec.js tests/shared-copy.spec.js tests/network-isolation.spec.js && bun run check:format && bun run check:lint && bun run check:structure && bash cloudfront/recompute-csp-hashes.sh`
Expected: all pass, and the hash script reports the three existing hashes with nothing new.

- [ ] **Step 8: Run all three browsers**

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test tests/shared-copy.spec.js tests/network-isolation.spec.js tests/share-viewer.spec.js`
Expected: every test passes on Chromium, Firefox, and WebKit.

- [ ] **Step 9: Commit**

```bash
git add share.html public/js/share.js public/css/app.css tests/helpers.js tests/share-viewer.spec.js tests/shared-copy.spec.js tests/network-isolation.spec.js
git commit -F - <<'EOF'
feat(share): add save to my scratchpad on the share viewer

The viewer stashes the decrypted note in sessionStorage and opens
/?action=save-shared in the same tab. It still opens no IndexedDB. The
isolation suite now proves saving adds no API request and that no
request carries the note text or the key.

Claude-Session: https://claude.ai/code/session_01RGRkBGiTTnrxmgThaUj2Da
EOF
```

---

### Task 3: Copy and records

**Files:**
- Modify: `guide.html` (end of `#sharing`, before `<h2 id="privacy-controls">`)
- Modify: `privacy.html` (after the "Shared copies are frozen" paragraph)
- Modify: `PRODUCT.md:110-113` (Sharing bullet)
- Modify: `docs/superpowers/specs/2026-08-13-note-sharing-design.md:36`
- Modify: `tests/README.md` (sharing row)

**Interfaces:**
- Consumes: the button label and `shared` tag from Tasks 1 and 2.

- [ ] **Step 1: Guide**

In `guide.html`, after the paragraph ending "you'd have to wait out the expiry you chose.", add:

```html
      <p>
        When someone sends you a share link, <strong>Save to my Scratchpad</strong> copies the note
        into Scratchpad in the browser you opened it in. The copy opens right away with a
        <code>shared</code> tag. It is yours to edit, and it stays after the link expires. Saving the
        same note again opens the copy you already have.
      </p>
      <p>
        On iPhone and iPad, a Scratchpad added to the Home Screen keeps its notes apart from Safari. A
        note saved from Safari stays in Safari's Scratchpad.
      </p>
```

- [ ] **Step 2: Privacy**

In `privacy.html`, after the paragraph that begins "Shared copies are frozen.", add:

```html
      <p>
        When someone shares a note with you, <strong>Save to my Scratchpad</strong> copies it into this
        browser's storage, the same place your own notes live. Saving uploads nothing.
      </p>
```

- [ ] **Step 3: Product record, old spec, and test index**

In `PRODUCT.md`, append to the Sharing bullet after "and they can be revoked sooner.":

```markdown
  A recipient can save a copy into Scratchpad in their own browser. The copy
  is tagged `shared`, and saving uploads nothing.
```

In `docs/superpowers/specs/2026-08-13-note-sharing-design.md`, change line 36 to:

```markdown
- No "Save a copy to my Scratchpad" button on the viewer. The viewer is inert.
  (Superseded on 2026-09-10 by `2026-09-10-save-shared-note-design.md`.)
```

In `tests/README.md`, change the sharing row's area to end "plus sharing and saving a shared note", and add `` `shared-copy.spec.js` `` to its spec list.

- [ ] **Step 4: Verify the copy**

Run: `git diff -U0 guide.html privacy.html PRODUCT.md tests/README.md docs/superpowers/specs/2026-08-13-note-sharing-design.md | grep '^+' | grep -nE '—|–' ; echo "dash hits above, expect none"`
Expected: no hits.

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test tests/guide.spec.js tests/static-pages.spec.js --project=chromium && bash cloudfront/recompute-csp-hashes.sh`
Expected: all pass, no new hash.

- [ ] **Step 5: Commit**

```bash
git add guide.html privacy.html PRODUCT.md tests/README.md docs/superpowers/specs/2026-08-13-note-sharing-design.md
git commit -F - <<'EOF'
docs(share): explain saving a shared note

The guide and privacy page describe the save button, the shared tag,
and that saving uploads nothing. The sharing spec's inert-viewer
non-goal now points at the design that replaced it.

Claude-Session: https://claude.ai/code/session_01RGRkBGiTTnrxmgThaUj2Da
EOF
```

---

### Task 4: Gates, visual check, and handoff

**Files:**
- Modify: `tasks/todo.md` (new section with Resuming From Here)
- Modify: `tasks/lessons.md` (only if the build taught something new)

- [ ] **Step 1: Quality gate**

Run: `bun run verify`
Expected: format, lint, types, structure, shell, seed, Lambda, coverage (at or above 36.2%), and audit all pass.

- [ ] **Step 2: Full suite**

Run: `SCRATCHPAD_TEST_PORT=8091 bun run test`
Expected: all pass across three browsers. Read the whole failure list if anything fails; never truncate it.

- [ ] **Step 3: Visual check**

Create the throwaway script `.verify/share-save-shots.mjs`. `.verify/` is gitignored, and the script is deleted after this step.

```js
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:8091';
const payload = {
  v: 1,
  title: 'Weekend plan',
  body: '## Saturday\n\nFarmers market, then the long trail loop.',
  tags: ['plans', 'outdoors'],
  updatedAt: 1,
};

for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    // The dev server is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const browser = await chromium.launch();
for (const colorScheme of ['light', 'dark']) {
  for (const width of [1280, 400]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
    await page.goto(base + '/share.html');
    const { envelope, key } = await page.evaluate(async (note) => {
      const C = window.ScratchpadCrypto;
      const shareKey = await C.generateShareKey();
      return { envelope: await C.encryptShare(note, shareKey), key: await C.exportShareKey(shareKey) };
    }, payload);
    const body = JSON.stringify({ ...envelope, expiresAt: Date.now() + 7 * 86400000 });
    await page.route('**/api/share/*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body }));
    await page.goto(`${base}/share.html?id=AbCdEf123456#k=${key}`);
    await page.locator('#share-save').waitFor();
    await page.screenshot({ path: `.verify/share-save-${colorScheme}-${width}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
```

Run: `node scripts/dev-server.mjs 8091 & SERVER=$!; node .verify/share-save-shots.mjs; kill $SERVER; rm .verify/share-save-shots.mjs`
Expected: four PNGs in `.verify/`. Open each one. Confirm the button, hint, and body spacing read cleanly in both themes, and that the hint wraps under the button at 400 pixels.

- [ ] **Step 4: Record and commit**

Add a section to the top of `tasks/todo.md` with the plan's checkboxes ticked and a "Resuming From Here" block: done, next (release is Vinny's call), blockers, and assumptions.

```bash
git add tasks/todo.md tasks/lessons.md
git commit -F - <<'EOF'
docs(tasks): record the save shared note build

Claude-Session: https://claude.ai/code/session_01RGRkBGiTTnrxmgThaUj2Da
EOF
```
