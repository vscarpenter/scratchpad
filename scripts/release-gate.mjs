#!/usr/bin/env node
// Release gate: the full Playwright suite in two halves.
//
// The complete 52-file suite saturates a 14-core machine to the point where
// Playwright can starve attaching the guide popup's new page target — the
// test is deterministic solo, in pairs, and in every subset (see
// tasks/lessons.md). Splitting at guide.spec.js — everything alphabetically
// before it plus guide, then everything after it plus guide — runs every
// test at default parallelism with room to breathe. CI (workers: 1,
// retries: 2) remains the authoritative single-process gate.
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const specFiles = readdirSync(join(root, 'tests'))
  .filter((name) => name.endsWith('.spec.js'))
  .sort();
const pivot = specFiles.indexOf('guide.spec.js');
if (pivot === -1) {
  console.error('release-gate: tests/guide.spec.js not found');
  process.exit(1);
}
const before = specFiles.slice(0, pivot).map((name) => join('tests', name));
const after = specFiles.slice(pivot + 1).map((name) => join('tests', name));

const cli = join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const guide = join('tests', 'guide.spec.js');
const halves = [
  ['first half (accessibility … folders) + guide', [...before, guide]],
  ['second half (import … wikilinks) + guide', [...after, guide]],
];

let failed = false;
for (const [label, files] of halves) {
  console.log(`\nrelease-gate: ${label} — ${files.length} spec files`);
  const run = spawnSync(process.execPath, [cli, 'test', ...files], {
    cwd: root,
    stdio: 'inherit',
  });
  if (run.status !== 0) {
    failed = true;
    console.error(`release-gate: ${label} failed with exit ${run.status}`);
  }
}
if (failed) process.exit(1);
console.log('\nrelease-gate: both halves green.');
