/* ══════════════════════════════════════════════════════════════
   app.js — Global state, load, init, apply, events
   ══════════════════════════════════════════════════════════════ */

let ALL = [], VISIBLE_PROJECTS = [], FILTERED = [];
let FILTERS = { programme: new Set(), itRole: new Set(), schemeGroup: new Set(), status: new Set(), country: new Set() };
let SEARCH = '', SORT = 'startDate-desc';
let DOMAIN_FILTERS = [], DOMAIN_OPERATOR = 'OR';
let REGION_FILTER = null, PARTNER_FILTER = null, PARTNER_PAGE = 0;
let CHARTS = {};
let VIEW_MODE = 'IT';   // 'IT' | 'INRAE' | 'BOTH'

function destroyChart(id) { if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; } }

/* ── View mode ── */
function applyViewMode({ rebuild = true } = {}) {
  if (VIEW_MODE === 'IT')         VISIBLE_PROJECTS = ALL.filter(p => p.hasIT);
  else if (VIEW_MODE === 'INRAE') VISIBLE_PROJECTS = ALL.filter(p => p.hasINRAE);
  else                            VISIBLE_PROJECTS = ALL.filter(p => p.hasIT || p.hasINRAE);

  document.querySelectorAll('.vm-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === VIEW_MODE));

  if (rebuild) {
    delete window._domDescendants;
    delete window._domToIds;
    buildKPIs();
    buildSidebar();
    apply();
  }
}

function setViewMode(mode) {
  if (mode === VIEW_MODE) return;
  VIEW_MODE = mode;
  try { localStorage.setItem('cordis-it.viewMode', mode); } catch (e) {}
  applyViewMode();
}

function buildViewModeCounts() {
  const cIT    = ALL.filter(p => p.hasIT).length;
  const cINRAE = ALL.filter(p => p.hasINRAE).length;
  const cBOTH  = ALL.filter(p => p.hasIT || p.hasINRAE).length;
  const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = `(${n})`; };
  set('vm-count-IT', cIT);
  set('vm-count-INRAE', cINRAE);
  set('vm-count-BOTH', cBOTH);
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
      const stored = localStorage.getItem('cordis-it.viewMode');
      if (stored && ['IT','INRAE','BOTH'].includes(stored)) VIEW_MODE = stored;
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
  buildViewModeCounts();
  buildKPIs();
  buildSidebar();
  apply();
  bindEvents();

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
  const budget = VISIBLE_PROJECTS.reduce((s, p) => s + (p.itEcContribution || 0), 0) / 1e6;
  const countries = new Set(VISIBLE_PROJECTS.flatMap(p => p.partnerCountries)).size;
  document.getElementById('hdr-kpis').innerHTML = `
    <div class="kpi"><span class="kpi-val">${n}</span><span class="kpi-lbl">IT projects</span></div>
    <div class="kpi"><span class="kpi-val">${signed}</span><span class="kpi-lbl">Ongoing</span></div>
    <div class="kpi"><span class="kpi-val">${budget.toFixed(0)}</span><span class="kpi-lbl">IT budget M€</span></div>
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
      const getDescendantIds = df => {
        if (window._domDescendants && window._domDescendants[df.key]) return window._domDescendants[df.key];
        return null;
      };
      const matchDomain = df => {
        const ids = getDescendantIds(df);
        if (ids && ids.size > 0) return ids.has(p.id + '|' + p.programme);
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
    else if (sk === 'budget') { va = a.itEcContribution || 0; vb = b.itEcContribution || 0; }
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
    `<strong>${n}</strong> IT project${n !== 1 ? 's' : ''} of ${tot}`;
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

  [...FILTERS.schemeGroup].forEach(v => addPill(
    `Funding: ${v}`, '',
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
    apply();
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    SEARCH = ''; SORT = 'startDate-desc'; DOMAIN_FILTERS = []; DOMAIN_OPERATOR = 'OR';
    REGION_FILTER = null; PARTNER_FILTER = null;
    Object.values(FILTERS).forEach(s => s.clear());
    document.getElementById('search').value = '';
    document.getElementById('sort').value = 'startDate-desc';
    document.getElementById('partner-region').value = '';
    document.getElementById('partner-type').value = '';
    document.querySelectorAll('.sidebar input[type=checkbox]').forEach(cb => cb.checked = false);
    PARTNER_PAGE = 0;
    apply();
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
