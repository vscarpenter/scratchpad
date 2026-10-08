// @ts-check
// Home: the stage a wide screen shows when no note is open
// (docs/superpowers/specs/2026-10-08-home-desk-design.md).
const { test, expect } = require('@playwright/test');
const { openCommandPalette, openSettings, switchView } = require('./helpers');

// Thursday, October 8, 2026, 9:30 a.m. in the browser's own time zone.
const NOW = new Date(2026, 9, 8, 9, 30).getTime();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const FOLDERS = [
  { id: 'f-work', name: 'Work', color: 'accent' },
  { id: 'f-personal', name: 'Personal', color: 'olive' },
];

const NOTES = [
  {
    id: 'roadmap',
    title: 'Platform roadmap',
    body: '# Platform roadmap\n\nThree outcomes this quarter.',
    pinned: true,
    folderId: 'f-work',
    age: 2 * HOUR,
  },
  {
    id: 'reading',
    title: 'Reading list',
    body: 'Chapters four to six.',
    pinned: true,
    folderId: 'f-personal',
    age: 30 * HOUR,
  },
  {
    id: 'maya',
    title: 'One-on-one with Maya',
    body: 'Template working group.',
    tags: ['people'],
    folderId: 'f-work',
    age: 20 * MINUTE,
  },
  { id: 'errands', title: 'Weekend errands', body: '- Coffee beans', folderId: 'f-personal', age: 5 * DAY },
];

/**
 * Writes folders and notes straight to IndexedDB, timed against NOW.
 * @param {import('@playwright/test').Page} page
 * @param {Array<Record<string, any>>} notes
 * @param {Array<Record<string, any>>} folders
 */
async function writeFixtures(page, notes, folders) {
  await page.evaluate(
    async ({ rows, groups, now }) => {
      for (const [index, folder] of groups.entries()) {
        await window.ScratchpadDB.putFolder({
          parentId: null,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
          ...folder,
        });
      }
      const blank = { title: '', body: '', tags: [], pinned: false, folderId: null, archivedAt: null, deletedAt: null };
      await window.ScratchpadDB.bulkPut(
        rows.map(({ age = 0, ...note }) => ({ ...blank, ...note, createdAt: now - age, updatedAt: now - age })),
      );
    },
    { rows: notes, groups: folders, now: NOW },
  );
}

/**
 * Seeds folders and notes, then reloads into the app. Open to stays Home unless
 * the caller chooses otherwise; the shared helpers default to Top note.
 * @param {import('@playwright/test').Page} page
 * @param {{ notes?: Array<Record<string, any>>, folders?: Array<Record<string, any>>, openTo?: string }} [options]
 */
async function seedDesk(page, options = {}) {
  const { notes = NOTES, folders = FOLDERS, openTo = 'home' } = options;
  await page.clock.setFixedTime(NOW);
  // Runs on every load; the session marker applies the choice once, so a
  // test can change Open to and reload without this script undoing it.
  await page.addInitScript((choice) => {
    localStorage.setItem('scratchpad-visited', '1');
    if (sessionStorage.getItem('desk-seeded')) return;
    sessionStorage.setItem('desk-seeded', '1');
    if (choice) localStorage.setItem('scratchpad:openTo', choice);
    else localStorage.removeItem('scratchpad:openTo');
  }, openTo);
  await page.goto('/');
  await page.waitForFunction(() => !!window.ScratchpadDB);
  await writeFixtures(page, notes, folders);
  await page.reload();
  await expect(page.locator('#app-shell')).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
function desk(page) {
  return page.locator('#home-desk');
}

test('a returning visitor opens to Home with a greeting and the note count', async ({ page }) => {
  await seedDesk(page);
  await expect(desk(page)).toBeVisible();
  await expect(page.locator('#editor-view')).toBeHidden();
  await expect(page.locator('#home-desk-date')).toHaveText('Thursday, October 8');
  await expect(page.locator('#home-desk-greeting')).toHaveText('Good morning.');
  await expect(page.locator('#home-desk-sub')).toContainText('4 notes');
  await expect(desk(page)).toHaveAttribute('aria-labelledby', 'home-desk-greeting');
});

test('the first visit still opens the Welcome note', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await expect(page.locator('#note-title-display')).toContainText('Welcome');
  await expect(desk(page)).toBeHidden();
});

test('Open to Top note in Settings brings back the old landing', async ({ page }) => {
  await seedDesk(page, { openTo: '' });
  await expect(desk(page)).toBeVisible();
  await openSettings(page);
  const topNote = page.locator('#open-to-choice [data-open-to-choice="note"]');
  await expect(page.locator('#open-to-choice [data-open-to-choice="home"]')).toHaveAttribute('aria-pressed', 'true');
  await topNote.click();
  await expect(topNote).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('scratchpad:openTo'))).toBe('note');
  await page.reload();
  await expect(page.locator('#editor-view')).toBeVisible();
  await expect(page.locator('#note-title-display')).toHaveText('Platform roadmap');
  await expect(desk(page)).toBeHidden();
});

