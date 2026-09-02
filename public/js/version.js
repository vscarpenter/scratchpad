/* Scratchpad version metadata — single source of truth for the footer.
   Bump the version at release time; deploy.sh refreshes the build date. */
(function () {
  'use strict';

  window.SCRATCHPAD_VERSION = '3.23.0';
  window.SCRATCHPAD_BUILD_DATE = '2026-09-01';

  function apply() {
    const slots = [
      ['app-version', window.SCRATCHPAD_VERSION],
      ['shell-version', window.SCRATCHPAD_VERSION],
      ['app-build-date', window.SCRATCHPAD_BUILD_DATE],
      ['shell-build-date', window.SCRATCHPAD_BUILD_DATE],
    ];
    for (const [id, value] of slots) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
