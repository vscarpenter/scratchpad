/* Scratchpad version metadata — single source of truth for the footer.
   Bump the version at release time; deploy.sh refreshes the build date. */
(function () {
  'use strict';

  window.SCRATCHPAD_VERSION = '3.0.0';
  window.SCRATCHPAD_BUILD_DATE = '2026-07-14';

  function apply() {
    const v = document.getElementById('app-version');
    const d = document.getElementById('app-build-date');
    if (v) v.textContent = window.SCRATCHPAD_VERSION;
    if (d) d.textContent = window.SCRATCHPAD_BUILD_DATE;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
