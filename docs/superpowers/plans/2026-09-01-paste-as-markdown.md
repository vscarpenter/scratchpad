# Paste as Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship paste-as-Markdown in the note editor
(`docs/superpowers/specs/2026-09-01-paste-as-markdown-design.md`) as v3.21.0.

**Architecture:** `public/js/html-to-markdown.js` is a pure converter over an
inert `DOMParser` document (`window.ScratchpadHtmlToMarkdown.convert`).
`public/js/paste.js` owns the editor's `paste` listener
(`window.ScratchpadPaste.bind`), decides when to stand aside, and inserts
with `execCommand('insertText')` falling back to `setRangeText`. app.js
calls `bind` once at boot and changes by zero net lines.

**Tech Stack:** Vanilla browser JavaScript, Playwright on Chromium, Firefox,
and WebKit, Biome, `tsc` strict on the two new modules.

**Spec:** `docs/superpowers/specs/2026-09-01-paste-as-markdown-design.md`

## Global Constraints

- Zero network; `tests/network-isolation.spec.js` untouched. The converter
  parses with `DOMParser`, which never loads subresources.
- No inline `<script>` edits, so CSP hashes stay byte-identical.
- Both modules carry `// @ts-check`, join `jsconfig.json` `include`, stay
  under 400 lines with functions under 40 lines and nesting at most 3, and
  are Biome-clean (2-space, 120 columns, single quotes, trailing commas).
- Both modules are added to `APP_SHELL` in `public/service-worker.js` and to
  the script order in `index.html` before `app.js`.
- `app.js` is at its 6204-line ceiling as the ratchet counts (`wc -l` 6203):
  the one `bind` call must be offset by removing one line.
- Never set `innerHTML`; the pre-commit hook rejects it. `DOMParser` is the
  only parser used.
- Tests are top-level `test(...)` calls under 40 lines each. Run one spec
  with `npx playwright test tests/paste-as-markdown.spec.js --reporter=line`.
- Commits: Conventional Commits with a scope and the `Claude-Session:`
  trailer, one per task.

---

### Task 1: The converter module

**Files:**
- Create: `public/js/html-to-markdown.js`
- Modify: `index.html` (script tag before `/public/js/app.js`),
  `public/service-worker.js` (`APP_SHELL`), `jsconfig.json` (`include`)
- Test: `tests/paste-as-markdown.spec.js` (create)

**Interfaces:**
- Consumes: nothing from the app; only `DOMParser` and DOM APIs.
- Produces: `window.ScratchpadHtmlToMarkdown.convert(html: string): string`.
  Task 2 calls it from the paste handler.

- [ ] **Step 1: Write the failing converter tests** in
  `tests/paste-as-markdown.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote } = require('./helpers');

async function convert(page, html) {
  return page.evaluate((source) => window.ScratchpadHtmlToMarkdown.convert(source), html);
}

test('converts headings, paragraphs, containers, and hard breaks', async ({ page }) => {
  await gotoApp(page);
  const html = '<h1>Title</h1><p>One<br>two</p><div>Three</div><section><article><p>Deep</p></article></section>';
  expect(await convert(page, html)).toBe('# Title\n\nOne  \ntwo\n\nThree\n\nDeep');
});

test('converts emphasis, inline code, and word-processor styles', async ({ page }) => {
  await gotoApp(page);
  const plain = '<p><strong>b</strong> <em>i</em> <s>s</s> <code>a`b</code></p>';
  expect(await convert(page, plain)).toBe('**b** *i* ~~s~~ ``a`b``');
  const docs =
    '<b style="font-weight:normal" id="docs-internal-guid-1"><p><span style="font-weight:700">Bold</span> ' +
    '<span style="font-style:italic">it</span> <span style="text-decoration:line-through">gone</span></p></b>';
  expect(await convert(page, docs)).toBe('**Bold** *it* ~~gone~~');
  expect(await convert(page, '<p><b><b>once</b></b></p>')).toBe('**once**');
});

