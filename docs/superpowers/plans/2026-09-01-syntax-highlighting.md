# Syntax Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Prism-based code highlighting
(`docs/superpowers/specs/2026-09-01-syntax-highlighting-design.md`) as v3.24.0.

**Architecture:** One vendored file assembled from `prismjs@1.30.0`
components, loaded with `data-manual` in both shells; a `code` renderer
override in `markdown.js`; token-only CSS scoped to `.code-block`.

**Spec:** `docs/superpowers/specs/2026-09-01-syntax-highlighting-design.md`

## Global Constraints

- Zero network at runtime; no inline `<script>` edits.
- Vendor file under 40KB; header names `PrismJS 1.30.0`.
- Tokens-only CSS; `markdown.js` Biome-formatted before commit.

---

### Task 1: Vendor the bundle and highlight at render

**Files:**
- Create: `public/js/vendor/prism.min.js`
- Modify: `public/js/markdown.js` (code renderer), `public/css/app.css`
  (after the callout rules), `index.html` and `share.html` (script tag after
  `purify.min.js`), `public/service-worker.js` (`APP_SHELL`),
  `scripts/check-vendor-versions.mjs` (entry)
- Test: `tests/syntax-highlighting.spec.js` (create)

- [ ] **Step 1: Write the failing tests:**

```js
// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { seedRawNotes, gotoApp } = require('./helpers');

test('a fenced block with a known language gets token spans and no inline styles', async ({ page }) => {
  const body = '```js\nconst answer = 42; // why\n```\n\n```py\ndef f():\n    return "x"\n```';
  await seedRawNotes(page, [{ id: 'code', title: 'Code', body }]);
  await page.locator('.note-row[data-id="code"]').click();
  const js = page.locator('#note-rendered pre code.language-js');
  await expect(js.locator('.token.keyword')).toHaveText(['const']);
  await expect(js.locator('.token.number')).toHaveText(['42']);
  await expect(js.locator('.token.comment')).toHaveText(['// why']);
  await expect(page.locator('#note-rendered pre code.language-py .token.string')).toHaveText(['"x"']);
  await expect(page.locator('#note-rendered [style]')).toHaveCount(0);
  expect(await page.evaluate(() => window.Prism.manual)).toBe(true);
});

test('unknown languages and bare fences render escaped text without spans', async ({ page }) => {
  const body = '```brainfuck\n<b>+++</b>\n```\n\n```\nplain <i>x</i>\n```';
  await seedRawNotes(page, [{ id: 'plain', title: 'Plain', body }]);
  await page.locator('.note-row[data-id="plain"]').click();
  const blocks = page.locator('#note-rendered pre code');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0)).toHaveClass(/language-brainfuck/);
  await expect(blocks.nth(0)).toHaveText('<b>+++</b>');
  await expect(blocks.nth(1)).toHaveText('plain <i>x</i>');
  await expect(page.locator('#note-rendered pre .token')).toHaveCount(0);
  await expect(page.locator('#note-rendered pre b, #note-rendered pre i')).toHaveCount(0);
});

test('the share viewer highlights code with the same bundle', async ({ page }) => {
  await gotoApp(page);
  await page.goto('/share.html');
  await page.waitForFunction(() => !!window.ScratchpadMarkdown && !!window.Prism);
  const result = await page.evaluate(() => {
    const body = document.getElementById('share-body');
    window.ScratchpadMarkdown.renderMarkdownInto(body, '```sql\nSELECT 1;\n```');
    const keyword = body.querySelector('.token.keyword');
    return { manual: window.Prism.manual, keyword: keyword && keyword.textContent, color: keyword && getComputedStyle(keyword).color };
  });
  expect(result.manual).toBe(true);
  expect(result.keyword).toBe('SELECT');
  expect(result.color).not.toBe('');
});

