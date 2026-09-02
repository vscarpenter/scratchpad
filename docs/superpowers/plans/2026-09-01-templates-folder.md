# Templates Folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Templates folder convention
(`docs/superpowers/specs/2026-09-01-templates-folder-design.md`) as v3.25.0.

**Architecture:** `public/js/templates.js` (`window.ScratchpadTemplates`)
finds the folder, lists palette commands, and creates notes through app.js
helpers passed at init. app.js concatenates `ScratchpadTemplates.commands()`
into `commandDefinitions()` and offsets the added lines by collapsing the
note pseudo-command's nested ternary.

**Spec:** `docs/superpowers/specs/2026-09-01-templates-folder-design.md`

## Global Constraints

- app.js at most 6204 as the ratchet counts (6200 today; this plan nets +2).
- Module strict-typed, under 400 lines; joins `APP_SHELL`, `index.html`, `jsconfig.json`.
- Tests top-level, under 40 lines each.

---

### Task 1: Module, palette commands, and creation

**Files:**
- Create: `public/js/templates.js`
- Modify: `public/js/app.js` (`commandDefinitions`, boot init), `index.html`,
  `public/service-worker.js`, `jsconfig.json`
- Test: `tests/templates.spec.js`

- [ ] **Step 1: Failing tests:**

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders } = require('./helpers');

async function seedTemplates(page, withFolder) {
  await seedRawNotes(page, [
    { id: 'tpl-meeting', title: 'Meeting', body: '## Agenda\n\n- item', tags: ['meeting'], folderId: 'f-tpl' },
    { id: 'tpl-weekly', title: 'Weekly', body: 'Wins\n\nLosses', tags: ['review'], folderId: 'f-tpl' },
    { id: 'tpl-old', title: 'Old', body: 'x', folderId: 'f-tpl', archivedAt: Date.now() - 1000 },
    { id: 'work-note', title: 'Work note', body: 'w', folderId: 'f-work' },
  ]);
  const folders = [{ id: 'f-work', name: 'Work' }];
  if (withFolder) folders.push({ id: 'f-tpl', name: 'templates' });
  await seedFolders(page, folders);
}

async function openFolder(page, id) {
  await page.locator('#folder-switcher-btn').click();
  await page.locator(`.folder-switcher-row[data-folder-id="${id}"] .folder-switcher-option`).click();
}

async function runPalette(page, query) {
  await page.locator('#command-palette-btn').click();
  await page.locator('#command-palette-input').fill(query);
  await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText(/template/i);
  await page.keyboard.press('Enter');
  await expect(page.locator('#command-palette-dialog')).toBeHidden();
}

