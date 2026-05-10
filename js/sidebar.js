/* ══════════════════════════════════════════════════════════════
   sidebar.js — Sidebar filter construction
   ══════════════════════════════════════════════════════════════ */

function buildSidebar() {
  buildScopeList();

  buildList('f-programme', 'programme', [...new Set(VISIBLE_PROJECTS.map(p => p.programme))].sort(), p => p.programme);

  // Scheme groups — sorted by project count desc, "Other" only shown if non-empty
  const sgCounts = {};
  VISIBLE_PROJECTS.forEach(p => { sgCounts[p.schemeGroup] = (sgCounts[p.schemeGroup] || 0) + 1; });
  const sgSorted = Object.keys(SCHEME_GROUPS).filter(g => sgCounts[g]).sort((a, b) => sgCounts[b] - sgCounts[a]);
  const sgEl = document.getElementById('f-scheme-group');
  sgEl.innerHTML = sgSorted.map(g => `
    <label class="ci"><input type="checkbox" data-key="schemeGroup" value="${g}">
    ${g}<span class="cc">${sgCounts[g] || 0}</span></label>`).join('');

  // ── Role section (1 or 2 blocks depending on VIEW_MODE) ──
  renderRoleSection();
  if (VIEW_MODE !== 'INRAE') populateRoleList('f-it-role',    'itRole',    p => p.itRole);
  if (VIEW_MODE !== 'IT')    populateRoleList('f-inrae-role', 'inraeRole', p => p.inraeRole);

  buildList('f-status', 'status', [...new Set(VISIBLE_PROJECTS.map(p => p.status).filter(Boolean))].sort(), p => p.status);

  const ctries = [...new Set(VISIBLE_PROJECTS.flatMap(p => p.partnerCountries))].sort();
  buildList('f-country', 'country', ctries, p => p.partnerCountries, cc => flag(cc) + ' ' + (CC_NAMES[cc] || CC_NAMES[CC_NORM[cc]] || cc));

  syncSidebarCheckboxes();
}

/* Scope filter — based on ALL (counts are stable across scope changes) */
function buildScopeList() {
  const el = document.getElementById('f-scope');
  if (!el) return;
  const cIT    = ALL.filter(p => p.hasIT).length;
  const cINRAE = ALL.filter(p => p.hasINRAE).length;
  el.innerHTML = `
    <label class="ci"><input type="checkbox" data-key="scope" value="IT">
    IT<span class="cc">${cIT}</span></label>
    <label class="ci"><input type="checkbox" data-key="scope" value="INRAE">
    INRAE<span class="cc">${cINRAE}</span></label>`;
}

function buildList(elId, key, vals, getter, labelFn) {
  const el = document.getElementById(elId);
  const c = {};
  VISIBLE_PROJECTS.forEach(p => {
    const v = getter(p);
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) v.forEach(x => { c[x] = (c[x] || 0) + 1; });
    else c[v] = (c[v] || 0) + 1;
  });
  el.innerHTML = vals.map(v => `<label class="ci">
    <input type="checkbox" data-key="${key}" value="${v}">
    ${labelFn ? labelFn(v) : v}<span class="cc">${c[v] || 0}</span></label>`).join('');
}

function renderRoleSection() {
  const sec = document.getElementById('role-section');
  if (!sec) return;
  if (VIEW_MODE === 'IT') {
    sec.innerHTML = `<div class="fb"><span class="ft">IT Role</span><div class="cl" id="f-it-role"></div></div>`;
  } else if (VIEW_MODE === 'INRAE') {
    sec.innerHTML = `<div class="fb"><span class="ft">INRAE Role</span><div class="cl" id="f-inrae-role"></div></div>`;
  } else {
    sec.innerHTML = `
      <div class="fb"><span class="ft">IT Role</span><div class="cl" id="f-it-role"></div></div>
      <hr class="fr">
      <div class="fb"><span class="ft">INRAE Role</span><div class="cl" id="f-inrae-role"></div></div>`;
  }
}

function populateRoleList(elId, key, getter) {
  const counts = {};
  VISIBLE_PROJECTS.forEach(p => { const r = getter(p); if (r) counts[r] = (counts[r] || 0) + 1; });
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  buildList(elId, key, sorted, getter, roleL);
}

/* ── Re-tick checkboxes from active FILTERS state (after rebuild) ── */
function syncSidebarCheckboxes() {
  document.querySelectorAll('.sidebar input[type="checkbox"][data-key]').forEach(cb => {
    const k = cb.dataset.key;
    if (FILTERS[k] && FILTERS[k].has(cb.value)) cb.checked = true;
  });
}
