/* Keep the post-erasure landing page free of Scratchpad preferences. */
(function () {
  'use strict';

  if (sessionStorage.getItem('scratchpad:eraseComplete') !== '1') return;
  const appKeys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('scratchpad:') || key === 'scratchpad-visited' || key === 'theme-preview')) {
      appKeys.push(key);
    }
  }
  for (const key of appKeys) localStorage.removeItem(key);
  sessionStorage.removeItem('scratchpad:eraseComplete');
})();
