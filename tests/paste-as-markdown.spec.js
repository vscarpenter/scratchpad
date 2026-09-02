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
  expect(await convert(page, html)).toBe('a \\*b\\* \\[c\\] \\<d>\n\n\\# not heading\n\n2\\. not list\n\n\\- not item');
  expect(await convert(page, '')).toBe('');
});

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
      if (withFile) data.items.add(new File(['x'], 'notes.txt', { type: 'text/plain' }));
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      const readable = event.clipboardData && (!html || event.clipboardData.getData('text/html') === html);
      if (!readable) return 'unsupported';
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

test('plain-only, non-image file, and equal-text clipboards are left to the native paste', async ({ page }) => {
  await openEditor(page, 'Untouched');
  expect(await pasteInto(page, { text: 'just text' })).toBe('native');
  const withFile = await pasteInto(page, { html: '<p>x</p>', text: 'x', withFile: true });
  test.skip(withFile === 'unsupported', 'browser cannot construct a ClipboardEvent with a DataTransfer');
  expect(withFile).toBe('native');
  const equal = await pasteInto(page, { html: '<span style="color:red">  same   text </span>', text: 'same text' });
  expect(equal).toBe('native');
  await expect(page.locator('#note-editor')).toHaveValue('Untouched');
});

test('a converter failure leaves the native paste in charge', async ({ page }) => {
  await openEditor(page, 'Safe');
  await page.evaluate(() => {
    Object.defineProperty(window, 'ScratchpadHtmlToMarkdown', {
      value: {
        convert: () => {
          throw new Error('boom');
        },
      },
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

test('a real clipboard paste converts and undoes', async ({ page, context, browserName }) => {
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
});