test('keeps safe links, drops unsafe ones, and reduces images to alt text', async ({ page }) => {
  await gotoApp(page);
  const html =
    '<p><a href="https://x.y/a b">Go</a> <a href="javascript:alert(1)">no</a> ' +
    '<a href="mailto:a@b.c">mail</a> <img alt="Pic" src="https://x/y.png"><img alt="" src="https://x/z.png"></p>';
  expect(await convert(page, html)).toBe('[Go](https://x.y/a%20b) no [mail](mailto:a@b.c) Pic');
});

test('converts fenced code with a language and keeps the text verbatim', async ({ page }) => {
  await gotoApp(page);
  const html = '<pre><code class="language-js">const a = 1;\n  *b*\n</code></pre>';
  expect(await convert(page, html)).toBe('```js\nconst a = 1;\n  *b*\n```');
  expect(await convert(page, '<pre>has ``` inside</pre>')).toBe('````\nhas ``` inside\n````');
});

test('converts nested, ordered, and task lists', async ({ page }) => {
  await gotoApp(page);
  const html =
    '<ul><li>a<ul><li>b</li></ul></li><li><input type="checkbox" checked> done</li>' +
    '<li><input type="checkbox"> open</li></ul><ol start="3"><li>x</li><li>y</li></ol>';
  expect(await convert(page, html)).toBe('- a\n  - b\n- [x] done\n- [ ] open\n\n3. x\n4. y');
  const docs = '<ul><li><p>one</p></li><ul><li><p>two</p></li></ul></ul>';
  expect(await convert(page, docs)).toBe('- one\n  - two');
});

test('converts quotes, rules, and tables', async ({ page }) => {
  await gotoApp(page);
  expect(await convert(page, '<blockquote><p>q1</p><p>q2</p></blockquote><hr>')).toBe('> q1\n>\n> q2\n\n---');
  const table = '<table><tr><th>A</th><th>B|C</th></tr><tr><td>1</td><td>2</td></tr></table>';
  expect(await convert(page, table)).toBe('| A | B\\|C |\n| --- | --- |\n| 1 | 2 |');
});

