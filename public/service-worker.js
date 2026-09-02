/* Scratchpad service worker: app-shell caching only. */
(function () {
  'use strict';

  const params = new URL(self.location.href).searchParams;
  const VERSION = params.get('v') || 'dev';
  const CACHE_NAME = 'scratchpad-shell-' + VERSION;
  // cache.addAll is atomic: one missing entry fails the whole install and the
  // new worker never activates -- silently, because a failed install fires no
  // event any page can see. Everything the app needs offline is in APP_SHELL;
  // purely decorative assets go in OPTIONAL_SHELL, cached per-item so a
  // retired image can never veto a worker update. scripts/check-app-shell.mjs
  // asserts every entry here resolves to a deployable file.
  const APP_SHELL = [
    '/',
    '/index.html',
    '/about.html',
    '/guide.html',
    '/privacy.html',
    '/terms.html',
    '/share.html',
    '/public/manifest.webmanifest',
    '/public/icon.svg',
    '/public/maskable-icon.svg',
    '/public/css/inkwell.css',
    '/public/css/inkwell-tokens.css',
    '/public/css/inkwell-components.css',
    '/public/css/tokens.css',
    '/public/css/app.css',
    '/public/js/vendor/marked.min.js',
    '/public/js/vendor/purify.min.js',
    '/public/js/crypto.js',
    '/public/js/db.js',
    '/public/js/erase-landing.js',
    '/public/js/version.js',
    '/public/js/markdown.js',
    '/public/js/zip.js',
    '/public/js/seed.js',
    '/public/js/search.js',
    '/public/js/search-view.js',
    '/public/js/dialogs.js',
    '/public/js/editor-format.js',
    '/public/js/find-replace.js',
    '/public/js/html-to-markdown.js',
    '/public/js/share.js',
    '/public/js/app.js',
  ];
  const OPTIONAL_SHELL = ['/public/og-image.png', '/public/og-image.svg'];
  const APP_SHELL_SET = new Set([...APP_SHELL, ...OPTIONAL_SHELL]);
  const SHARE_PATH = /^\/s\/[A-Za-z0-9_-]{12}\/?$/;

  function cacheOptional(cache, requestInit) {
    return Promise.all(
      OPTIONAL_SHELL.map((path) =>
        cache.add(new Request(new URL(path, self.location.origin), requestInit || {})).catch(() => {
          /* best effort: never blocks install or refresh */
        }),
      ),
    );
  }

  self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).then(() => cacheOptional(cache))));
  });

  self.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type === 'SKIP_WAITING') {
      self.skipWaiting();
      return;
    }
    if (message.type !== 'REFRESH_CACHE') return;
    const reply = (ok) => {
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok });
    };
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache
            .addAll(APP_SHELL.map((path) => new Request(new URL(path, self.location.origin), { cache: 'reload' })))
            .then(() => cacheOptional(cache, { cache: 'reload' })),
        )
        .then(() => reply(true))
        .catch((error) => {
          console.warn('Offline cache refresh failed', error);
          reply(false);
        }),
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((name) => name.startsWith('scratchpad-shell-') && name !== CACHE_NAME)
              .map((name) => caches.delete(name)),
          ),
        )
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // A Response, always: resolving respondWith with a non-Response fails the
    // fetch with an opaque browser network error. An emptied cache (storage
    // eviction, DevTools) must degrade to this readable 503 instead.
    const offlineFallback = () => new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });

    if (req.mode === 'navigate') {
      // A /s/<id> navigation must fall back to the share shell, not the notes
      // app: serving index.html at a share URL would show the visitor their own
      // (or an empty) notes list where they expected someone else's note.
      const shellFallback = SHARE_PATH.test(url.pathname) ? '/share.html' : '/index.html';
      event.respondWith(
        fetch(req)
          .catch(() => caches.match(url.pathname).then((cached) => cached || caches.match(shellFallback)))
          .catch(() => undefined)
          .then((res) => res || offlineFallback()),
      );
      return;
    }

    // Load-bearing: /api/share* is not in APP_SHELL_SET, so it falls through to
    // the network untouched. A cached share response would survive revocation.
    if (!APP_SHELL_SET.has(url.pathname)) return;
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          fetch(req)
            .then((res) => {
              if (res && res.ok) {
                const clone = res.clone();
                cache.put(url.pathname, clone).catch(() => {
                  /* quota: serve without caching */
                });
              }
              return res;
            })
            .catch(() => caches.match(url.pathname)),
        )
        .catch(() => undefined)
        .then((res) => res || offlineFallback()),
    );
  });
})();
