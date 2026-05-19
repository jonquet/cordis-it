/* ══════════════════════════════════════════════════════════════
   app.js — Global state, load, init, apply, events
   ══════════════════════════════════════════════════════════════ */

let ALL = [], VISIBLE_PROJECTS = [], FILTERED = [];
let FILTERS = { scope: new Set(), programme: new Set(), itRole: new Set(), inraeRole: new Set(), schemeGroup: new Set(), status: new Set(), country: new Set() };
let SEARCH = '', SORT = 'startDate-desc';
let DOMAIN_FILTERS = [], DOMAIN_OPERATOR = 'OR';
let REGION_FILTER = null, PARTNER_FILTER = null, PARTNER_PAGE = 0;
let CHARTS = {};
let VIEW_MODE = 'ALL';  // derived from FILTERS.scope: 'IT' | 'INRAE' | 'BOTH' (intersection) | 'ALL' (union)

function destroyChart(id) { if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; } }

/* ── View mode (derived from FILTERS.scope) ── */
function deriveViewMode() {
  const it = FILTERS.scope.has('IT');
  const inr = FILTERS.scope.has('INRAE');
  if (it && inr) return 'BOTH';
  if (it) return 'IT';
  if (inr) return 'INRAE';
  return 'ALL';
}

function applyViewMode({ rebuild = true } = {}) {
  VIEW_MODE = deriveViewMode();
  if (VIEW_MODE === 'IT')         VISIBLE_PROJECTS = ALL.filter(p => p.hasIT);
  else if (VIEW_MODE === 'INRAE') VISIBLE_PROJECTS = ALL.filter(p => p.hasINRAE);
  else if (VIEW_MODE === 'BOTH')  VISIBLE_PROJECTS = ALL.filter(p => p.hasIT && p.hasINRAE);
  else                            VISIBLE_PROJECTS = ALL.filter(p => p.hasIT || p.hasINRAE);

  document.documentElement.classList.remove('mode-IT', 'mode-INRAE', 'mode-BOTH', 'mode-ALL');
  document.documentElement.classList.add('mode-' + VIEW_MODE);

  if (rebuild) {
    delete window._domDescendants;
    delete window._domToIds;
    delete window._filteredPkeys;
    delete window._nodeFilteredCount;
    if (typeof _domTree !== 'undefined') _domTree = null;
    if (typeof _donutDrillNode !== 'undefined') _donutDrillNode = null;
    buildKPIs();
    buildSidebar();
    apply();
  }
}

function persistScope() {
  try { localStorage.setItem('cordis-it.scope', JSON.stringify([...FILTERS.scope])); } catch (e) {}
}

function onScopeChange() {
  // Clear orphan role filters when their entity is no longer in scope
  if (!FILTERS.scope.has('IT'))    FILTERS.itRole.clear();
  if (!FILTERS.scope.has('INRAE')) FILTERS.inraeRole.clear();
  persistScope();
  applyViewMode();
}