test('the vendored bundle is small and names its version', async () => {
  const file = path.join(__dirname, '..', 'public', 'js', 'vendor', 'prism.min.js');
  expect(fs.statSync(file).size).toBeLessThan(40000);
  expect(fs.readFileSync(file, 'utf8').slice(0, 300)).toContain('PrismJS 1.30.0');
});
```

- [ ] **Step 2: Run** the spec — expect FAIL (no bundle, no spans).

- [ ] **Step 3: Assemble the bundle** from the npm tarball (already
  extracted under the session scratchpad, or `npm pack prismjs@1.30.0`):

```bash
{
  printf '/* PrismJS 1.30.0 (MIT, https://prismjs.com) — core + markup, css, clike, javascript, typescript, json, bash, python, sql, yaml. Assembled from the prismjs npm package components in dependency order; loaded with data-manual and driven by public/js/markdown.js. */\n'
  for f in core markup css clike javascript typescript json bash python sql yaml; do cat "components/prism-$f.min.js"; printf '\n'; done
} > /Users/vinnycarpenter/Projects/ScratchPad/public/js/vendor/prism.min.js
```

- [ ] **Step 4: Renderer.** In `markdown.js` next to `renderBlockquote` add:

```js
  function renderCode(token) {
    const lang = String(token.lang || '')
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();
    const prism = window.Prism;
    const grammar = lang && prism && prism.languages ? prism.languages[lang] : null;
    const inner = grammar ? prism.highlight(token.text, grammar, lang) : escapeHtml(token.text);
    const attr = lang ? ' class="language-' + escapeHtml(lang) + '"' : '';
    return '<pre><code' + attr + '>' + inner + '\n</code></pre>\n';
  }
```

and register `code: renderCode` in the same `marked.use` renderer object
as `blockquote`.

- [ ] **Step 5: Wiring.** Add
  `<script src="/public/js/vendor/prism.min.js" data-manual></script>` after
  `purify.min.js` in `index.html` and `share.html`; add
  `'/public/js/vendor/prism.min.js',` after `purify.min.js` in `APP_SHELL`;
  add to `scripts/check-vendor-versions.mjs`:

```js
  {
    name: 'Prism',
    npmPackage: 'prismjs',
    file: 'public/js/vendor/prism.min.js',
    versionPattern: /PrismJS ([0-9]+\.[0-9]+\.[0-9]+)/,
  },
```

- [ ] **Step 6: CSS** after the callout rules in `app.css`:

```css
/* Code tokens (Prism classes), colored from the palette only. */
.code-block .token.comment,
.code-block .token.prolog,
.code-block .token.doctype,
.code-block .token.cdata { color: var(--text-muted); font-style: italic; }
.code-block .token.punctuation { color: var(--text-secondary); }
.code-block .token.keyword,
.code-block .token.atrule,
.code-block .token.tag,
.code-block .token.selector,
.code-block .token.important { color: var(--accent-d); }
.code-block .token.function,
.code-block .token.class-name,
.code-block .token.property { color: var(--accent); }
.code-block .token.string,
.code-block .token.char,
.code-block .token.attr-value,
.code-block .token.regex { color: var(--success-text); }
.code-block .token.number,
.code-block .token.boolean,
.code-block .token.constant,
.code-block .token.symbol,
.code-block .token.attr-name { color: var(--warning-dark); }
.code-block .token.bold { font-weight: 600; }
.code-block .token.italic { font-style: italic; }
```

- [ ] **Step 7: Run** the spec plus sanitization, task-lists, wikilinks,
  share-viewer, typography, network-isolation, pwa specs on all browsers;
  `npm run check:shell && npm run check:vendor && npm run check:format && npm run check:structure`.
- [ ] **Step 8: Commit** `feat(markdown): prism syntax highlighting for fenced code`.

### Task 2: Docs, version, release

- [ ] Guide basics list: `<li><code>```js</code> … <code>```</code> for code blocks; JavaScript, TypeScript, HTML, CSS, JSON, shell, Python, SQL, and YAML are highlighted.</li>`; README Markdown bullet; `tests/README.md`. Commit `docs(guide): syntax highlighting`.
- [ ] Bump to 3.24.0; verify, suite, CSP hashes, dry run; commit
  `chore(release): v3.24.0 syntax highlighting`; update `tasks/todo.md`.