test('templates are listed by title and create a filed note with body and tags', async ({ page }) => {
  await seedTemplates(page, true);
  await openFolder(page, 'f-work');
  await page.locator('#command-palette-btn').click();
  await page.locator('#command-palette-input').fill('template');
  const options = page.locator('#command-palette-list [role="option"]');
  await expect(options).toContainText([/Meeting/, /Weekly/]);
  await expect(options.filter({ hasText: 'Old' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await runPalette(page, 'template meeting');
  await expect(page.locator('#note-title-display')).toHaveText('Agenda');
  const created = await page.evaluate(async () => {
    const notes = await window.ScratchpadDB.getAll();
    return notes.filter((n) => !['tpl-meeting', 'tpl-weekly', 'tpl-old', 'work-note'].includes(n.id));
  });
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ title: '', body: '## Agenda\n\n- item', tags: ['meeting'], folderId: 'f-work' });
});

test('a note created while viewing the templates folder is unfiled', async ({ page }) => {
  await seedTemplates(page, true);
  await openFolder(page, 'f-tpl');
  await runPalette(page, 'template weekly');
  const created = await page.evaluate(async () => {
    const notes = await window.ScratchpadDB.getAll();
    return notes.find((n) => n.body === 'Wins\n\nLosses' && n.id !== 'tpl-weekly');
  });
  expect(created.folderId).toBeNull();
  expect(created.tags).toEqual(['review']);
});

test('without a templates folder the palette offers guidance and creates nothing', async ({ page }) => {
  await seedTemplates(page, false);
  await runPalette(page, 'template');
  await expect(page.locator('#toast-region')).toContainText('folder named “Templates”');
  const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
  expect(count).toBe(4);
});
```

- [ ] **Step 2: Run** — expect FAIL (no template commands in the palette).
- [ ] **Step 3: Module** `public/js/templates.js`:

```js
// @ts-check
/* Templates folder: notes in a folder named "Templates" seed new notes from the command palette. */
{
  ('use strict');

  /** @typedef {{ id: string, title?: string, body?: string, tags?: string[], folderId?: string | null, archivedAt?: number | null, deletedAt?: number | null }} TemplateNote */
  /** @typedef {{ id: string, name: string }} TemplateFolder */
  /** @typedef {{ notes(): TemplateNote[], folders(): TemplateFolder[], filingFolderId(): string | null, isDailyNotesFolder(id: string): boolean, folderById(id: string): TemplateFolder | null | undefined, uuid(): string, now(): number, normalizeNote(note: object): TemplateNote, putNoteRecord(note: TemplateNote): Promise<unknown>, addNote(note: TemplateNote): void, openNote(id: string): void, deriveTitle(note: TemplateNote): string, toast(message: string): void }} Deps */
  /** @typedef {{ id: string, label: string, meta: string, keywords: string, run(): void }} Command */

  const FOLDER_NAME = 'templates';
  const GUIDANCE = 'Add notes to a folder named “Templates” to use them here.';
  /** @type {Deps | null} */
  let deps = null;

  /** @param {TemplateFolder[]} folders */
  function templatesFolder(folders) {
    return folders.find((folder) => String(folder.name || '').trim().toLowerCase() === FOLDER_NAME) || null;
  }

  /** @param {Deps} api @param {TemplateFolder} folder */
  function templateNotes(api, folder) {
    return api
      .notes()
      .filter((note) => note.folderId === folder.id && !note.archivedAt && !note.deletedAt)
      .sort((left, right) => api.deriveTitle(left).localeCompare(api.deriveTitle(right)));
  }

  /** @param {Deps} api @param {TemplateFolder} folder */
  function targetFolderId(api, folder) {
    const id = api.filingFolderId();
    if (!id || id === folder.id || api.isDailyNotesFolder(id) || !api.folderById(id)) return null;
    return id;
  }

  /** @param {Deps} api @param {TemplateNote} template @param {TemplateFolder} folder */
  async function createFrom(api, template, folder) {
    const t = api.now();
    const note = api.normalizeNote({
      id: api.uuid(),
      title: '',
      body: template.body || '',
      tags: [...(template.tags || [])],
      pinned: false,
      folderId: targetFolderId(api, folder),
      createdAt: t,
      updatedAt: t,
      archivedAt: null,
      deletedAt: null,
      lastDraftAt: null,
    });
    await api.putNoteRecord(note);
    api.addNote(note);
    api.openNote(note.id);
    api.toast('New note from “' + api.deriveTitle(template) + '”');
  }

  /** @param {Deps} api @returns {Command} */
  function guidanceCommand(api) {
    return {
      id: 'new-from-template',
      label: 'New note from template…',
      meta: 'Put notes in a folder named Templates first',
      keywords: 'template templates new note',
      run: () => api.toast(GUIDANCE),
    };
  }

  /** @returns {Command[]} */
  function commands() {
    if (!deps) return [];
    const api = deps;
    const folder = templatesFolder(api.folders());
    const templates = folder ? templateNotes(api, folder) : [];
    if (!folder || !templates.length) return [guidanceCommand(api)];
    return templates.map((template) => ({
      id: 'template-' + template.id,
      label: 'New note from template: ' + api.deriveTitle(template),
      meta: 'Templates folder',
      keywords: 'template templates new note ' + api.deriveTitle(template),
      run: () => createFrom(api, template, folder),
    }));
  }

  /** @param {Deps} api */
  function init(api) {
    deps = api;
  }

  /** @type {Window & typeof globalThis & { ScratchpadTemplates?: object }} */
  const root = window;
  root.ScratchpadTemplates = Object.freeze({ init, commands, templatesFolder });
}
```

- [ ] **Step 4: app.js.** Before `const notes = sortNotes(state.notes)` in
  `commandDefinitions` add
  `if (window.ScratchpadTemplates) commands.push(...window.ScratchpadTemplates.commands());`.
  Collapse the note pseudo-command's `meta` nested ternary onto one line.
  After the mentions init add:

```js
    if (window.ScratchpadTemplates) window.ScratchpadTemplates.init({
      notes: () => state.notes, folders: () => state.folders, filingFolderId: () => state.folderViewId,
      isDailyNotesFolder, folderById, uuid, now, normalizeNote, putNoteRecord, addNote: (note) => state.notes.push(note),
      openNote: openNoteFromCommand, deriveTitle, toast,
    });
```

Register the script (after `mentions.js`), `APP_SHELL`, and jsconfig.

- [ ] **Step 5: Run** the spec, `command-palette`, `daily-note`, and `folders`
  specs on all browsers; checks; commit
  `feat(palette): new note from any note in a templates folder`.

### Task 2: Docs, version, release

- [ ] Guide daily-notes section: paragraph "Any folder named <strong>Templates</strong> turns its notes into templates: the command palette lists <em>New note from template: …</em> for each, and choosing one creates a new note with that body and tags in the folder you are viewing." README daily bullet; `tests/README.md`. Commit `docs(guide): templates folder`.
- [ ] Bump to 3.25.0; verify, suite, CSP, dry run; commit
  `chore(release): v3.25.0 templates folder`; update `tasks/todo.md`.
