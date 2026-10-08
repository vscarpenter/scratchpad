// @ts-check
/* Settings dialog behavior: the theme and Open to choices plus two status
   readers the "Your data" rows show. The inline script at the bottom of
   index.html also handles theme; it is CSP-hashed, so it stays as it is and
   keeps a hidden legacy button. This module writes the same storage key and
   <html> attribute, so the two never disagree. */
'use strict';
{
  const KEY = 'theme-preview';
  const CHOICES = ['auto', 'light', 'dark'];
  const OPEN_TO_KEY = 'scratchpad:openTo';
  const OPEN_TO_CHOICES = ['home', 'note'];

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

  /** Where a launch on a wide screen lands: Home, or the note at the top of the list. */
  function readOpenTo() {
    try {
      const stored = localStorage.getItem(OPEN_TO_KEY) || 'home';
      return OPEN_TO_CHOICES.includes(stored) ? stored : 'home';
    } catch {
      return 'home';
    }
  }

  /** @param {string} choice */
  function setOpenTo(choice) {
    try {
      localStorage.setItem(OPEN_TO_KEY, choice);
    } catch {
      /* Private mode: nothing persists, so the next launch opens to Home. */
    }
  }

  /**
   * Wires one group of segmented choice buttons to a stored setting. Returns
   * a sync function that re-reads storage, for the moment the dialog opens.
   * @param {HTMLElement} group
   * @param {string} attribute
   * @param {() => string} read
   * @param {(choice: string) => void} write
   */
  function bindChoice(group, attribute, read, write) {
    const buttons = Array.from(group.querySelectorAll('[' + attribute + ']'));
    const sync = () => {
      const current = read();
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.getAttribute(attribute) === current));
      }
    };
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const choice = button.getAttribute(attribute);
        if (choice) write(choice);
        sync();
      });
    }
    sync();
    return sync;
  }

  /**
   * Binds the theme and Open to groups inside the settings dialog. Returns one
   * sync function for both.
   * @param {HTMLElement} dialog
   */
  function bindChoices(dialog) {
    /** @type {Array<() => void>} */
    const syncs = [];
    const theme = dialog.querySelector('#theme-choice');
    if (theme instanceof HTMLElement) syncs.push(bindChoice(theme, 'data-theme-choice', readTheme, setTheme));
    const openTo = dialog.querySelector('#open-to-choice');
    if (openTo instanceof HTMLElement) syncs.push(bindChoice(openTo, 'data-open-to-choice', readOpenTo, setOpenTo));
    return () => {
      for (const sync of syncs) sync();
    };
  }

  function offlineCacheStatus() {
    if (!('serviceWorker' in navigator)) return 'Unavailable';
    if (navigator.serviceWorker.controller) return 'Ready';
    return 'Available after reload';
  }

  /* version.js changes every release, so it is the release marker.
     registration.update() re-fetches the worker at its current ?v= URL, and
     that file rarely changes, so it misses most releases. no-store skips the
     HTTP cache and, by the worker's rule, the offline cache too. */
  /** @param {string} current @returns {Promise<string | null>} the deployed version when it differs */
  async function newerVersion(current) {
    const response = await fetch('/public/js/version.js', { cache: 'no-store' });
    if (!response.ok) throw new Error('Version check failed with HTTP ' + response.status);
    const match = /SCRATCHPAD_VERSION = ['"]([^'"]+)['"]/.exec(await response.text());
    if (!match) throw new Error('The deployed version.js names no version');
    return match[1] === current ? null : match[1];
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
  root.ScratchpadSettings = Object.freeze({
    readTheme,
    setTheme,
    readOpenTo,
    bindChoices,
    offlineCacheStatus,
    newerVersion,
    storageSummary,
  });
}
