#!/usr/bin/env node
// @ts-check

import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const supported = /\.(?:c?js|mjs|json|css)$/;
const excluded = /^(?:public\/js\/vendor\/|\.impeccable\/|\.verify\/)|^bun\.lock$/;

/** @param {string[]} args */
function gitLines(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const base = process.env.QUALITY_BASE_SHA;
const candidates = new Set([
  ...gitLines(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
  ...gitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMR']),
  ...gitLines(['ls-files', '--others', '--exclude-standard']),
  ...(base ? gitLines(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]) : []),
]);
const files = [...candidates].filter((file) => supported.test(file) && !excluded.test(file));

if (!files.length) {
  console.log('Biome format check: no changed supported files.');
  process.exit(0);
}

const result = spawnSync(resolve(root, 'node_modules/.bin/biome'), ['format', ...files], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
