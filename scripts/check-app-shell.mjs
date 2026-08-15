#!/usr/bin/env node
// Asserts every path the service worker precaches resolves to a file that
// deploy.sh uploads. cache.addAll is atomic, so one stale entry after a
// rename or retire would fail every registered user's worker install --
// silently, because a failed install fires no event a page can observe.
// Run by deployAll.sh's preflight; also available as `npm run check:shell`.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerSource = readFileSync(join(root, 'public', 'service-worker.js'), 'utf8');

// The six HTML shells deploy.sh uploads explicitly. Anything else at the
// bucket root does not exist after a deploy, whatever the working tree holds.
const DEPLOYED_SHELLS = new Set([
  'index.html', 'about.html', 'guide.html', 'privacy.html', 'terms.html', 'share.html',
]);

function extractList(name) {
  const match = workerSource.match(new RegExp('const ' + name + ' = \\[([^\\]]*)\\]'));
  if (!match) {
    console.error(`check-app-shell: could not find ${name} in public/service-worker.js`);
    process.exit(1);
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const entries = [...extractList('APP_SHELL'), ...extractList('OPTIONAL_SHELL')];
const problems = [];

for (const entry of entries) {
  if (entry === '/') continue; // served as index.html by the router and DefaultRootObject
  if (entry.startsWith('/public/')) {
    if (!existsSync(join(root, entry.slice(1)))) problems.push(`${entry}: no such file`);
    continue;
  }
  const name = entry.slice(1);
  if (!DEPLOYED_SHELLS.has(name)) {
    problems.push(`${entry}: not one of the HTML shells deploy.sh uploads`);
  } else if (!existsSync(join(root, name))) {
    problems.push(`${entry}: no such file`);
  }
}

if (entries.length === 0) problems.push('no precache entries extracted -- the parser is broken');

if (problems.length) {
  console.error('check-app-shell: the service worker precaches paths that will not deploy:');
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}
console.log(`check-app-shell: all ${entries.length} precache paths resolve to deployable files.`);
