/* ══════════════════════════════════════════════════════════════
   sidebar.js — Sidebar filter construction
   ══════════════════════════════════════════════════════════════ */

function buildSidebar() {
  buildList('f-programme', 'programme', [...new Set(VISIBLE_PROJECTS.map(p => p.programme))].sort(), p => p.programme);

  // Scheme groups — sorted by project count desc, "Other" only shown if non-empty
  const sgCounts = {};
  VISIBLE_PROJECTS.forEach(p => { sgCounts[p.schemeGroup] = (sgCounts[p.schemeGroup] || 0) + 1; });
  const sgSorted = Object.keys(SCHEME_GROUPS).filter(g => sgCounts[g]).sort((a, b) => sgCounts[b] - sgCounts[a]);
  const sgEl = document.getElementById('f-scheme-group');
  sgEl.innerHTML = sgSorted.map(g => `
    <label class="ci"><input type="checkbox" data-key="schemeGroup" value="${g}">
    ${g}<span class="cc">${sgCounts[g] || 0}</span></label>`).join('');

  // IT roles — sorted by project count desc
  const roleCounts = {};
  VISIBLE_PROJECTS.forEach(p => { if (p.itRole) roleCounts[p.itRole] = (roleCounts[p.itRole] || 0) + 1; });
  const rolesSorted = Object.keys(roleCounts).sort((a, b) => roleCounts[b] - roleCounts[a]);
  buildList('f-it-role', 'itRole', rolesSorted, p => p.itRole, roleL);

  buildList('f-status', 'status', [...new Set(VISIBLE_PROJECTS.map(p => p.status).filter(Boolean))].sort(), p => p.status);

  const ctries = [...new Set(VISIBLE_PROJECTS.flatMap(p => p.partnerCountries))].sort();
  buildList('f-country', 'country', ctries, p => p.partnerCountries, cc => flag(cc) + ' ' + (CC_NAMES[cc] || CC_NAMES[CC_NORM[cc]] || cc));

  syncSidebarCheckboxes();
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

/* ── Re-tick checkboxes from active FILTERS state (after rebuild) ── */
function syncSidebarCheckboxes() {
  document.querySelectorAll('.sidebar input[type="checkbox"][data-key]').forEach(cb => {
    const k = cb.dataset.key;
    if (FILTERS[k] && FILTERS[k].has(cb.value)) cb.checked = true;
  });
}
