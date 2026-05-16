/* Scratchpad version metadata — single source of truth for the footer.
   Bump these two values at release time. */
(function () {
  'use strict';

  window.SCRATCHPAD_VERSION = '1.3.0';
  window.SCRATCHPAD_BUILD_DATE = '2026-05-16';

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
