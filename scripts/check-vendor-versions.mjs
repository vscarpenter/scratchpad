#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const vendors = [
  {
    name: 'marked',
    npmPackage: 'marked',
    file: 'public/js/vendor/marked.min.js',
    versionPattern: /marked v([0-9]+\.[0-9]+\.[0-9]+)/,
  },
  {
    name: 'DOMPurify',
    npmPackage: 'dompurify',
    file: 'public/js/vendor/purify.min.js',
    versionPattern: /DOMPurify ([0-9]+\.[0-9]+\.[0-9]+)/,
  },
];

async function latestVersion(npmPackage) {
  const { stdout } = await execFileAsync('npm', ['view', `${npmPackage}@latest`, 'version'], {
    timeout: 30000,
  });
  return stdout.trim();
}

let failures = 0;

for (const vendor of vendors) {
  const source = await readFile(vendor.file, 'utf8');
  const current = source.match(vendor.versionPattern)?.[1];
  if (!current) {
    console.error(`${vendor.name}: could not find a version header in ${vendor.file}`);
    failures += 1;
    continue;
  }

  const latest = await latestVersion(vendor.npmPackage);
  const status = current === latest ? 'ok' : 'stale';
  console.log(`${vendor.name}: ${current} vendored, ${latest} latest (${status})`);
  if (current !== latest) failures += 1;
}

if (failures) {
  console.error('Vendored library versions are stale or unreadable.');
  process.exit(1);
}
