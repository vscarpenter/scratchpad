#!/usr/bin/env node
// @ts-check

import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const baseline = JSON.parse(readFileSync(join(root, 'config/structure-baseline.json'), 'utf8'));
const sourceRoots = ['public/js', 'scripts', 'share-infra/lambda', 'tests'];
const standaloneFiles = ['playwright.config.js', 'public/service-worker.js', 'service-worker.js'];

/** @param {string} directory @returns {string[]} */
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'vendor' ? [] : walk(path);
    }
    return ['.js', '.mjs', '.cjs'].includes(extname(entry.name)) ? [path] : [];
  });
}

/** @param {ts.Node} node */
function isFunction(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

/** @param {ts.Node} node */
function addsNesting(node) {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node)
  );
}

/** @param {ts.Node} node @param {number} depth */
function deepestNesting(node, depth = 0) {
  const nextDepth = depth + (addsNesting(node) ? 1 : 0);
  let deepest = nextDepth;
  node.forEachChild((child) => {
    if (!isFunction(child)) deepest = Math.max(deepest, deepestNesting(child, nextDepth));
  });
  return deepest;
}

/** @param {string} path */
function inspect(path) {
  const sourceText = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
  let longFunctions = 0;
  let deepFunctions = 0;
  const visit = (/** @type {ts.Node} */ node) => {
    if (isFunction(node)) {
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
      const end = source.getLineAndCharacterOfPosition(node.end).line;
      if (end - start + 1 > baseline.limits.functionLines) longFunctions += 1;
      if (deepestNesting(node) > baseline.limits.nestingDepth) deepFunctions += 1;
    }
    node.forEachChild(visit);
  };
  visit(source);
  return { lines: sourceText.split(/\r?\n/).length, longFunctions, deepFunctions };
}

const paths = [
  ...sourceRoots.flatMap((directory) => walk(join(root, directory))),
  ...standaloneFiles.map((file) => join(root, file)),
].sort();
const results = Object.fromEntries(paths.map((path) => [relative(root, path), inspect(path)]));

if (process.argv.includes('--print-baseline')) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

const failures = [];
for (const [file, result] of Object.entries(results)) {
  const lineAllowance = baseline.oversizeFiles[file] || baseline.limits.fileLines;
  if (result.lines > lineAllowance) {
    failures.push(`${file}: lines increased from ${lineAllowance} to ${result.lines}`);
  }
}

const totals = Object.values(results).reduce(
  (sum, result) => ({
    longFunctions: sum.longFunctions + result.longFunctions,
    deepFunctions: sum.deepFunctions + result.deepFunctions,
  }),
  { longFunctions: 0, deepFunctions: 0 },
);
for (const metric of /** @type {const} */ (['longFunctions', 'deepFunctions'])) {
  if (totals[metric] > baseline.legacyTotals[metric]) {
    failures.push(`${metric} increased from ${baseline.legacyTotals[metric]} to ${totals[metric]}`);
  }
}

if (process.argv.includes('--print-summary')) {
  console.log(JSON.stringify(totals, null, 2));
  process.exit(0);
}

if (failures.length) {
  console.error(`Structure ratchet failed:\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(
  `Structure ratchet passed: ${paths.length} files; ${totals.longFunctions} long and ${totals.deepFunctions} deeply nested legacy functions.`,
);
