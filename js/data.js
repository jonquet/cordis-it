/* ══════════════════════════════════════════════════════════════
   data.js — Shared constants, helpers, region definitions
   ══════════════════════════════════════════════════════════════ */

const DATA_URL = 'data/inrae_projects.json';
const GEO_PATHS_URL = 'data/geo-paths.json';
const PER_PAGE = 25;

/* ── Scheme Groups ── */
const SCHEME_GROUPS = {
  'RIA':         s => /\bRIA\b/.test(s) || /^CP[-\s]?(FP-)?SICA\b/.test(s),
  'IA':          s => /(?<![R])(?:^|-)\s*IA\b/.test(s),
  'MSCA':        s => s.includes('MSCA') || /^MC-/.test(s),
  'ERC':         s => s.includes('ERC'),
  'CSA':         s => s.includes('CSA') || s === 'NOE',
  'EIC':         s => s.includes('EIC') || /^BSG-SME/.test(s),
  'INFRA':       s => s === 'INFRA',
  'COFUND':      s => /\bJU-|\bCOFUND\b|^AG$/.test(s),
  'Other':       () => true
};

function schemeGroup(scheme) {
  if (!scheme) return 'Other';
  const s = scheme.toUpperCase();
  for (const [g, fn] of Object.entries(SCHEME_GROUPS)) if (fn(s)) return g;
  return 'Other';
}

/* ── Country codes ── */
const CC_NORM = { 'EL': 'GR', 'UK': 'GB' };
const CC_NAMES = {
  'AL':'Albania','AT':'Austria','BA':'Bosnia & Herzegovina','BE':'Belgium',
  'BG':'Bulgaria','BY':'Belarus','CH':'Switzerland','CY':'Cyprus','CZ':'Czechia',
  'DE':'Germany','DK':'Denmark','EE':'Estonia','EL':'Greece','ES':'Spain',
  'FI':'Finland','FR':'France','HR':'Croatia','HU':'Hungary','IE':'Ireland',
  'IS':'Iceland','IT':'Italy','LT':'Lithuania','LU':'Luxembourg','LV':'Latvia',
  'MD':'Moldova','ME':'Montenegro','MK':'North Macedonia','MT':'Malta',
  'NL':'Netherlands','NO':'Norway','PL':'Poland','PT':'Portugal','RO':'Romania',
  'RS':'Serbia','SE':'Sweden','SI':'Slovenia','SK':'Slovakia','TR':'Türkiye',
  'UA':'Ukraine','UK':'United Kingdom',
  'US':'United States','CA':'Canada','MX':'Mexico','BR':'Brazil','AR':'Argentina',
  'CL':'Chile','CO':'Colombia','PE':'Peru','UY':'Uruguay','EC':'Ecuador',
  'VE':'Venezuela','CR':'Costa Rica','PA':'Panama','CU':'Cuba','DO':'Dominican Republic',
  'AU':'Australia','NZ':'New Zealand','FJ':'Fiji','PG':'Papua New Guinea',
  'CN':'China','HK':'Hong Kong','TW':'Taiwan','MO':'Macao','JP':'Japan',
  'KR':'South Korea','IN':'India','IL':'Israel','TH':'Thailand','VN':'Vietnam',
  'MY':'Malaysia','SG':'Singapore','ID':'Indonesia','PH':'Philippines',
  'BD':'Bangladesh','PK':'Pakistan','LK':'Sri Lanka','NP':'Nepal',
  'KZ':'Kazakhstan','UZ':'Uzbekistan','GE':'Georgia','AM':'Armenia','AZ':'Azerbaijan',
  'JO':'Jordan','LB':'Lebanon','SA':'Saudi Arabia','AE':'UAE','QA':'Qatar',
  'KW':'Kuwait','BH':'Bahrain','OM':'Oman','IQ':'Iraq','IR':'Iran',
  'ZA':'South Africa','EG':'Egypt','MA':'Morocco','TN':'Tunisia','DZ':'Algeria',
  'NG':'Nigeria','KE':'Kenya','GH':'Ghana','ET':'Ethiopia','TZ':'Tanzania',
  'UG':'Uganda','SN':'Senegal','CI':'Côte d\'Ivoire','CM':'Cameroon','MZ':'Mozambique',
  'RW':'Rwanda','BF':'Burkina Faso','ML':'Mali','NE':'Niger','MG':'Madagascar',
  'XK':'Kosovo','GB':'United Kingdom','GR':'Greece'
};

