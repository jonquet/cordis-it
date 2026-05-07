/* ══════════════════════════════════════════════════════════════
   cards.js — Projects tab (card rendering)
   ══════════════════════════════════════════════════════════════ */

function renderCards() {
  const grid = document.getElementById('grid');
  if (!FILTERED.length) {
    grid.innerHTML = '<div class="empty"><span class="big">∅</span>No projects match.</div>';
    return;
  }
  grid.innerHTML = FILTERED.map(p => {
    const flags = p.partnerCountries.map(flag).join('');
    const kw = p.keywords ? `<div class="card-kw">🏷 ${p.keywords}</div>` : '';
    const scheme = p.schemeGroup ? `<span class="tag tg-scheme">${p.schemeGroup}</span>` : '';
    return `<div class="card" onclick="openModal('${p.id}','${p.programme}')">
      <div class="card-top">
        <span class="card-acro">${p.acronym || '–'}</span>
        <span class="card-title">${p.title}</span>
      </div>
      <div class="card-body">
        ${kw}
        <div class="card-tags">${progTag(p)}<span class="tag tg-${p.status}">${p.status}</span>${scheme}${entityBadges(p)}</div>
      </div>
      <div class="card-foot">
        <span class="card-dates">📅 ${fmtD(p.startDate)} → ${fmtD(p.endDate)}</span>
        ${budgetChips(p)}
        <span class="card-flags" title="${p.partnerCountries.join(', ')}">${flags}</span>
        <a class="card-link" href="${p.cordisUrl}" target="_blank" onclick="event.stopPropagation()">CORDIS ↗</a>
      </div>
    </div>`;
  }).join('');
}
