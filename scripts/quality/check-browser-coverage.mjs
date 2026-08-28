#!/usr/bin/env node
// @ts-check

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const port = 8097;
const baseUrl = `http://127.0.0.1:${port}`;
const baseline = JSON.parse(readFileSync(join(root, 'config/coverage-baseline.json'), 'utf8'));

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The bounded retry is only for the local server's startup window.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error('Coverage server did not start within 5 seconds.');
}

/** @param {import('playwright').Page} page */
async function exerciseCoreWorkflow(page) {
  await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
  await page.goto(baseUrl);
  await page.locator('#app-shell').waitFor();
  await page.locator('#new-note').click();
  await page.locator('#note-title-input').fill('Coverage note');
  await page.locator('#note-editor').fill('# Coverage body\n\nworkflow search marker');
  await page.locator('#save-btn').click();
  await page.locator('#search').fill('marker');
  await page.locator('#search').fill('');
  await page.locator('#list-menu-btn').click();
  await page.keyboard.press('Escape');
  await page.locator('#edit-btn').click();
  await page.locator('#overflow-btn').click();
  await page.keyboard.press('Escape');
}

/**
 * @typedef {{
 *   source?: string,
 *   functions: Array<{ranges: Array<{startOffset: number, endOffset: number, count: number}>}>
 * }} CoverageEntry
 */

/** @param {CoverageEntry} entry */
function coveredLines(entry) {
  const source = entry.source || '';
  const coverage = new Uint8Array(source.length);
  const ranges = entry.functions
    .flatMap((fn) => fn.ranges)
    .sort((left, right) => right.endOffset - right.startOffset - (left.endOffset - left.startOffset));
  for (const range of ranges) {
    coverage.fill(range.count > 0 ? 1 : 0, range.startOffset, range.endOffset);
  }

  let offset = 0;
  let covered = 0;
  let total = 0;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    const executable = trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
    if (executable) {
      total += 1;
      if (coverage.subarray(offset, offset + line.length).some(Boolean)) covered += 1;
    }
    offset += line.length + 1;
  }
  return { covered, total };
}

const server = spawn(process.execPath, [join(root, 'scripts/dev-server.mjs'), String(port)], {
  cwd: root,
  stdio: 'ignore',
});

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await exerciseCoreWorkflow(page);
  const entries = (await page.coverage.stopJSCoverage()).filter(
    (entry) => entry.url.startsWith(`${baseUrl}/public/js/`) && !entry.url.includes('/vendor/'),
  );
  const totals = entries.map(coveredLines).reduce(
    (sum, result) => ({
      covered: sum.covered + result.covered,
      total: sum.total + result.total,
    }),
    { covered: 0, total: 0 },
  );
  const percent = totals.total ? (totals.covered / totals.total) * 100 : 0;
  console.log(`Browser line coverage: ${percent.toFixed(2)}% (${totals.covered}/${totals.total})`);
  if (percent + 0.001 < baseline.minimumLinePercent) {
    throw new Error(`Coverage fell below the ${baseline.minimumLinePercent.toFixed(2)}% legacy floor.`);
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