/* ── Formatting helpers ── */
function flag(cc) {
  if (!cc || cc.length !== 2) return cc || '';
  const c = (CC_NORM[cc] || cc).toLowerCase();
  const name = CC_NAMES[cc] || CC_NAMES[CC_NORM[cc]] || cc;
  return `<img src="https://flagcdn.com/16x12/${c}.png" alt="${cc}" title="${name}"
    style="width:16px;height:12px;vertical-align:middle;border-radius:1px;margin:0 1px"
    onerror="this.replaceWith(document.createTextNode('${cc}'))">`;
}

const fmtM = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M€' : n >= 1e3 ? Math.round(n / 1e3) + 'k€' : n > 0 ? n + '€' : '–';
const fmtD = d => d ? d.slice(0, 7) : '–';
const fmtY = d => d ? d.slice(0, 4) : '';

const ROLE_L = { coordinator: 'Coordinator', participant: 'Participant', associatedPartner: 'Assoc. Partner', thirdParty: 'Third Party' };
const roleL = r => ROLE_L[r] || r || '–';
const normRole = r => (r === 'partner' ? 'associatedPartner' : r) || '';

function progTag(p) {
  const s = (p.programme || '').toUpperCase();
  if (s === 'H2020')   return '<span class="tag tg-h2020">H2020</span>';
  if (s === 'FP7')     return '<span class="tag tg-fp7">FP7</span>';
  return '<span class="tag tg-he">HE</span>';
}

function normProg(p) {
  const s = (p.programme || p.frameworkProgramme || '').toUpperCase();
  if (s.includes('H2020'))   return 'H2020';
  if (s.includes('FP7'))     return 'FP7';
  return 'HORIZON';
}

/* ── Regions ── */
const REGIONS = {
  'Northern Europe':            ['DK','EE','FI','IS','LV','LT','NO','SE'],
  'Western Europe':             ['AT','BE','FR','DE','IE','LU','NL','CH','GB','UK'],
  'Southern Europe':            ['AL','BA','HR','CY','EL','GR','IT','MT','ME','MK','PT','RS','SI','ES','TR','XK'],
  'Central & Eastern Europe':   ['BG','BY','CZ','HU','MD','PL','RO','SK','UA'],
  'Americas & Oceania':         ['US','CA','MX','BR','AR','CL','CO','PE','UY','EC','VE','CR','PA','CU','DO','GT','HN','NI','SV','BO','PY','JM','TT','HT','BZ','GY','SR','BB','AU','NZ','FJ','PG','WS','TO','VU','SB','KI','FM','MH','PW','NR','TV'],
  'Asia':                       ['CN','HK','TW','MO','JP','KR','IN','IL','TH','VN','MY','SG','ID','PH','BD','PK','LK','NP','KH','LA','MM','KZ','UZ','GE','AM','AZ','JO','LB','SA','AE','QA','KW','BH','OM','IQ','IR','AF','SY','YE'],
  'Africa':                     ['ZA','EG','MA','TN','DZ','NG','KE','GH','ET','TZ','UG','SN','CI','CM','MZ','RW','BF','ML','NE','MG','CD','CG','AO','ZW','BW','MW','NA','ZM','LS','SZ','MU','SC','CV','GA','BJ','TG','LR','SL','GM','GN','GW','TD','CF','SS','ER','SO','DJ','KM','ST'],
  'Rest of the World':          []
};

/* European region keys (used for map highlighting) */
const EURO_REGIONS = ['Northern Europe','Western Europe','Southern Europe','Central & Eastern Europe'];

function getRegion(cc) {
  for (const [r, cs] of Object.entries(REGIONS)) if (cs.includes(cc)) return r;
  return 'Rest of the World';
}

/* ── Topic → thematic category ── */
const TOPIC_CATS = {
  'CL1': 'Health', 'CL2': 'Culture & Society', 'CL3': 'Civil Security',
  'CL4': 'Digital & Industry', 'CL5': 'Climate, Energy & Mobility',
  'CL6': 'Food, Bioeconomy & Environment', 'MISS': 'EU Missions',
  'INFRA': 'Research Infrastructures', 'MSCA': 'MSCA', 'ERC': 'ERC',
  'EIC': 'EIC', 'JU': 'Joint Undertakings', 'CBE': 'Biobased Industries JU',
  'SFS': 'Food Security',
};

