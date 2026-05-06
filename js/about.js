/* ══════════════════════════════════════════════════════════════
   about.js — About modal
   ══════════════════════════════════════════════════════════════ */

function openAbout() {
  document.getElementById('about-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  const dateEl = document.getElementById('about-data-date');
  if (dateEl) dateEl.textContent = window._cordisDataDate || window._generatedAt || '–';
  const verEl = document.getElementById('about-version');
  if (verEl) {
    const d = window._cordisDataDate || window._generatedAt;
    verEl.textContent = d ? ' · data ' + d : '';
  }
}

function closeAbout() {
  document.getElementById('about-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function aboutOverlayClick(e) {
  if (e.target === document.getElementById('about-overlay')) closeAbout();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('about-overlay').classList.contains('open')) closeAbout();
});