/* ── Load data ── */
async function load() {
  try {
    const r = await fetch(DATA_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = await r.json();

    if (Array.isArray(raw)) {
      ALL = raw;
      window._generatedAt = null;
      window._cordisDataDate = null;
    } else {
      ALL = raw.projects || [];
      window._generatedAt = raw.generatedAt || null;
      window._cordisDataDate = raw.cordisDataDate || null;
    }

    ALL.forEach(p => {
      p.programme = normProg(p);
      p.itRole = normRole(p.itRole || '');
      (p.partners || []).forEach(o => { o.role = normRole(o.role || ''); });
      if (!p.fundingSchemeShort) p.fundingSchemeShort = (p.fundingScheme || '').replace('HORIZON-TMA-', '').replace('HORIZON-', '');
      p.schemeGroup = schemeGroup(p.fundingSchemeShort || p.fundingScheme || '');
    });
    try {
      const raw = localStorage.getItem('cordis-it.scope');
      let scope = null;
      if (raw) {
        try { const arr = JSON.parse(raw); if (Array.isArray(arr)) scope = arr.filter(s => s === 'IT' || s === 'INRAE'); } catch (_) {}
      }
      if (!scope) {
        const legacy = localStorage.getItem('cordis-it.viewMode');
        if (legacy === 'IT')         scope = ['IT'];
        else if (legacy === 'INRAE') scope = ['INRAE'];
        else if (legacy === 'BOTH')  scope = [];        // legacy union → ALL
        else                         scope = [];         // default: ALL
      }
      FILTERS.scope = new Set(scope);
    } catch (e) {}
    applyViewMode({ rebuild: false });
    init();
  } catch (e) {
    document.getElementById('grid').innerHTML =
      `<div class="empty"><span class="big">⚠</span>Cannot load <code>${DATA_URL}</code><br><small>${e.message}</small></div>`;
  }
}

/* ── Init ── */
function init() {
  buildKPIs();
  buildSidebar();
  apply();
  bindEvents();
  // Stats tab is sidebar-independent: render once after init
  if (typeof renderStats === 'function') renderStats();
  // About tab is static content: just populate dynamic fields once
  if (typeof renderAbout === 'function') renderAbout();

  const el = document.getElementById('update-date');
  if (el) {
    const date = window._cordisDataDate || window._generatedAt;
    el.textContent = date ? `CORDIS data · ${date}` : 'CORDIS data';
  }
}

/* ── KPIs ── */
function buildKPIs() {
  const n = VISIBLE_PROJECTS.length;
  const signed = VISIBLE_PROJECTS.filter(p => p.status === 'SIGNED').length;
  let budget, projLabel, budgetLabel;
  if (VIEW_MODE === 'BOTH' || VIEW_MODE === 'ALL') {
    budget = VISIBLE_PROJECTS.reduce((s, p) => s + (p.itEcContribution || 0) + (p.inraeEcContribution || 0), 0) / 1e6;
    projLabel   = 'Projects';
    budgetLabel = 'Total budget M€';
  } else {
    const field = activeBudgetField();
    budget = VISIBLE_PROJECTS.reduce((s, p) => s + (p[field] || 0), 0) / 1e6;
    projLabel   = activeColors().label + ' projects';
    budgetLabel = activeColors().label + ' budget M€';
  }
  const countries = new Set(VISIBLE_PROJECTS.flatMap(p => p.partnerCountries)).size;
  document.getElementById('hdr-kpis').innerHTML = `
    <div class="kpi"><span class="kpi-val">${n}</span><span class="kpi-lbl">${projLabel}</span></div>
    <div class="kpi"><span class="kpi-val">${signed}</span><span class="kpi-lbl">Ongoing</span></div>
    <div class="kpi"><span class="kpi-val">${budget.toFixed(0)}</span><span class="kpi-lbl">${budgetLabel}</span></div>
    <div class="kpi"><span class="kpi-val">${countries}</span><span class="kpi-lbl">Countries</span></div>`;
}

/* ── Filter + Sort ── */
function apply() {
  const q = SEARCH.toLowerCase().trim();
  FILTERED = VISIBLE_PROJECTS.filter(p => {
    if (q) {
      const partnerNames = p.partners ? p.partners.map(o => `${o.name || ''} ${o.shortName || ''}`).join(' ') : '';
      const searchable = `${p.acronym} ${p.title} ${p.keywords} ${p.objective} ${p.topics} ${p.fundingScheme} ${p.legalBasis} ${partnerNames}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    if (FILTERS.programme.size && !FILTERS.programme.has(p.programme)) return false;
    if (FILTERS.itRole.size && !FILTERS.itRole.has(p.itRole)) return false;
    if (FILTERS.inraeRole.size && !FILTERS.inraeRole.has(p.inraeRole)) return false;
    if (FILTERS.schemeGroup.size && !FILTERS.schemeGroup.has(p.schemeGroup)) return false;
    if (FILTERS.status.size && !FILTERS.status.has(p.status)) return false;
    if (FILTERS.country.size && !p.partnerCountries.some(c => FILTERS.country.has(c))) return false;
    if (REGION_FILTER) {
      const regionCodes = REGIONS[REGION_FILTER] || [];
      if (REGION_FILTER === 'Other') {
        const allNamed = Object.values(REGIONS).flat();
        if (!p.partnerCountries.some(c => !allNamed.includes(c))) return false;
      } else {
        if (!p.partnerCountries.some(c => regionCodes.includes(c) || regionCodes.includes(CC_NORM[c] || c))) return false;
      }
    }
    if (DOMAIN_FILTERS.length) {
      const matchDomain = df => {
        const ids = window._domDescendants && window._domDescendants[df.key];
        if (ids && ids.size > 0) return ids.has(p.id + '|' + p.programme);
        const selectedPath = (df.path && df.path.length ? df.path : (df.key || '').split('|||')).filter(Boolean);
        const hasPathMatch = (p.euroSciVoc || []).some(sv => {
          const parts = (sv.path || '').trim('/').split('/').map(x => x.trim()).filter(Boolean);
          return selectedPath.length && selectedPath.every((seg, i) => parts[i] === seg);
        });
        if (hasPathMatch) return true;
        if (selectedPath.length === 1 && projectCats(p, 'l1').some(c => c === selectedPath[0])) return true;
        const exactIds = window._domToIds && window._domToIds[df.name];
        if (exactIds && exactIds.size > 0) return exactIds.has(p.id + '|' + p.programme);
        return projectCats(p).some(c => c === df.name);
      };
      if (DOMAIN_OPERATOR === 'AND') {
        if (!DOMAIN_FILTERS.every(matchDomain)) return false;
      } else {
        if (!DOMAIN_FILTERS.some(matchDomain)) return false;
      }
    }
    if (PARTNER_FILTER) {
      if (!p.partners.some(o => o.name === PARTNER_FILTER.name && o.country === PARTNER_FILTER.country)) return false;
    }
    return true;
  });

  const [sk, sd] = SORT.split('-');
  FILTERED.sort((a, b) => {
    let va, vb;
    if (sk === 'startDate') { va = a.startDate || ''; vb = b.startDate || ''; }
    else if (sk === 'budget') {
      if (VIEW_MODE === 'BOTH' || VIEW_MODE === 'ALL') {
        va = (a.itEcContribution || 0) + (a.inraeEcContribution || 0);
        vb = (b.itEcContribution || 0) + (b.inraeEcContribution || 0);
      } else {
        const f = activeBudgetField();
        va = a[f] || 0; vb = b[f] || 0;
      }
    }
    else if (sk === 'acronym') { va = a.acronym || ''; vb = b.acronym || ''; }
    else { va = a.partnerCount || 0; vb = b.partnerCount || 0; }
    const c = typeof va === 'string' ? va.localeCompare(vb, 'en') : va - vb;
    return sd === 'desc' ? -c : c;
  });
  renderAll();
}

function renderAll() {
  const n = FILTERED.length, tot = VISIBLE_PROJECTS.length;
  document.getElementById('rcount').innerHTML =
    `<strong>${n}</strong> project${n !== 1 ? 's' : ''} of ${tot}`;
  renderActiveFilters();
  renderCards();
  renderBudget();
  renderPartners();
  renderDisciplines();
  renderGeo();
  renderTimeline();
}

/* ── Active filter pills ── */
const PILL_ACTIONS = [];

function renderActiveFilters() {
  PILL_ACTIONS.length = 0;
  const pills = [];

  function addPill(label, cls, clearFn) {
    const i = PILL_ACTIONS.length;
    PILL_ACTIONS.push(clearFn);
    pills.push(`<span class="filter-pill ${cls}">
      ${label}
      <span class="pill-x" onclick="clearPill(${i})">&times;</span>
    </span>`);
  }

  if (SEARCH.trim()) {
    addPill(`Search: "${SEARCH.trim()}"`, '', () => {
      SEARCH = ''; document.getElementById('search').value = ''; apply();
    });
  }

  [...FILTERS.programme].forEach(v => addPill(
    `Programme: ${v}`, '',
    () => { FILTERS.programme.delete(v); syncCheckbox('programme', v, false); apply(); }
  ));

  const ROLE_SHORT = { coordinator: 'Coordinator', participant: 'Participant', associatedPartner: 'Assoc. Partner', thirdParty: 'Third Party' };
  [...FILTERS.itRole].forEach(v => addPill(
    `IT role: ${ROLE_SHORT[v] || v}`, '',
    () => { FILTERS.itRole.delete(v); syncCheckbox('itRole', v, false); apply(); }
  ));

  [...FILTERS.inraeRole].forEach(v => addPill(
    `INRAE role: ${ROLE_SHORT[v] || v}`, '',
    () => { FILTERS.inraeRole.delete(v); syncCheckbox('inraeRole', v, false); apply(); }
  ));

  [...FILTERS.schemeGroup].forEach(v => addPill(
    `Action: ${v}`, '',
    () => { FILTERS.schemeGroup.delete(v); syncCheckbox('schemeGroup', v, false); apply(); }
  ));

  [...FILTERS.status].forEach(v => addPill(
    `Status: ${v}`, '',
    () => { FILTERS.status.delete(v); syncCheckbox('status', v, false); apply(); }
  ));

  if (FILTERS.country.size) {
    const ctries = [...FILTERS.country];
    const label = ctries.length === 1
      ? `Country: ${flag(ctries[0])} ${ctries[0]}`
      : `Countries: ${ctries.map(c => flag(c)).join('')} (${ctries.length})`;
    addPill(label, '', () => {
      FILTERS.country.clear();
      document.querySelectorAll('[data-key="country"]').forEach(cb => cb.checked = false);
      apply();
    });
  }

  DOMAIN_FILTERS.forEach(df => addPill(
    `Discipline: ${df.name}`, 'pill-domain',
    () => { DOMAIN_FILTERS = DOMAIN_FILTERS.filter(x => x.key !== df.key); renderDisciplines(); apply(); }
  ));

  if (PARTNER_FILTER) {
    addPill(`Partner: ${PARTNER_FILTER.name}`, 'pill-region',
      () => { PARTNER_FILTER = null; apply(); }
    );
  }

  if (REGION_FILTER) {
    addPill(`Region: ${REGION_FILTER} partners`, 'pill-region',
      () => { REGION_FILTER = null; apply(); }
    );
  }

  document.getElementById('active-filters').innerHTML = pills.join('');
}

function clearPill(i) { if (PILL_ACTIONS[i]) PILL_ACTIONS[i](); }

function syncCheckbox(key, value, checked) {
  const cb = document.querySelector(`.sidebar input[data-key="${key}"][value="${value}"]`);
  if (cb) cb.checked = checked;
}

/* ── View toggle ── */
function setView(v) {
  document.getElementById('grid').classList.toggle('cols2', v === 'grid');
  document.getElementById('v-list').classList.toggle('on', v === 'list');
  document.getElementById('v-grid').classList.toggle('on', v === 'grid');
}

/* ── Events ── */
function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('on');
    const sortBlock = document.getElementById('sort-block');
    if (sortBlock) sortBlock.style.display = (btn.dataset.tab === 'projects') ? '' : 'none';
  }));

  document.getElementById('search').addEventListener('input', e => { SEARCH = e.target.value; apply(); });
  document.getElementById('sort').addEventListener('change', e => { SORT = e.target.value; apply(); });

  document.querySelector('.sidebar').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    const k = e.target.dataset.key;
    e.target.checked ? FILTERS[k].add(e.target.value) : FILTERS[k].delete(e.target.value);
    if (k === 'scope') {
      onScopeChange();
    } else {
      apply();
    }
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    SEARCH = ''; SORT = 'startDate-desc'; DOMAIN_FILTERS = []; DOMAIN_OPERATOR = 'OR';
    REGION_FILTER = null; PARTNER_FILTER = null;
    Object.values(FILTERS).forEach(s => s.clear());
    FILTERS.scope = new Set();         // restore default scope: ALL
    persistScope();
    document.getElementById('search').value = '';
    document.getElementById('sort').value = 'startDate-desc';
    document.getElementById('partner-region').value = '';
    document.getElementById('partner-type').value = '';
    document.querySelectorAll('.sidebar input[type=checkbox]').forEach(cb => cb.checked = false);
    PARTNER_PAGE = 0;
    applyViewMode();
  });

  ['partner-type'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { PARTNER_PAGE = 0; renderPartners(); });
    el.addEventListener('change', () => { PARTNER_PAGE = 0; renderPartners(); });
  });

  document.getElementById('partner-region').addEventListener('change', e => {
    REGION_FILTER = e.target.value || null;
    PARTNER_PAGE = 0;
    apply();
  });

  document.getElementById('gantt-sort').addEventListener('change', renderTimeline);
  document.getElementById('gantt-filter').addEventListener('change', renderTimeline);
}

/* ── Start ── */
load();
