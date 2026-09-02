// @ts-check
/* HTML clipboard to Markdown. Walks an inert DOMParser document and never touches the page. */
{
  ('use strict');

  /** @typedef {{ bold: boolean, italic: boolean, strike: boolean }} Marks */

  const DROPPED = new Set(
    'script style head title meta link noscript template svg math iframe object embed video audio canvas select textarea button input'.split(
      ' ',
    ),
  );
  const BLOCKS = new Set(
    'address article aside blockquote dd details div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section summary table ul'.split(
      ' ',
    ),
  );
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
    return line
      .replace(/^ +/, '')
      .replace(/^([#>+-])(?=\s|$)/, '\\$1')
      .replace(/^(\d+)\.(?=\s|$)/, '$1\\.');
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
    const next = {
      bold: marks.bold || own.bold,
      italic: marks.italic || own.italic,
      strike: marks.strike || own.strike,
    };
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
    const grid = rows.map((row) =>
      Array.from(row.children)
        .filter((c) => /^t[dh]$/.test(tag(c)))
        .map(cellText),
    );
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
