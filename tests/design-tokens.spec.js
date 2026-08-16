// @ts-check
// Executable form of the Indigo on Paper design contract
// (docs/superpowers/specs/2026-08-16-indigo-on-paper-design.md):
// warm neutral surfaces, byte-parallel dark blocks, indigo pinned as the
// sole accent, and AA contrast on every text/surface pair the shell uses.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { gotoApp } = require('./helpers');

const TOKENS_PATH = path.join(__dirname, '..', 'public', 'css', 'inkwell-tokens.css');

function parseColor(value) {
  let m = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  m = value.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
  if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`Unparseable color: ${value}`);
}

function composite(fg, bg) {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const TOKEN_NAMES = [
  '--paper', '--wash-base', '--surface-rail', '--surface-list',
  '--ink', '--text-secondary', '--text-body',
  '--accent', '--on-accent', '--accent-text', '--accent-soft',
];

async function resolveTokens(page) {
  const raw = await page.evaluate((names) => {
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const out = {};
    for (const name of names) {
      probe.style.backgroundColor = '';
      probe.style.backgroundColor = `var(${name})`;
      out[name] = getComputedStyle(probe).backgroundColor;
    }
    probe.remove();
    return out;
  }, TOKEN_NAMES);
  const colors = {};
  for (const [name, value] of Object.entries(raw)) colors[name] = parseColor(value);
  return colors;
}

function assertContracts(colors, theme) {
  // Warm paper: no shell surface may lean blue. The document surface is
  // pure white in light mode by design, so the floor is r >= b, and the
  // tinted surfaces must be strictly warm.
  for (const name of ['--wash-base', '--surface-rail', '--surface-list', '--paper']) {
    const c = colors[name];
    expect(c.r, `${theme} ${name} should not lean cool, got rgb(${c.r}, ${c.g}, ${c.b})`)
      .toBeGreaterThanOrEqual(c.b);
  }
  for (const name of ['--wash-base', '--surface-rail', '--surface-list']) {
    const c = colors[name];
    expect(c.r, `${theme} ${name} should be strictly warm (r > b), got rgb(${c.r}, ${c.g}, ${c.b})`)
      .toBeGreaterThan(c.b);
  }

  // AA floor (4.5:1) on every primary text/surface pair the shell uses.
  const pairs = [
    ['--ink', '--paper'], ['--ink', '--surface-list'], ['--ink', '--surface-rail'], ['--ink', '--wash-base'],
    ['--text-secondary', '--paper'], ['--text-secondary', '--surface-list'], ['--text-secondary', '--wash-base'],
    ['--text-body', '--paper'],
    ['--on-accent', '--accent'],
    ['--accent', '--surface-rail'],
  ];
  for (const [fg, bg] of pairs) {
    const ratio = contrast(colors[fg], composite(colors[bg], colors['--paper']));
    expect(ratio, `${theme} ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  }

  // Accent text on an accent-soft chip, composited over the document paper —
  // the tightest pairing in the system (dark soft tints are translucent).
  const chip = composite(colors['--accent-soft'], colors['--paper']);
  const chipRatio = contrast(colors['--accent-text'], chip);
  expect(chipRatio, `${theme} accent-text on accent-soft chip = ${chipRatio.toFixed(2)}`)
    .toBeGreaterThanOrEqual(4.5);
}

test.describe('design tokens — Indigo on Paper contract', () => {
  test('light theme: warm surfaces, AA pairs, indigo pinned', async ({ page }) => {
    await gotoApp(page);
    const colors = await resolveTokens(page);
    const acc = colors['--accent'];
    expect([Math.round(acc.r), Math.round(acc.g), Math.round(acc.b)]).toEqual([86, 97, 179]);
    assertContracts(colors, 'light');
  });

  test('dark theme (auto): warm surfaces, AA pairs, indigo pinned', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await gotoApp(page);
    const colors = await resolveTokens(page);
    const acc = colors['--accent'];
    expect([Math.round(acc.r), Math.round(acc.g), Math.round(acc.b)]).toEqual([133, 147, 214]);
    assertContracts(colors, 'dark');
  });

  test('the two dark-mode token blocks stay byte-parallel', () => {
    const css = fs.readFileSync(TOKENS_PATH, 'utf8');
    const media = css.match(/@media \(prefers-color-scheme: dark\) \{\s*\n\s*:root:not\(\[data-theme="light"\]\) \{\n([\s\S]*?)\n\s*\}/);
    const forced = css.match(/\n:root\[data-theme="dark"\] \{\n([\s\S]*?)\n\}/);
    if (!media || !forced) throw new Error('Could not locate both dark-mode blocks');
    const norm = (block) => block.split('\n').map((line) => line.trim()).join('\n').trim();
    expect(norm(media[1])).toBe(norm(forced[1]));

    // Both dark chevron overrides must carry the same stroke color.
    const strokes = [...css.matchAll(/stroke='%23([0-9A-Fa-f]{6})'/g)].map((m) => m[1].toUpperCase());
    expect(strokes.length).toBe(2);
    expect(new Set(strokes).size).toBe(1);
  });
});