test('drops scripts and styles, collapses whitespace, and escapes markdown syntax', async ({ page }) => {
  await gotoApp(page);
  const html =
    '<script>x()</script><style>p{}</style><p>  a   *b*  [c]  &lt;d&gt; </p>' +
    '<p># not heading</p><p>2. not list</p><p>- not item</p>';
  expect(await convert(page, html)).toBe(
    'a \\*b\\* \\[c\\] \\<d>\n\n\\# not heading\n\n2\\. not list\n\n\\- not item',
  );
  expect(await convert(page, '')).toBe('');
});
```

- [ ] **Step 2: Run** `npx playwright test tests/paste-as-markdown.spec.js --reporter=line`
  — expect FAIL on every test: `window.ScratchpadHtmlToMarkdown` is undefined.

- [ ] **Step 3: Create `public/js/html-to-markdown.js`** with this content:

```js
// @ts-check
/* HTML clipboard to Markdown. Walks an inert DOMParser document and never touches the page. */
{
  ('use strict');

  /** @typedef {{ bold: boolean, italic: boolean, strike: boolean }} Marks */

  const DROPPED = new Set([
    'script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'template', 'svg', 'math', 'iframe',
    'object', 'embed', 'video', 'audio', 'canvas', 'select', 'textarea', 'button', 'input',
  ]);
  const BLOCKS = new Set([
    'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
    'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol',
    'p', 'pre', 'section', 'summary', 'table', 'ul',
  ]);
  /** @type {Marks} */
  const NO_MARKS = Object.freeze({ bold: false, italic: false, strike: false });

  /** @param {Element} el */
  function tag(el) {
    return el.tagName.toLowerCase();
  }

  /** @param {Node} node */
  function isBlock(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = /** @type {Element} */ (node);
    return BLOCKS.has(tag(el)) || hasBlockChild(el);
  }

  /** @param {Element} el */
  function hasBlockChild(el) {
    return Array.from(el.childNodes).some(isBlock);
  }

  /** @param {string} text */
  function escapeText(text) {
    return text.replace(/[\\*_`[\]<]/g, '\\$&');
  }

  /** @param {string} line */
  function escapeLineStart(line) {
    return line.replace(/^ +/, '').replace(/^(#|>|\+|-|\d+\.)(?=\s|$)/, '\\$1');
  }

  /** @param {string} text @param {string} indent */
  function indentLines(text, indent) {
    return text
      .split('\n')
      .map((line) => (line ? indent + line : line))
      .join('\n');
  }

  /** @param {Element} el @returns {Partial<Marks>} */
  function styleMarks(el) {
    const style = (el.getAttribute('style') || '').toLowerCase();
    /** @type {Partial<Marks>} */
    const marks = {};
    const weight = /font-weight\s*:\s*([a-z0-9]+)/.exec(style);
    if (weight) marks.bold = weight[1] === 'bold' || weight[1] === 'bolder' || Number(weight[1]) >= 600;
    const slant = /font-style\s*:\s*([a-z]+)/.exec(style);
    if (slant) marks.italic = slant[1] === 'italic' || slant[1] === 'oblique';
    if (/text-decoration[a-z-]*\s*:[^;]*line-through/.test(style)) marks.strike = true;
    return marks;
  }

  /** @param {Element} el @returns {Marks} */
  function elementMarks(el) {
    const name = tag(el);
    const own = styleMarks(el);
    return {
      bold: own.bold !== undefined ? own.bold : name === 'b' || name === 'strong',
      italic: own.italic !== undefined ? own.italic : name === 'i' || name === 'em',
      strike: own.strike === true || name === 's' || name === 'strike' || name === 'del',
    };
  }

  /** @param {string} text @param {string} marker */
  function wrap(text, marker) {
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (!match || !match[2]) return text;
    return match[1] + marker + match[2] + marker + match[3];
  }

  /** @param {string} text */
  function inlineCode(text) {
    const longest = (text.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 0);
    const fence = '`'.repeat(longest + 1);
    const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
    return fence + pad + text + pad + fence;
  }

  /** @param {Element} el @param {Marks} marks */
  function renderLink(el, marks) {
    const text = renderInlineChildren(el, marks).trim();
    const href = (el.getAttribute('href') || '').trim();
    if (!/^(?:https?:|mailto:)/i.test(href)) return text;
    const target = href.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
    return text ? '[' + text + '](' + target + ')' : target;
  }

  /** @param {Element} el @param {Marks} marks */
  function renderInlineElement(el, marks) {
    const name = tag(el);
    if (DROPPED.has(name)) return '';
    if (name === 'br') return '  \n';
    if (name === 'img') return escapeText((el.getAttribute('alt') || '').trim());
    if (name === 'a') return renderLink(el, marks);
    if (name === 'code' || name === 'kbd' || name === 'samp') return inlineCode(el.textContent || '');
    const own = elementMarks(el);
    const next = { bold: marks.bold || own.bold, italic: marks.italic || own.italic, strike: marks.strike || own.strike };
    let text = renderInlineChildren(el, next);
    if (own.bold && !marks.bold) text = wrap(text, '**');
    if (own.italic && !marks.italic) text = wrap(text, '*');
    if (own.strike && !marks.strike) text = wrap(text, '~~');
    return text;
  }

  /** @param {Node} node @param {Marks} marks */
  function renderInlineNode(node, marks) {
    if (node.nodeType === Node.TEXT_NODE) return escapeText((node.textContent || '').replace(/\s+/g, ' '));
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = /** @type {Element} */ (node);
    return isBlock(el) ? renderBlock(el) : renderInlineElement(el, marks);
  }

  /** @param {Element} el @param {Marks} marks */
  function renderInlineChildren(el, marks) {
    let out = '';
    for (const child of Array.from(el.childNodes)) out += renderInlineNode(child, marks);
    return out;
  }

  /** @param {string} inline */
  function paragraph(inline) {
    const text = inline.replace(/^[ \t\n]+|[ \t\n]+$/g, '');
    if (!text) return '';
    return text.split('\n').map(escapeLineStart).join('\n');
  }

  /** @param {Element} el */
  function renderHeading(el) {
    const level = Number(tag(el).slice(1));
    const text = paragraph(renderInlineChildren(el, NO_MARKS)).replace(/ {2}\n|\n/g, ' ');
    return text ? '#'.repeat(level) + ' ' + text : '';
  }

  /** @param {Element} el */
  function renderPre(el) {
    const code = el.querySelector('code');
    const classes = (el.getAttribute('class') || '') + ' ' + (code ? code.getAttribute('class') || '' : '');
    const lang = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/.exec(classes);
    const text = (el.textContent || '').replace(/\n$/, '');
    const fence = text.includes('```') ? '````' : '```';
    return fence + (lang ? lang[1] : '') + '\n' + text + '\n' + fence;
  }

  /** @param {Element} li @param {string} prefix */
  function renderItem(li, prefix) {
    const checkbox = li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]');
    const marker = checkbox ? prefix + (checkbox.hasAttribute('checked') ? '[x] ' : '[ ] ') : prefix;
    const body = renderBlocks(li, '\n');
    return marker + indentLines(body, ' '.repeat(prefix.length)).replace(/^ +/, '');
  }

  /** @param {Element} el @param {boolean} ordered */
  function renderList(el, ordered) {
    const start = Number(el.getAttribute('start')) || 1;
    let index = 0;
    /** @type {string[]} */
    const parts = [];
    for (const child of Array.from(el.children)) {
      const name = tag(child);
      if (name === 'li') {
        parts.push(renderItem(child, ordered ? String(start + index) + '. ' : '- '));
        index += 1;
      } else if (name === 'ul' || name === 'ol') {
        parts.push(indentLines(renderList(child, name === 'ol'), '  '));
      }
    }
    return parts.filter(Boolean).join('\n');
  }

  /** @param {Element} el */
  function renderQuote(el) {
    return renderBlocks(el, '\n\n')
      .split('\n')
      .map((line) => (line ? '> ' + line : '>'))
      .join('\n');
  }

  /** @param {Element} cell */
  function cellText(cell) {
    return paragraph(renderInlineChildren(cell, NO_MARKS))
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\|/g, '\\|');
  }

  /** @param {Element} el */
  function renderTable(el) {
    const rows = Array.from(el.querySelectorAll('tr')).filter((row) => row.closest('table') === el);
    if (!rows.length) return '';
    const grid = rows.map((row) => Array.from(row.children).filter((c) => /^t[dh]$/.test(tag(c))).map(cellText));
    const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
    /** @param {string[]} cells */
    const line = (cells) => '| ' + Array.from({ length: width }, (_, i) => cells[i] || '').join(' | ') + ' |';
    const separator = '| ' + Array.from({ length: width }, () => '---').join(' | ') + ' |';
    return [line(grid[0]), separator, ...grid.slice(1).map(line)].join('\n');
  }

  /** @param {Element} el */
  function renderBlock(el) {
    const name = tag(el);
    if (DROPPED.has(name)) return '';
    if (/^h[1-6]$/.test(name)) return renderHeading(el);
    if (name === 'pre') return renderPre(el);
    if (name === 'ul' || name === 'ol') return renderList(el, name === 'ol');
    if (name === 'blockquote') return renderQuote(el);
    if (name === 'hr') return '---';
    if (name === 'table') return renderTable(el);
    if (hasBlockChild(el)) return renderBlocks(el, '\n\n');
    return paragraph(renderInlineChildren(el, NO_MARKS));
  }

  /** @param {Element} container @param {string} separator */
  function renderBlocks(container, separator) {
    /** @type {string[]} */
    const blocks = [];
    let run = '';
    for (const child of Array.from(container.childNodes)) {
      if (!isBlock(child)) {
        run += renderInlineNode(child, NO_MARKS);
        continue;
      }
      blocks.push(paragraph(run), renderBlock(/** @type {Element} */ (child)));
      run = '';
    }
    blocks.push(paragraph(run));
    return blocks.filter(Boolean).join(separator);
  }

  /** @param {string} html */
  function convert(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return renderBlocks(doc.body, '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** @type {Window & typeof globalThis & { ScratchpadHtmlToMarkdown?: { convert(html: string): string } }} */
  const root = window;
  root.ScratchpadHtmlToMarkdown = Object.freeze({ convert });
}
```

- [ ] **Step 4: Register the module.** Add
  `<script src="/public/js/html-to-markdown.js"></script>` to `index.html`
  after the `find-replace.js` tag; add `'/public/js/html-to-markdown.js',`
  to `APP_SHELL` in `public/service-worker.js` after `find-replace.js`; add
  `"public/js/html-to-markdown.js",` to the `include` array in
  `jsconfig.json`.

- [ ] **Step 5: Run** the spec — expect PASS on all three browsers. Then
  `npm run check:types && npm run check:structure && npm run check:shell`
  — expect green (file under 400 lines, functions under 40).

- [ ] **Step 6: Commit**

```bash
git add public/js/html-to-markdown.js index.html public/service-worker.js jsconfig.json tests/paste-as-markdown.spec.js
git commit -m "feat(editor): html to markdown converter over an inert DOMParser document"
```

---

### Task 2: The paste handler, its wiring, and end-to-end clipboard proof

**Files:**
- Create: `public/js/paste.js`
- Modify: `public/js/app.js:6181-6183` (boot wiring), `index.html` (script
  tag), `public/service-worker.js` (`APP_SHELL`), `jsconfig.json`
- Test: `tests/paste-as-markdown.spec.js` (append)

**Interfaces:**
- Consumes: `window.ScratchpadHtmlToMarkdown.convert(html)` from Task 1;
  `#note-editor` textarea; `#dirty-indicator`.
- Produces: `window.ScratchpadPaste.bind(editor: HTMLTextAreaElement): void`.

- [ ] **Step 1: Append the failing handler tests:**

```js
async function openEditor(page, body) {
  await gotoApp(page);
  await createAndSaveNote(page, 'Paste target', body);
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').focus();
  await page.evaluate(() => {
    const editor = /** @type {HTMLTextAreaElement} */ (document.getElementById('note-editor'));
    editor.setSelectionRange(editor.value.length, editor.value.length);
  });
}

function pasteInto(page, payload) {
  return page.evaluate(({ html, text, withFile }) => {
    try {
      const editor = document.getElementById('note-editor');
      const data = new DataTransfer();
      if (html) data.setData('text/html', html);
      if (text) data.setData('text/plain', text);
      if (withFile) data.items.add(new File(['x'], 'x.png', { type: 'image/png' }));
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
      return event.defaultPrevented ? 'converted' : 'native';
    } catch (error) {
      return 'unsupported';
    }
  }, payload);
}

test('an html paste is inserted as markdown at the caret and dirties the note', async ({ page }) => {
  await openEditor(page, 'Start. ');
  const result = await pasteInto(page, { html: '<p>Hello <b>world</b></p>', text: 'Hello world' });
  test.skip(result === 'unsupported', 'browser cannot construct a ClipboardEvent with a DataTransfer');
  expect(result).toBe('converted');
  await expect(page.locator('#note-editor')).toHaveValue('Start. Hello **world**');
  await expect(page.locator('#dirty-indicator')).toBeVisible();
  const caret = await page.evaluate(() => document.getElementById('note-editor').selectionStart);
  expect(caret).toBe('Start. Hello **world**'.length);
});

test('a selection is replaced by the converted markdown', async ({ page }) => {
  await openEditor(page, 'keep REPLACE keep');
  await page.evaluate(() => document.getElementById('note-editor').setSelectionRange(5, 12));
  const result = await pasteInto(page, { html: '<em>new</em>', text: 'new' });
  test.skip(result === 'unsupported', 'browser cannot construct a ClipboardEvent with a DataTransfer');
  await expect(page.locator('#note-editor')).toHaveValue('keep *new* keep');
});

test('plain-only, file, and equal-text clipboards are left to the native paste', async ({ page }) => {
  await openEditor(page, 'Untouched');
  const plain = await pasteInto(page, { text: 'just text' });
  test.skip(plain === 'unsupported', 'browser cannot construct a ClipboardEvent with a DataTransfer');
  expect(plain).toBe('native');
  expect(await pasteInto(page, { html: '<p>x</p>', text: 'x', withFile: true })).toBe('native');
  expect(await pasteInto(page, { html: '<span style="color:red">  same   text </span>', text: 'same text' })).toBe(
    'native',
  );
  await expect(page.locator('#note-editor')).toHaveValue('Untouched');
});

test('a converter failure leaves the native paste in charge', async ({ page }) => {
  await openEditor(page, 'Safe');
  await page.evaluate(() => {
    Object.defineProperty(window, 'ScratchpadHtmlToMarkdown', {
      value: { convert: () => { throw new Error('boom'); } },
      configurable: true,
    });
  });
  const result = await pasteInto(page, { html: '<p>x</p>', text: 'y' });
  test.skip(result === 'unsupported', 'browser cannot construct a ClipboardEvent with a DataTransfer');
  expect(result).toBe('native');
  await expect(page.locator('#note-editor')).toHaveValue('Safe');
});

test('pasting a remote image and link causes no network request', async ({ page }) => {
  await openEditor(page, 'Quiet');
  const requests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) requests.push(url);
  });
  const result = await pasteInto(page, {
    html: '<p><a href="https://example.invalid/page">link</a> <img alt="pic" src="https://example.invalid/i.png"></p>',
    text: 'link',
  });
  test.skip(result === 'unsupported', 'browser cannot construct a ClipboardEvent with a DataTransfer');
  await expect(page.locator('#note-editor')).toHaveValue('Quiet[link](https://example.invalid/page) pic');
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
});

test('a real clipboard paste converts, undoes, and bypasses with shift', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions and paste shortcuts are only scriptable in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openEditor(page, 'Real: ');
  await page.evaluate(async () => {
    const item = new ClipboardItem({
      'text/html': new Blob(['<p>Hi <strong>there</strong></p>'], { type: 'text/html' }),
      'text/plain': new Blob(['Hi there'], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
  });
  await page.locator('#note-editor').focus();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.locator('#note-editor')).toHaveValue('Real: Hi **there**');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#note-editor')).toHaveValue('Real: ');
  await page.keyboard.press('ControlOrMeta+Shift+v');
  await expect(page.locator('#note-editor')).toHaveValue('Real: Hi there');
});
```

- [ ] **Step 2: Run** the spec — expect the new tests to FAIL: nothing
  handles `paste`, so `defaultPrevented` is false and values stay unchanged.

- [ ] **Step 3: Create `public/js/paste.js`:**

```js
// @ts-check
/* Paste as Markdown: converts text/html clipboard payloads before they enter the note editor. */
{
  ('use strict');

  /** @typedef {{ convert(html: string): string }} Converter */

  /** @type {Window & typeof globalThis & { ScratchpadHtmlToMarkdown?: Converter, ScratchpadPaste?: { bind(editor: HTMLTextAreaElement): void } }} */
  const root = window;

  /** @param {string} text */
  function collapse(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** @param {DataTransfer} data @returns {string | null} */
  function markdownFor(data) {
    if (data.files && data.files.length) return null;
    const html = data.getData('text/html');
    const converter = root.ScratchpadHtmlToMarkdown;
    if (!html || !converter) return null;
    const markdown = converter.convert(html);
    if (!markdown || collapse(markdown) === collapse(data.getData('text/plain'))) return null;
    return markdown;
  }

  /** @param {HTMLTextAreaElement} editor @param {string} text */
  function insert(editor, text) {
    editor.focus();
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch (_error) {
      inserted = false;
    }
    if (inserted) return;
    editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** @param {ClipboardEvent} event @param {HTMLTextAreaElement} editor */
  function onPaste(event, editor) {
    const data = event.clipboardData;
    if (!data) return;
    let markdown = null;
    try {
      markdown = markdownFor(data);
    } catch (_error) {
      return;
    }
    if (markdown === null) return;
    event.preventDefault();
    insert(editor, markdown);
  }

  /** @param {HTMLTextAreaElement} editor */
  function bind(editor) {
    editor.addEventListener('paste', (event) => onPaste(event, editor));
  }

  root.ScratchpadPaste = Object.freeze({ bind });
}
```

- [ ] **Step 4: Wire and register.** In `app.js` replace

```js
    if (window.ScratchpadFind) {
      window.ScratchpadFind.init({ editor: els.editor, onToast: toast });
    }
```

with

```js
    if (window.ScratchpadFind) window.ScratchpadFind.init({ editor: els.editor, onToast: toast });
    if (window.ScratchpadPaste) window.ScratchpadPaste.bind(els.editor);
```

(net minus one line, so app.js ends at 6203 as the ratchet counts). Add
`<script src="/public/js/paste.js"></script>` after the
`html-to-markdown.js` tag in `index.html`, `'/public/js/paste.js',` after it
in `APP_SHELL`, and `"public/js/paste.js",` in `jsconfig.json`.

- [ ] **Step 5: Run** the spec on all browsers — expect PASS, with the
  synthetic-event tests either passing or skipping with the visible reason
  on browsers that cannot construct the event. If the Chromium
  `ControlOrMeta+Shift+v` step does not deliver a plain paste in headless
  mode, drop that final press and assertion from the test, keep the
  convert-and-undo part, and record the bypass as a manual check in the
  release notes. Then `npm run check:types && npm run check:structure && npm run check:shell`.

- [ ] **Step 6: Commit**

```bash
git add public/js/paste.js public/js/app.js index.html public/service-worker.js jsconfig.json tests/paste-as-markdown.spec.js
git commit -m "feat(editor): paste html as markdown with native undo"
```

---

### Task 3: Documentation, version bump, and release verification

**Files:**
- Modify: `guide.html` (`#markdown` section at 106-121 and the shortcuts
  table at 474-491), `README.md` (Markdown feature bullet at 30-31 and the
  shortcut table at 247-258), `tests/README.md` (create/edit row),
  `public/js/version.js`

- [ ] **Step 1: Guide.** At the end of the `#markdown` section (before the
  `#task-lists` heading) add:

```html
      <p>
        Paste from a web page, a Google Doc, a Word file, or an email and it arrives as Markdown:
        headings, emphasis, links, lists, code, quotes, and tables convert on the way in, and
        <kbd class="kbd">⌘/Ctrl</kbd> <kbd class="kbd">Z</kbd> undoes the paste as usual. Press
        <kbd class="kbd">⌘/Ctrl</kbd> <kbd class="kbd">Shift</kbd> <kbd class="kbd">V</kbd> to
        paste the plain text instead. Text copied from a code editor is left exactly as it was.
      </p>
```

Add a shortcuts row after the `⌘/Ctrl F` row:

```html
          <tr><td><kbd class="kbd">⌘/Ctrl</kbd> <kbd class="kbd">Shift</kbd> <kbd class="kbd">V</kbd></td><td>Paste as plain text instead of Markdown</td></tr>
```

- [ ] **Step 2: README and test map.** Extend the first feature bullet to
  "Write and preview Markdown with formatting shortcuts, autosaved drafts,
  the last 10 saved revisions per note, and rich-text pastes converted to
  Markdown on the way in." Add the shortcut row
  ``| `⌘/Ctrl` + `Shift` + `V` | Paste as plain text (while editing) |``
  after the find-and-replace row. In `tests/README.md` add
  `paste-as-markdown.spec.js` to the "Create, edit, save, format, pin,
  delete, restore, and empty states" row.

- [ ] **Step 3: Run** `npx playwright test tests/guide.spec.js tests/static-pages.spec.js --reporter=line`
  — expect PASS.

- [ ] **Step 4: Commit**

```bash
git add guide.html README.md tests/README.md
git commit -m "docs(guide): paste as markdown and the plain-text paste shortcut"
```

- [ ] **Step 5: Version bump** to `3.21.0`, build date `2026-09-01`.

- [ ] **Step 6: Full verification**, recording each result:

```bash
npm run verify
npm test
bash cloudfront/recompute-csp-hashes.sh
./deploy.sh --dry-run
```

Expected: verify green with coverage at or above 36.2%; the suite green on
three browsers; hashes unchanged; the dry run lists `html-to-markdown.js`,
`paste.js`, `service-worker.js`, `app.js`, `version.js`, and the shells.

- [ ] **Step 7: Release commit**

```bash
git add public/js/version.js
git commit -m "chore(release): v3.21.0 paste as markdown"
```

- [ ] **Step 8: Handoff.** Rewrite `tasks/todo.md` for the v3.21 round with
  a "Resuming From Here" block and tick the v3.21 line in the release train.
  Deploy only on an explicit "yes, deploy".
