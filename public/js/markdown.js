/* Scratchpad markdown rendering. Depends on marked and DOMPurify. */
(function () {
  'use strict';

  const SAFE_URI_PATTERN = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
  const SANITIZE_CONFIG = Object.freeze({
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['style', 'svg', 'math', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style', 'srcset', 'formaction'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: SAFE_URI_PATTERN,
    RETURN_DOM_FRAGMENT: true,
  });

  if (window.marked && typeof window.marked.setOptions === 'function') {
    window.marked.setOptions({ breaks: false, gfm: true });
  }

  // GFM task-list checkboxes render as spans so the DOMPurify policy can keep
  // forbidding <input>. App code makes them interactive in view mode; without
  // it they are inert, which is the safe default.
  if (window.marked && typeof window.marked.use === 'function') {
    window.marked.use({
      renderer: {
        checkbox({ checked }) {
          return '<span class="task-checkbox" role="checkbox" tabindex="0" aria-checked="' +
            (checked ? 'true' : 'false') + '"></span>';
        },
      },
    });
  }

  function el(tag, options) {
    const node = document.createElement(tag);
    if (!options) return node;
    if (options.class) node.className = options.class;
    if (options.text != null) node.textContent = options.text;
    if (options.children) {
      for (const child of options.children) if (child) node.appendChild(child);
    }
    return node;
  }

  function isSameOriginAsset(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function hardenLinks(root) {
    for (const a of root.querySelectorAll('a[href]')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  }

  function stripRemoteAssets(root) {
    for (const node of root.querySelectorAll('[src]')) {
      const src = node.getAttribute('src') || '';
      if (!src.trim() || !isSameOriginAsset(src)) node.removeAttribute('src');
    }
  }

  function decorateRendered(root) {
    const firstP = root.querySelector(':scope > p');
    if (firstP && firstP.textContent.length > 60) firstP.classList.add('is-lede');

    for (const bq of root.querySelectorAll('blockquote')) {
      const ps = bq.querySelectorAll('p');
      if (ps.length === 1 && ps[0].textContent.length < 200) {
        bq.classList.add('is-pullquote');
      }
    }
  }

  // Walks src line by line, invoking cb(line, offset) only for lines outside
  // fenced code blocks. Fence state tracks the opening marker char so ``` and
  // ~~~ cannot close each other.
  function scanOutsideFences(src, cb) {
    const lines = String(src || '').split('\n');
    let offset = 0;
    let fence = null;
    for (const line of lines) {
      const fenceMatch = line.match(/^\s*(```+|~~~+)/);
      if (fenceMatch) {
        if (!fence) fence = fenceMatch[1][0];
        else if (fenceMatch[1][0] === fence) fence = null;
      } else if (!fence) {
        cb(line, offset);
      }
      offset += line.length + 1;
    }
  }

  const TASK_MARKER_LINE = /^(?:\s*(?:>\s*)*)(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s/;

  // Returns [{ offset, checked }] for every GFM task marker in document order.
  // offset indexes the state character inside the brackets, so a toggle is a
  // one-character replacement. Mirrors what marked renders closely enough that
  // a count mismatch signals "do not toggle" (see syncTaskCheckboxes in app.js).
  function findTaskMarkers(src) {
    const markers = [];
    scanOutsideFences(src, (line, offset) => {
      const m = line.match(TASK_MARKER_LINE);
      // m[0] ends with `[<state>]` plus one whitespace char, so the state
      // character sits three characters back from the match end.
      if (m) markers.push({ offset: offset + m[0].length - 3, checked: m[1] !== ' ' });
    });
    return markers;
  }

  function renderMarkdownInto(container, src) {
    container.replaceChildren();
    const raw = window.marked.parse(src || '');
    const frag = window.DOMPurify.sanitize(raw, SANITIZE_CONFIG);
    hardenLinks(frag);
    stripRemoteAssets(frag);
    for (const pre of frag.querySelectorAll('pre')) pre.classList.add('code-block');
    container.appendChild(frag);
    decorateRendered(container);
  }

  function renderEmptyBody(container) {
    container.replaceChildren(
      el('p', {
        class: 'rendered-empty',
        children: [
          document.createTextNode('This note is empty. Press '),
          el('em', { text: 'Edit' }),
          document.createTextNode(' to start writing.'),
        ],
      })
    );
  }

  window.ScratchpadMarkdown = {
    sanitizeConfig: SANITIZE_CONFIG,
    renderMarkdownInto,
    renderEmptyBody,
    findTaskMarkers,
  };
})();