test('a phone-width launch stays on the note list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedDesk(page);
  await expect(page.locator('.note-row').first()).toBeVisible();
  await expect(desk(page)).toBeHidden();
  await expect(page.locator('#app-shell')).toHaveClass(/mobile-list/);
});

test('a pinned card opens its note and moves focus to the title', async ({ page }) => {
  await seedDesk(page);
  const cards = page.locator('#home-desk-pins .home-desk-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('Platform roadmap');
  await expect(cards.first()).toContainText('Three outcomes this quarter.');
  await expect(cards.first()).toContainText('Work');
  await cards.first().click();
  await expect(desk(page)).toBeHidden();
  await expect(page.locator('#note-title-display')).toHaveText('Platform roadmap');
  await expect(page.locator('#note-title-display')).toBeFocused();
});

test('pinned cards stop at three until Show all', async ({ page }) => {
  const pinned = ['One', 'Two', 'Three', 'Four', 'Five'].map((title, index) => ({
    id: 'pin-' + index,
    title,
    body: title + ' body',
    pinned: true,
    age: (index + 1) * HOUR,
  }));
  await seedDesk(page, { notes: pinned, folders: [] });
  const cards = page.locator('#home-desk-pins .home-desk-card');
  const more = page.locator('#home-desk-pins-more');
  await expect(cards).toHaveCount(3);
  await expect(more).toHaveText('Show all 5');
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(5);
  await expect(more).toHaveText('Show fewer');
  await expect(more).toBeFocused();
});

test('with nothing pinned, Home says how to pin a note', async ({ page }) => {
  const notes = NOTES.map((note) => ({ ...note, pinned: false }));
  await seedDesk(page, { notes });
  await expect(page.locator('#home-desk-pins')).toBeHidden();
  await expect(page.locator('#home-desk-pins-empty')).toBeVisible();
  await expect(page.locator('#home-desk-pins-empty')).toContainText('Pin note');
});

test('recently edited lists notes newest first with relative times', async ({ page }) => {
  await seedDesk(page);
  const rows = page.locator('#home-desk-recent .home-desk-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('One-on-one with Maya');
  await expect(rows.nth(0)).toContainText('20 minutes ago');
  await expect(rows.nth(1)).toContainText('2 hours ago');
  await expect(rows.nth(2)).toContainText('Yesterday');
  await expect(rows.nth(3)).toContainText('Saturday');
  await rows.nth(3).click();
  await expect(page.locator('#note-title-display')).toHaveText('Weekend errands');
});

test('the grid layout survives a reload', async ({ page }) => {
  await seedDesk(page);
  const grid = page.locator('#home-desk-layout [data-desk-layout="grid"]');
  await grid.click();
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#home-desk-recent')).toHaveClass(/is-grid/);
  await page.reload();
  await expect(page.locator('#home-desk-recent')).toHaveClass(/is-grid/);
  await expect(page.locator('#home-desk-layout [data-desk-layout="list"]')).toHaveAttribute('aria-pressed', 'false');
});

test('folder chips narrow recently edited to one folder', async ({ page }) => {
  await seedDesk(page);
  const chips = page.locator('#home-desk-chips button');
  await expect(chips).toHaveText(['All', 'Work', 'Personal']);
  // Keyboard, because WebKit does not focus a clicked button. The chip is
  // rebuilt on press, so focus must land on its successor.
  await chips.filter({ hasText: 'Personal' }).focus();
  await page.keyboard.press('Enter');
  await expect(chips.filter({ hasText: 'Personal' })).toHaveAttribute('aria-pressed', 'true');
  await expect(chips.filter({ hasText: 'Personal' })).toBeFocused();
  const rows = page.locator('#home-desk-recent .home-desk-row');
  await expect(rows).toHaveCount(2);
  await expect(rows).toContainText(['Reading list', 'Weekend errands']);
});

test('chips stay hidden when every recent note shares a folder', async ({ page }) => {
  const notes = NOTES.map((note) => ({ ...note, folderId: 'f-work' }));
  await seedDesk(page, { notes });
  await expect(page.locator('#home-desk-chips')).toBeHidden();
  await expect(page.locator('#home-desk-recent .home-desk-row')).toHaveCount(4);
});

test('the Home button returns to Home and asks before dropping unsaved edits', async ({ page }) => {
  await seedDesk(page);
  await page.locator('#home-desk-pins .home-desk-card').first().click();
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').fill('An edit worth keeping');
  await page.locator('#home-view').click();
  await expect(page.locator('#discard-dialog')).toHaveAttribute('open', '');
  await page.locator('#discard-dialog .btn-secondary').click();
  await expect(page.locator('#note-editor')).toHaveValue('An edit worth keeping');
  await expect(desk(page)).toBeHidden();
  await page.locator('#home-view').click();
  await page.locator('#confirm-discard').click();
  await expect(desk(page)).toBeVisible();
  await expect(page.locator('#editor-view')).toBeHidden();
});

test('a search, a tag filter, or Archive ends Home as before', async ({ page }) => {
  await seedDesk(page, {
    notes: [...NOTES, { id: 'old', title: 'Old plan', body: 'Done', archivedAt: NOW - DAY, age: 2 * DAY }],
  });
  await page.locator('#search').fill('errands');
  await expect(page.locator('#note-title-display')).toHaveText('Weekend errands');
  await expect(desk(page)).toBeHidden();
  await page.locator('#search').fill('');
  await page.locator('#home-view').click();
  await expect(desk(page)).toBeVisible();
  await page.locator('.note-row-tag[data-tag="people"]').first().click();
  await expect(page.locator('#note-title-display')).toHaveText('One-on-one with Maya');
  await page.locator('#home-view').click();
  await expect(desk(page)).toBeVisible();
  await switchView(page, 'archive');
  await expect(page.locator('#note-title-display')).toHaveText('Old plan');
  await page.locator('#home-view').click();
  await expect(desk(page)).toBeHidden();
});

test('quick capture from Home updates the today tile', async ({ page }) => {
  await seedDesk(page);
  await expect(page.locator('#home-desk-today-meta')).toHaveText('Not started yet');
  await page.locator('#home-desk-capture').click();
  await page.locator('#quick-capture-input').fill('call the bank');
  await page.locator('#quick-capture-submit').click();
  await expect(desk(page)).toBeVisible();
  await expect(page.locator('#home-desk-today-meta')).toHaveText(/^\d+ words so far$/);
  await page.locator('#home-desk-today').click();
  await expect(page.locator('#note-rendered')).toContainText('call the bank');
  await expect(page.locator('#note-title-display')).toBeFocused();
});

test('the template tile opens the palette filtered to templates', async ({ page }) => {
  await seedDesk(page);
  await expect(page.locator('#home-desk-template-meta')).toContainText('Templates');
  await page.locator('#home-desk-template').click();
  await expect(page.locator('#command-palette-input')).toHaveValue('template');
  await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('template');
});

test('Go to Home runs from the command palette', async ({ page }) => {
  await seedDesk(page, { openTo: 'note' });
  await expect(page.locator('#editor-view')).toBeVisible();
  await openCommandPalette(page);
  await page.locator('#command-palette-input').fill('Go to Home');
  await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('Go to Home');
  await page.keyboard.press('Enter');
  await expect(desk(page)).toBeVisible();
  await expect(page.locator('#editor-view')).toBeHidden();
});

test('New note from Home opens a blank note for writing', async ({ page }) => {
  await seedDesk(page);
  await page.locator('#home-desk-new').click();
  await expect(desk(page)).toBeHidden();
  await expect(page.locator('#note-editor')).toBeVisible();
  await expect(page.locator('#note-editor')).toBeFocused();
});

test('greetings, relative times, and previews follow their rules', async ({ page }) => {
  await seedDesk(page);
  const out = await page.evaluate((now) => {
    const view = window.ScratchpadHomeDeskView;
    const body =
      '# Title\n- [ ] Buy [[Coffee|beans]] at [the shop](https://example.com)\n```js\nconst a = 1;\n```\n==Key== point with `code`';
    return {
      greetings: [4, 5, 11, 12, 16, 17, 23].map((hour) => view.greetingFor(hour)),
      times: [now - 30 * 1000, now - 60 * 1000, now - 60 * 60 * 1000].map((ms) => view.whenLabel(ms, now)),
      earlier: [new Date(2026, 8, 1).getTime(), new Date(2025, 11, 25).getTime()].map((ms) => view.whenLabel(ms, now)),
      excerpt: view.excerptOf(body, 'Title'),
    };
  }, NOW);
  expect(out.greetings).toEqual([
    'Hello, night owl.',
    'Good morning.',
    'Good morning.',
    'Good afternoon.',
    'Good afternoon.',
    'Good evening.',
    'Good evening.',
  ]);
  expect(out.times).toEqual(['Just now', '1 minute ago', '1 hour ago']);
  expect(out.earlier).toEqual(['Sep 1', 'Dec 25, 2025']);
  expect(out.excerpt).toBe('Buy beans at the shop\nKey point with code');
});
