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
