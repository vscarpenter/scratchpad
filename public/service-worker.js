/* Scratchpad service worker: app-shell caching only. */
(function () {
  'use strict';

  const params = new URL(self.location.href).searchParams;
  const VERSION = params.get('v') || 'dev';
  const CACHE_NAME = 'scratchpad-shell-' + VERSION;
  const APP_SHELL = [
    '/',
    '/index.html',
    '/about.html',
    '/guide.html',
    '/privacy.html',
    '/terms.html',
    '/public/manifest.webmanifest',
    '/public/icon.svg',
    '/public/maskable-icon.svg',
    '/public/og-image.png',
    '/public/og-image.svg',
    '/public/css/inkwell.css',
    '/public/css/inkwell-tokens.css',
    '/public/css/inkwell-components.css',
    '/public/css/tokens.css',
    '/public/css/app.css',
    '/public/js/vendor/marked.min.js',
    '/public/js/vendor/purify.min.js',
    '/public/js/db.js',
    '/public/js/erase-landing.js',
    '/public/js/version.js',
    '/public/js/markdown.js',
    '/public/js/zip.js',
    '/public/js/seed.js',
    '/public/js/app.js',
  ];
  const APP_SHELL_SET = new Set(APP_SHELL);

  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(APP_SHELL))
    );
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
      caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(APP_SHELL.map((path) =>
          new Request(new URL(path, self.location.origin), { cache: 'reload' })
        )))
        .then(() => reply(true))
        .catch((error) => {
          console.warn('Offline cache refresh failed', error);
          reply(false);
        })
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys()
        .then((names) => Promise.all(names
          .filter((name) => name.startsWith('scratchpad-shell-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))))
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req).catch(() =>
          caches.match(url.pathname).then((cached) => cached || caches.match('/index.html'))
        )
      );
      return;
    }

    if (!APP_SHELL_SET.has(url.pathname)) return;
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(url.pathname, res.clone());
            return res;
          })
          .catch(() => caches.match(url.pathname))
      )
    );
  });
})();
