// @ts-check
/* Revision comparison for the History dialog. A row compares its snapshot
   with the current saved note, so removed lines are what Restore would take
   away and added lines are what it would bring back. Pure diff first, DOM
   second; nothing here reads app state or the network. */
'use strict';
{
  /** @typedef {{ title?: string, body?: string, tags?: string[], pinned?: boolean }} Snapshot */
  /** @typedef {'same' | 'added' | 'removed'} DiffKind */
  /** @typedef {{ kind: DiffKind, lines: string[] }} Hunk */
  /** @typedef {{ kind: DiffKind, text: string }} WordToken */
  /** @typedef {{ coarse: boolean, hunks: Hunk[] }} LineDiff */
  /** @typedef {{ coarse: boolean, tokens: WordToken[] }} WordDiff */
  /** @typedef {{ unsaved?: boolean }} RenderOptions */
  /** @typedef {Window & typeof globalThis & { ScratchpadRevisionDiff?: object }} DiffWindow */

  /** Above this many table cells the middle renders as two whole blocks. */
  const CELL_CAP = 4000000;
  const CONTEXT = 2;

  /** @param {Snapshot} rev */
  function snapshotText(rev) {
    const title = String(rev.title || '').trim();
    const body = String(rev.body || '');
    return title ? title + '\n\n' + body : body;
  }

  /** @param {string[]} before @param {string[]} after */
  function commonPrefix(before, after) {
    const limit = Math.min(before.length, after.length);
    let count = 0;
    while (count < limit && before[count] === after[count]) count += 1;
    return count;
  }

  /** @param {string[]} before @param {string[]} after @param {number} prefix */
  function commonSuffix(before, after, prefix) {
    const limit = Math.min(before.length, after.length) - prefix;
    let count = 0;
    while (count < limit && before[before.length - 1 - count] === after[after.length - 1 - count]) count += 1;
    return count;
  }

  /** @param {string[]} a @param {string[]} b */
  function lcsTable(a, b) {
    const width = b.length + 1;
    const table = new Uint32Array((a.length + 1) * width);
    for (let row = a.length - 1; row >= 0; row -= 1) {
      for (let column = b.length - 1; column >= 0; column -= 1) {
        const index = row * width + column;
        table[index] =
          a[row] === b[column] ? table[index + width + 1] + 1 : Math.max(table[index + width], table[index + 1]);
      }
    }
    return table;
  }

  /** @param {{ kind: DiffKind, items: string[] }[]} runs @param {DiffKind} kind @param {string} item */
  function pushRun(runs, kind, item) {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.items.push(item);
    else runs.push({ kind, items: [item] });
  }

  /** @param {string[]} a @param {string[]} b @returns {{ kind: DiffKind, items: string[] }[]} */
  function backtrack(a, b) {
    const table = lcsTable(a, b);
    const width = b.length + 1;
    /** @type {{ kind: DiffKind, items: string[] }[]} */
    const runs = [];
    let row = 0;
    let column = 0;
    while (row < a.length && column < b.length) {
      if (a[row] === b[column]) {
        pushRun(runs, 'same', a[row]);
        row += 1;
        column += 1;
      } else if (table[(row + 1) * width + column] >= table[row * width + column + 1]) {
        pushRun(runs, 'removed', a[row]);
        row += 1;
      } else {
        pushRun(runs, 'added', b[column]);
        column += 1;
      }
    }
    for (; row < a.length; row += 1) pushRun(runs, 'removed', a[row]);
    for (; column < b.length; column += 1) pushRun(runs, 'added', b[column]);
    return runs;
  }

  /** @param {string[]} before @param {string[]} after @returns {{ coarse: boolean, runs: { kind: DiffKind, items: string[] }[] }} */
  function diffSequence(before, after) {
    const prefix = commonPrefix(before, after);
    const suffix = commonSuffix(before, after, prefix);
    const a = before.slice(prefix, before.length - suffix);
    const b = after.slice(prefix, after.length - suffix);
    const coarse = a.length * b.length > CELL_CAP;
    /** @type {{ kind: DiffKind, items: string[] }[]} */
    const runs = [];
    if (prefix) runs.push({ kind: 'same', items: before.slice(0, prefix) });
    if (coarse) {
      if (a.length) runs.push({ kind: 'removed', items: a });
      if (b.length) runs.push({ kind: 'added', items: b });
    } else {
      for (const run of backtrack(a, b)) pushRunAll(runs, run);
    }
    if (suffix) pushRunAll(runs, { kind: 'same', items: before.slice(before.length - suffix) });
    return { coarse, runs };
  }

  /** @param {{ kind: DiffKind, items: string[] }[]} runs @param {{ kind: DiffKind, items: string[] }} run */
  function pushRunAll(runs, run) {
    for (const item of run.items) pushRun(runs, run.kind, item);
  }

  /** @param {string} before @param {string} after @returns {LineDiff} */
  function diffLines(before, after) {
    const split = (/** @type {string} */ text) => String(text || '').split(/\r?\n/);
    const { coarse, runs } = diffSequence(split(before), split(after));
    return { coarse, hunks: runs.map((run) => ({ kind: run.kind, lines: run.items })) };
  }

  /** @param {string} before @param {string} after @returns {WordDiff} */
  function diffWords(before, after) {
    const split = (/** @type {string} */ text) =>
      String(text || '')
        .split(/(\s+)/)
        .filter(Boolean);
    const { coarse, runs } = diffSequence(split(before), split(after));
    return { coarse, tokens: runs.map((run) => ({ kind: run.kind, text: run.items.join('') })) };
  }

  /** @param {string} tag @param {string} className @param {string} [text] */
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** @param {DiffKind} kind */
  function lineElement(kind) {
    const tag = kind === 'added' ? 'ins' : kind === 'removed' ? 'del' : 'div';
    const line = element(tag, 'history-diff-line is-' + kind);
    const glyph = element('span', 'history-diff-glyph', kind === 'added' ? '+' : kind === 'removed' ? '−' : ' ');
    glyph.setAttribute('aria-hidden', 'true');
    line.append(glyph);
    return line;
  }

  /** @param {DiffKind} kind @param {string} text */
  function plainLine(kind, text) {
    const line = lineElement(kind);
    line.append(element('span', 'history-diff-text', text));
    return line;
  }

  /** @param {DiffKind} kind @param {WordToken[]} tokens */
  function wordLine(kind, tokens) {
    const line = lineElement(kind);
    const text = element('span', 'history-diff-text');
    for (const token of tokens) {
      if (token.kind === 'same') text.append(token.text);
      else if (token.kind === kind) text.append(element('span', 'history-diff-word', token.text));
    }
    line.append(text);
    return line;
  }

  /** @param {number} count */
  function gapElement(count) {
    return element('div', 'history-diff-gap', count + (count === 1 ? ' unchanged line' : ' unchanged lines'));
  }

  /** @param {HTMLElement} box @param {string[]} lines @param {boolean} first @param {boolean} last */
  function appendContext(box, lines, first, last) {
    const head = first ? 0 : Math.min(CONTEXT, lines.length);
    const tail = last ? 0 : Math.min(CONTEXT, lines.length - head);
    const hidden = lines.length - head - tail;
    if (hidden <= 1) {
      for (const line of lines) box.append(plainLine('same', line));
      return;
    }
    for (const line of lines.slice(0, head)) box.append(plainLine('same', line));
    box.append(gapElement(hidden));
    for (const line of lines.slice(lines.length - tail)) box.append(plainLine('same', line));
  }

  /** @param {Hunk} hunk @param {Hunk | undefined} next */
  function isWordPair(hunk, next) {
    return (
      hunk.kind === 'removed' && hunk.lines.length === 1 && !!next && next.kind === 'added' && next.lines.length === 1
    );
  }

  /** @param {HTMLElement} box @param {string} removed @param {string} added */
  function appendWordPair(box, removed, added) {
    const words = diffWords(removed, added);
    if (words.coarse) {
      box.append(plainLine('removed', removed), plainLine('added', added));
      return;
    }
    box.append(wordLine('removed', words.tokens), wordLine('added', words.tokens));
  }

  /** @param {HTMLElement} box @param {Hunk} hunk @param {Hunk | undefined} next @returns {number} hunks consumed */
  function appendChange(box, hunk, next) {
    if (next && isWordPair(hunk, next)) {
      appendWordPair(box, hunk.lines[0], next.lines[0]);
      return 2;
    }
    for (const line of hunk.lines) box.append(plainLine(hunk.kind, line));
    return 1;
  }

  /** @param {Hunk[]} hunks */
  function renderHunks(hunks) {
    const box = element('div', 'history-diff');
    let index = 0;
    while (index < hunks.length) {
      const hunk = hunks[index];
      if (hunk.kind !== 'same') {
        index += appendChange(box, hunk, hunks[index + 1]);
        continue;
      }
      appendContext(box, hunk.lines, index === 0, index === hunks.length - 1);
      index += 1;
    }
    return box;
  }

  /** @param {Snapshot} rev @param {Snapshot} current */
  function metaLines(rev, current) {
    const lines = [];
    const revTags = new Set(rev.tags || []);
    const nowTags = new Set(current.tags || []);
    const added = [...revTags].filter((tag) => !nowTags.has(tag)).map((tag) => '+' + tag);
    const removed = [...nowTags].filter((tag) => !revTags.has(tag)).map((tag) => '−' + tag);
    if (added.length || removed.length) lines.push('Tags: ' + [...added, ...removed].join(', '));
    if (!!rev.pinned !== !!current.pinned) lines.push(rev.pinned ? 'Pinned' : 'Unpinned');
    return lines;
  }

  /** @param {Snapshot} rev @param {Snapshot} current @param {RenderOptions} [options] */
  function renderComparison(rev, current, options) {
    const body = element('div', 'history-compare');
    const notes = options && options.unsaved ? ['Compared with the last saved version.'] : [];
    const diff = diffLines(snapshotText(current), snapshotText(rev));
    if (diff.coarse) notes.push('Large change: the differing block is shown whole.');
    for (const line of [...notes, ...metaLines(rev, current)]) body.append(element('p', 'history-diff-meta', line));
    if (diff.hunks.every((hunk) => hunk.kind === 'same')) {
      body.append(element('p', 'history-diff-same', 'Same as the current note.'));
    } else {
      body.append(renderHunks(diff.hunks));
    }
    return body;
  }

  /** @param {string} label */
  function detailsElement(label) {
    const details = document.createElement('details');
    details.className = 'history-details';
    details.append(element('summary', '', label));
    return details;
  }

  /**
   * A collapsed section whose body is built on first expand, so opening
   * History with ten large revisions costs nothing until a row is opened.
   * @param {string} label @param {() => HTMLElement} build
   */
  function lazyDetails(label, build) {
    const details = detailsElement(label);
    details.addEventListener('toggle', () => {
      if (details.open && details.childElementCount === 1) details.append(build());
    });
    return details;
  }

  /**
   * The two collapsed sections of a History row. The preview is one text
   * node and renders at once, so the row's text stays searchable; the
   * comparison, which can be thousands of nodes, waits for its first expand.
   * @param {Snapshot} rev @param {Snapshot} current @param {RenderOptions} [options]
   */
  function renderDetails(rev, current, options) {
    const preview = detailsElement('Preview revision');
    preview.append(element('pre', 'history-preview', snapshotText(rev) || '(empty note)'));
    return [preview, lazyDetails('Compare with current', () => renderComparison(rev, current, options))];
  }

  /** @type {DiffWindow} */
  const root = window;
  root.ScratchpadRevisionDiff = Object.freeze({ diffLines, diffWords, snapshotText, renderDetails });
}
