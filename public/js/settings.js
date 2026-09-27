// @ts-check
/* Settings dialog behavior: the theme choice plus two status readers the
   "Your data" rows show. The inline script at the bottom of index.html also
   handles theme; it is CSP-hashed, so it stays as it is and keeps a hidden
   legacy button. This module writes the same storage key and <html>
   attribute, so the two never disagree. */
{
  ('use strict');

  const KEY = 'theme-preview';
  const CHOICES = ['auto', 'light', 'dark'];

  function readTheme() {
    try {
      const stored = localStorage.getItem(KEY) || 'auto';
      return CHOICES.includes(stored) ? stored : 'auto';
    } catch {
      return 'auto';
    }
  }

  /** @param {string} choice */
  function applyTheme(choice) {
    const root = document.documentElement;
    if (choice === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    const label = document.getElementById('theme-label');
    if (label) label.textContent = choice;
    const legacy = document.getElementById('theme-toggle');
    if (legacy) legacy.setAttribute('data-theme-icon', choice);
  }

  /** @param {string} choice */
  function setTheme(choice) {
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* Private mode: the choice still applies to this page. */
    }
    applyTheme(choice);
  }

  /**
   * Wires a group of [data-theme-choice] buttons. Returns a sync function
   * that re-reads storage, for the moment the dialog opens.
   * @param {HTMLElement} group
   */
  function bindThemeChoice(group) {
    const buttons = Array.from(group.querySelectorAll('[data-theme-choice]'));
    const sync = () => {
      const current = readTheme();
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-theme-choice') === current));
      }
    };
    for (const button of buttons) {
      button.addEventListener('click', () => {
        setTheme(button.getAttribute('data-theme-choice') || 'auto');
        sync();
      });
    }
    sync();
    return sync;
  }

  function offlineCacheStatus() {
    if (!('serviceWorker' in navigator)) return 'Unavailable';
    if (navigator.serviceWorker.controller) return 'Ready';
    return 'Available after reload';
  }

  /** @param {(bytes: number) => string} formatBytes */
  async function storageSummary(formatBytes) {
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return 'Unavailable';
    try {
      const estimate = await navigator.storage.estimate();
      const usage = formatBytes(estimate.usage || 0);
      const quota = estimate.quota;
      const quotaText = typeof quota === 'number' && quota > 0 ? formatBytes(quota) : null;
      return quotaText ? usage + ' of ' + quotaText : usage;
    } catch {
      return 'Unavailable';
    }
  }

  /** @type {Window & typeof globalThis & { ScratchpadSettings?: object }} */
  const root = window;
  root.ScratchpadSettings = Object.freeze({ readTheme, setTheme, bindThemeChoice, offlineCacheStatus, storageSummary });
}
