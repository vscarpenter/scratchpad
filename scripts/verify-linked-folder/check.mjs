#!/usr/bin/env node
// Exhaustively explores public/js/linked-folder.js within small bounds.
//   node scripts/verify-linked-folder/check.mjs
// Exit 0: guards hold, each listed finding still reproduces, and every broken
// variant of the code is caught.
// Exit 1: anything else. A check that cannot fail proves nothing, so the variants
// run every time.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { explore } from './explore.mjs';
import { mutants } from './mutants.mjs';
import { check, findings, guards } from './scenarios.mjs';

const MAX_RUNS = 2000000;
const source = readFileSync(resolve(import.meta.dirname, '../../public/js/linked-folder.js'), 'utf8');

function printViolation(violation) {
  console.log(`    ${violation.property}: ${violation.message}`);
  console.log(`    Seen in ${violation.schedules} orders. The shortest one:`);
  violation.trace.forEach((line, index) => {
    console.log(`      ${index + 1}. ${line}`);
  });
}

async function runGuard(scenario) {
  const result = await explore(source, scenario, check, MAX_RUNS);
  const passed = result.complete && result.violations.length === 0;
  console.log(`${passed ? 'pass' : 'FAIL'}  ${scenario.name} (${result.runs} orders)`);
  if (!result.complete) console.log('    The search hit its cap, so this result is not a pass.');
  result.violations.forEach(printViolation);
  return passed;
}

async function runFinding(scenario) {
  const result = await explore(source, scenario, check, MAX_RUNS);
  const reproduced = result.violations.length > 0;
  console.log(`${reproduced ? 'open' : 'GONE'}  ${scenario.name} (${result.runs} orders)`);
  if (!reproduced) console.log('    It no longer reproduces. Move it to guards in scenarios.mjs.');
  result.violations.forEach(printViolation);
  return reproduced;
}

async function runMutant(mutant) {
  if (!mutant.edits.every((edit) => source.includes(edit.find))) {
    console.log(`STALE  ${mutant.name}: its target text is no longer in linked-folder.js`);
    return false;
  }
  const broken = mutant.edits.reduce((text, edit) => text.replace(edit.find, edit.replace), source);
  const scenario = guards.find((guard) => guard.name === mutant.guard);
  const result = await explore(broken, scenario, check, MAX_RUNS, { ...mutant.world, stopAtFirstViolation: true });
  const caught = result.violations.length > 0;
  console.log(`${caught ? 'caught' : 'MISSED'}  ${mutant.name}, by "${mutant.guard}"`);
  return caught;
}

async function runAll(title, items, run) {
  console.log(`\n${title}`);
  const results = [];
  for (const item of items) results.push(await run(item));
  return results;
}

const results = [
  ...(await runAll('Guards:', guards, runGuard)),
  ...(await runAll('Open findings:', findings, runFinding)),
  ...(await runAll('Broken variants of the code:', mutants, runMutant)),
];
process.exit(results.every(Boolean) ? 0 : 1);