function topicToCat(topic) {
  if (!topic || !topic.trim()) return null;
  const parts = topic.trim().toUpperCase().split('-');
  for (const p of parts) { if (TOPIC_CATS[p]) return TOPIC_CATS[p]; }
  return 'Other';
}

function projectCats(p, level) {
  if (p.domains && Array.isArray(p.domains) && p.domains.length > 0) {
    if (level !== 'l1' && p.domains_l2 && p.domains_l2.length > 0) return p.domains_l2;
    return p.domains;
  }
  if (p.topics) {
    const cats = new Set();
    p.topics.split(';').map(t => t.trim()).filter(Boolean)
      .forEach(t => { const c = topicToCat(t); if (c) cats.add(c); });
    if (cats.size > 0) return [...cats];
  }
  return [];
}

/* ── Chart palette ── */
const PAL = ['rgba(37,99,171,.8)', 'rgba(109,40,217,.7)', 'rgba(146,96,10,.7)', 'rgba(22,101,52,.7)', 'rgba(153,27,27,.7)', 'rgba(74,144,217,.6)', 'rgba(156,163,175,.6)'];
const DOM_PAL = ['#1a4f8a', '#166534', '#92600a', '#b91c1c', '#7c3aed', '#0891b2', '#be185d', '#0f766e', '#78350f', '#374151'];
/* DONUT_PAL: 6 first entries are distinct hues for EuroSciVoc L1 domains
   (blue/green/brown/red/purple/teal), then complementary fillers */
const DONUT_PAL = ['#1a4f8a', '#166534', '#92600a', '#b91c1c', '#7c3aed', '#0891b2', '#be185d', '#0f766e', '#78350f', '#374151', '#2563ab', '#60a5fa'];
const L1_COLORS_DOM = {};
const PROG_COLORS = {
  'FP7':     'rgba(91,45,142,.8)',
  'H2020':   'rgba(26,79,138,.8)',
  'HORIZON': 'rgba(30,86,49,.8)',
};

/* ── Active scope helpers (driven by VIEW_MODE, defined in app.js) ── */
function activeColors() {
  if (VIEW_MODE === 'INRAE') {
    return { main: 'var(--inrae)', mid: 'var(--inrae-mid)', light: 'var(--inrae-light)', pale: 'var(--inrae-pale)',
             rgba: a => `rgba(0,132,127,${a})`, label: 'INRAE' };
  }
  if (VIEW_MODE === 'BOTH') {
    return { main: 'var(--both)', mid: 'var(--both-mid)', light: 'var(--both-mid)', pale: 'var(--both-pale)',
             rgba: a => `rgba(39,85,98,${a})`, label: 'IT + INRAE' };
  }
  return   { main: 'var(--it)', mid: 'var(--it-mid)', light: 'var(--it-light)', pale: 'var(--it-pale)',
             rgba: a => `rgba(37,99,171,${a})`, label: 'IT' };
}

function activeBudgetField() {
  if (VIEW_MODE === 'INRAE') return 'inraeEcContribution';
  if (VIEW_MODE === 'BOTH')  return null;
  return 'itEcContribution';
}

function activeRoleField() {
  if (VIEW_MODE === 'INRAE') return 'inraeRole';
  if (VIEW_MODE === 'BOTH')  return null;
  return 'itRole';
}

/* ── Entity badges + budget chips (used in cards.js + modal.js) ── */
function entityBadges(p) {
  const badges = [];
  if (p.hasIT)    badges.push(`<span class="tag tag-entity tag-it">IT · ${roleL(p.itRole)}</span>`);
  if (p.hasINRAE) badges.push(`<span class="tag tag-entity tag-inrae">INRAE · ${roleL(p.inraeRole)}</span>`);
  return badges.join('');
}

function budgetChips(p) {
  const chips = [];
  if (p.ecMaxContribution > 0) chips.push(`<span class="cb cb-total">Total: ${fmtM(p.ecMaxContribution)}</span>`);
  if (p.hasIT)    chips.push(`<span class="cb cb-it">IT: ${p.itEcContribution > 0 ? fmtM(p.itEcContribution) : '0€ via INRAE'}</span>`);
  if (p.hasINRAE && p.inraeEcContribution > 0) chips.push(`<span class="cb cb-inrae">INRAE: ${fmtM(p.inraeEcContribution)}</span>`);
  return chips.length ? `<div class="card-budgets">${chips.join('')}</div>` : '<span class="card-budget">–</span>';
}
