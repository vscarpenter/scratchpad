/* Scratchpad share viewer. Fetches one encrypted share, decrypts it with the
   key from the URL fragment, and renders it read-only.

   This page touches no storage: no IndexedDB, no note state, no writes. It is
   also the only surface in the product that renders markdown originating
   outside the user's own browser, so all rendering goes through
   Markdown.renderMarkdownInto and every other field is set with textContent. */
(function () {
  'use strict';

  const els = {
    loading: document.getElementById('share-loading'),
    doc: document.getElementById('share-doc'),
    title: document.getElementById('share-title'),
    tags: document.getElementById('share-tags'),
    body: document.getElementById('share-body'),
    expiry: document.getElementById('share-expiry'),
    expired: document.getElementById('share-expired'),
    missing: document.getElementById('share-missing'),
    badkey: document.getElementById('share-badkey'),
    offline: document.getElementById('share-offline'),
  };

  const STATES = ['loading', 'doc', 'expired', 'missing', 'badkey', 'offline'];
  const ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

  function show(name) {
    STATES.forEach((key) => {
      if (els[key]) els[key].hidden = key !== name;
    });
  }

  // In production a CloudFront Function rewrites /s/<id> to /share.html without
  // changing the browser's URL, so the path still carries the id. The ?id= form
  // is what makes this page work under a plain static file server, which is how
  // it is developed and tested.
  function readShareId() {
    const fromPath = /^\/s\/([A-Za-z0-9_-]{12})\/?$/.exec(location.pathname);
    if (fromPath) return fromPath[1];
    const fromQuery = new URLSearchParams(location.search).get('id');
    return ID_PATTERN.test(fromQuery || '') ? fromQuery : null;
  }

  function readShareKey() {
    const match = /[#&]k=([A-Za-z0-9_-]+)/.exec(location.hash);
    return match ? match[1] : null;
  }

  function renderTags(tags) {
    els.tags.replaceChildren();
    if (!Array.isArray(tags) || tags.length === 0) {
      els.tags.hidden = true;
      return;
    }
    tags.forEach((tag) => {
      if (typeof tag !== 'string' || !tag) return;
      const li = document.createElement('li');
      li.className = 'share-tag';
      li.textContent = tag;
      els.tags.appendChild(li);
    });
    els.tags.hidden = els.tags.childElementCount === 0;
  }

  function renderExpiry(expiresAt) {
    if (!Number.isFinite(expiresAt)) return;
    els.expiry.textContent = 'Expires ' + new Date(expiresAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    els.expiry.hidden = false;
  }

  async function main() {
    show('loading');

    const id = readShareId();
    if (!id) {
      show('missing');
      return;
    }

    const keyText = readShareKey();
    if (!keyText) {
      show('badkey');
      return;
    }

    let key;
    try {
      key = await ScratchpadCrypto.importShareKey(keyText);
    } catch {
      show('badkey');
      return;
    }

    let response;
    try {
      response = await fetch('/api/share/' + encodeURIComponent(id), {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      show('offline');
      return;
    }

    if (response.status === 410) {
      show('expired');
      return;
    }
    if (response.status === 404) {
      show('missing');
      return;
    }
    if (!response.ok) {
      show('offline');
      return;
    }

    let envelope;
    try {
      envelope = await response.json();
    } catch {
      show('offline');
      return;
    }

    // The server refuses expired objects, but a cached or replayed response must
    // not outlive the expiry promised on the page.
    if (Number.isFinite(envelope.expiresAt) && Date.now() > envelope.expiresAt) {
      show('expired');
      return;
    }

    let note;
    try {
      note = await ScratchpadCrypto.decryptShare(envelope, key);
    } catch {
      show('badkey');
      return;
    }

    // textContent, never innerHTML: the title is user data and is not markdown.
    els.title.textContent = typeof note.title === 'string' && note.title
      ? note.title
      : 'Untitled note';
    document.title = els.title.textContent + ' — shared from Scratchpad';
    renderTags(note.tags);
    // Wikilinks are left unresolved: the recipient has none of the sender's
    // other notes, so every [[target]] renders as inert phantom text.
    ScratchpadMarkdown.renderMarkdownInto(els.body, typeof note.body === 'string' ? note.body : '');
    renderExpiry(envelope.expiresAt);
    show('doc');
  }

  main();
})();
