/* ══════════════════════════════════════════════════════════════
   about.js — Populates dynamic fields of the About tab.
   Called once at init() — data is static after load.
   ══════════════════════════════════════════════════════════════ */

function renderAbout() {
  const dateEl = document.getElementById('about-data-date');
  if (dateEl) dateEl.textContent = window._cordisDataDate || window._generatedAt || '–';
  const verEl = document.getElementById('about-version');
  if (verEl) {
    const d = window._cordisDataDate || window._generatedAt;
    verEl.textContent = d ? ' · data ' + d : '';
  }
}
