/* ══════════════════════════════════════════════════════════════
   stats.js — Statistical Analysis tab
   Port of scripts/analyze_it_value.py to client side.
   Independent of sidebar filters: reads ALL directly.
   IT alone population intentionally omitted (display-only choice).
   ══════════════════════════════════════════════════════════════ */

const AV_EU27 = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR',
  'DE','GR','HU','IE','IT','LV','LT','LU','MT','NL',
  'PL','PT','RO','SK','SI','ES','SE'
]);

const AV_SCHEME_ORDER = ['RIA','IA','MSCA','ERC','CSA','EIC','INFRA','COFUND','Other'];

const AV_COLOR_ALONE = '#00847f';   // INRAE green — stable across view modes
const AV_COLOR_WITH  = '#1a4f8a';   // IT blue — stable across view modes

let AV_SCOPE = 'RIA';   // 'RIA' | 'ALL' — internal toggle, no persistence

/* ─────────────── Stats helpers ─────────────── */

function _avClean(xs) { return xs.filter(v => v !== null && v !== undefined); }

function _avPercentile(sorted, q) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (q / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function _avAgg(xs, kinds) {
  const c = _avClean(xs);
  const out = { n: c.length };
  if (!c.length) {
    kinds.forEach(k => out[k] = null);
    return out;
  }
  const sorted = [...c].sort((a, b) => a - b);
  kinds.forEach(k => {
    if (k === 'mean')        out.mean   = c.reduce((s, v) => s + v, 0) / c.length;
    else if (k === 'median') out.median = _avPercentile(sorted, 50);
    else if (k === 'p25')    out.p25    = _avPercentile(sorted, 25);
    else if (k === 'p75')    out.p75    = _avPercentile(sorted, 75);
    else if (k === 'max')    out.max    = sorted[sorted.length - 1];
  });
  return out;
}

function _avPctDelta(a, b) {
  if (a === null || a === undefined || b === null || b === undefined || a === 0) return null;
  return (b - a) / a * 100;
}

/* Math.erf approximation — Abramowitz & Stegun 7.1.26 (max error ≈ 1.5e-7) */
function _avErf(x) {
  if (typeof Math.erf === 'function') return Math.erf(x);
  const a1 =  0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
function _avNormalCdf(x) { return 0.5 * (1 + _avErf(x / Math.SQRT2)); }

/* Two-sided Mann-Whitney U with tie correction + continuity correction.
   Mirror of mann_whitney_u() in analyze_it_value.py.
   Returns p-value in [0,1] or null when n < 2 in either group. */
function _avMannWhitneyU(a, b) {
  a = _avClean(a);
  b = _avClean(b);
  const n1 = a.length, n2 = b.length;
  if (n1 < 2 || n2 < 2) return null;
  const combined = a.map(v => [v, 0]).concat(b.map(v => [v, 1]));
  combined.sort((x, y) => x[0] - y[0]);
  const n = n1 + n2;
  const ranks = new Array(n);
  const tieGroups = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && combined[j + 1][0] === combined[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;   // mid-rank, 1-based
    const size = j - i + 1;
    if (size > 1) tieGroups.push(size);
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }
  let R1 = 0;
  for (let k = 0; k < n; k++) if (combined[k][1] === 0) R1 += ranks[k];
  const U1 = R1 - n1 * (n1 + 1) / 2;
  const U2 = n1 * n2 - U1;
  const U  = Math.min(U1, U2);
  const mu = n1 * n2 / 2;
  let variance;
  if (tieGroups.length) {
    const tieTerm = tieGroups.reduce((s, t) => s + (t * t * t - t), 0) / (n * (n - 1));
    variance = n1 * n2 / 12 * (n + 1 - tieTerm);
  } else {
    variance = n1 * n2 * (n + 1) / 12;
  }
  if (variance <= 0) return null;
  const sigma = Math.sqrt(variance);
  let z = (Math.abs(U - mu) - 0.5) / sigma;   // continuity correction
  if (z < 0) z = 0;
  const p = 2 * (1 - _avNormalCdf(z));
  return Math.max(0, Math.min(1, p));
}

/* ─────────────── Per-project metrics ─────────────── */

function _avProjectMetrics(p) {
  const budget = p.ecMaxContribution || 0;
  const partners = p.partners || [];
  const countries = new Set();
  const activityTypes = new Set();
  partners.forEach(pr => {
    if (pr.country) countries.add(CC_NORM[pr.country] || pr.country);
    if (pr.activityType) activityTypes.add(pr.activityType);
  });
  countries.delete('');
  let nonEu = 0;
  countries.forEach(c => { if (!AV_EU27.has(c)) nonEu++; });

  let durationMonths = null;
  if (p.startDate && p.endDate) {
    const sd = new Date(p.startDate);
    const ed = new Date(p.endDate);
    if (!isNaN(sd) && !isNaN(ed) && ed > sd) {
      durationMonths = (ed - sd) / 86400000 / 30.4375;
    }
  }
  const yearStart = p.startDate ? parseInt(p.startDate.slice(0, 4), 10) : null;

  return {
    budget: budget > 0 ? budget : null,
    nPartners: partners.length || null,
    nCountries: countries.size || null,
    nNonEu: nonEu,                                 // 0 is meaningful — keep
    nActivityTypes: activityTypes.size || null,
    durationMonths,
    yearStart,
    schemeGroup: p.schemeGroup || schemeGroup(p.fundingSchemeShort || p.fundingScheme || ''),
    programme: p.frameworkProgramme || '',
    domainsL1: p.domains || []
  };
}

/* ─────────────── Formatting ─────────────── */

function _avFmtSig(p) {
  if (p === null || p === undefined) return { text: '—', stars: '', klass: '' };
  let stars, pStr;
  if (p < 0.001)      { stars = '***'; pStr = '&lt;0.001'; }
  else if (p < 0.01)  { stars = '**';  pStr = p.toFixed(3); }
  else if (p < 0.05)  { stars = '*';   pStr = p.toFixed(3); }
  else                { stars = 'ns';  pStr = p.toFixed(3); }
  const klass = p < 0.01 ? 'av-sig-strong' : p < 0.05 ? 'av-sig-mid' : 'av-sig-no';
  return { text: `${pStr} ${stars}`, stars, klass };
}

function _avFmtEur(v) {
  if (v === null || v === undefined) return '—';
  const n = Math.round(v);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
}

function _avFmtNum(v, dec) {
  if (v === null || v === undefined) return '—';
  return v.toFixed(dec === undefined ? 2 : dec);
}

function _avFmtPct(v, dec) {
  if (v === null || v === undefined) return '—';
  const d = dec === undefined ? 1 : dec;
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(d)} %`;
}

function _avFmtPctShare(v, dec) {
  if (v === null || v === undefined) return '—';
  return v.toFixed(dec === undefined ? 1 : dec) + ' %';
}

function _avClsDelta(v) {
  if (v === null || v === undefined) return '';
  if (v >  1) return 'av-delta-pos';
  if (v < -1) return 'av-delta-neg';
  return 'av-delta-flat';
}

/* ─────────────── Renderers ─────────────── */

function _avRenderMasterTable(popAlone, popWith) {
  const ma = popAlone.map(x => x.m);
  const mw = popWith.map(x => x.m);
  const rows = [];

  rows.push({
    label: 'n projects',
    a: String(popAlone.length), b: String(popWith.length),
    delta: '—', deltaClass: '', sig: '', sigClass: ''
  });

  function addRow(label, aVal, bVal, fmtFn, sigP) {
    const delta = _avPctDelta(aVal, bVal);
    const sigInfo = sigP !== undefined ? _avFmtSig(sigP) : { text: '', klass: '' };
    rows.push({
      label,
      a: fmtFn(aVal), b: fmtFn(bVal),
      delta: _avFmtPct(delta), deltaClass: _avClsDelta(delta),
      sig: sigInfo.text, sigClass: sigInfo.klass
    });
  }

  // Budget — median + P25 / P75; MWU on full distribution shown on the median row
  const aBud = _avAgg(ma.map(m => m.budget), ['median','p25','p75']);
  const bBud = _avAgg(mw.map(m => m.budget), ['median','p25','p75']);
  const pBud = _avMannWhitneyU(ma.map(m => m.budget), mw.map(m => m.budget));
  addRow('EU budget — median', aBud.median, bBud.median, _avFmtEur, pBud);
  addRow('EU budget — P25',    aBud.p25,    bBud.p25,    _avFmtEur);
  addRow('EU budget — P75',    aBud.p75,    bBud.p75,    _avFmtEur);

  // Partners — median only
  const aP = _avAgg(ma.map(m => m.nPartners), ['median']);
  const bP = _avAgg(mw.map(m => m.nPartners), ['median']);
  const pP = _avMannWhitneyU(ma.map(m => m.nPartners), mw.map(m => m.nPartners));
  addRow('Partners — median', aP.median, bP.median, v => _avFmtNum(v, 1), pP);

  // Partner countries — median only
  const aC = _avAgg(ma.map(m => m.nCountries), ['median']);
  const bC = _avAgg(mw.map(m => m.nCountries), ['median']);
  const pC = _avMannWhitneyU(ma.map(m => m.nCountries), mw.map(m => m.nCountries));
  addRow('Partner countries — median', aC.median, bC.median, v => _avFmtNum(v, 1), pC);

  // Non-EU27 countries — median
  const aN = _avAgg(ma.map(m => m.nNonEu), ['median']);
  const bN = _avAgg(mw.map(m => m.nNonEu), ['median']);
  const pN = _avMannWhitneyU(ma.map(m => m.nNonEu), mw.map(m => m.nNonEu));
  addRow('Non-EU27 countries — median', aN.median, bN.median, v => _avFmtNum(v, 1), pN);

  // Distinct activity types — mean (discrete 1–5 range: median saturates, mean is more informative)
  const aT = _avAgg(ma.map(m => m.nActivityTypes), ['mean']);
  const bT = _avAgg(mw.map(m => m.nActivityTypes), ['mean']);
  const pT = _avMannWhitneyU(ma.map(m => m.nActivityTypes), mw.map(m => m.nActivityTypes));
  addRow('Distinct activity types — mean', aT.mean, bT.mean, v => _avFmtNum(v, 2), pT);

  // Duration months — median only
  const aD = _avAgg(ma.map(m => m.durationMonths), ['median']);
  const bD = _avAgg(mw.map(m => m.durationMonths), ['median']);
  const pD = _avMannWhitneyU(ma.map(m => m.durationMonths), mw.map(m => m.durationMonths));
  addRow('Duration months — median', aD.median, bD.median, v => _avFmtNum(v, 1), pD);

  let html = '<table class="av-table"><thead><tr>'
    + '<th>Metric</th><th>INRAE alone</th><th>INRAE + IT</th><th>Δ %</th><th>Sig.</th>'
    + '</tr></thead><tbody>';
  rows.forEach(r => {
    const dot = r.sigClass ? `<span class="av-sig-dot ${r.sigClass}"></span>` : '';
    html += '<tr>'
      + `<td class="av-lbl">${r.label}</td>`
      + `<td class="av-num">${r.a}</td>`
      + `<td class="av-num">${r.b}</td>`
      + `<td class="av-num ${r.deltaClass}">${r.delta}</td>`
      + `<td class="av-num ${r.sigClass}">${dot}${r.sig}</td>`
      + '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function _avRenderSchemeTable(popAloneFull, popWithFull) {
  let html = '<table class="av-table av-scheme-table"><thead><tr>'
    + '<th>Action</th>'
    + '<th>alone</th><th>+IT</th>'
    + '<th>IT %</th>'
    + '</tr></thead><tbody>';
  AV_SCHEME_ORDER.forEach(grp => {
    const a = popAloneFull.filter(x => x.m.schemeGroup === grp);
    const b = popWithFull.filter(x => x.m.schemeGroup === grp);
    if (a.length === 0 && b.length === 0) return;   // skip empty groups (e.g. "Other")
    const total = a.length + b.length;
    const rate = total ? (b.length / total * 100) : null;
    html += '<tr>'
      + `<td class="av-lbl">${grp}</td>`
      + `<td class="av-num">${a.length}</td>`
      + `<td class="av-num">${b.length}</td>`
      + `<td class="av-num">${_avFmtPctShare(rate)}</td>`
      + '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

/* SVG boxplot — viewBox 220×280, two boxes (alone vs +IT) on shared Y scale.
   tickFn(v) → optional formatter for Y axis ticks (e.g. v => (v/1e6).toFixed(1) for €→M€). */
function _avRenderBoxplot(containerId, aloneRaw, withRaw, title, unit, tickFn) {
  const alone  = _avClean(aloneRaw).sort((a, b) => a - b);
  const withIt = _avClean(withRaw).sort((a, b) => a - b);

  function stats(arr) {
    if (!arr.length) return null;
    const q1 = _avPercentile(arr, 25);
    const med = _avPercentile(arr, 50);
    const q3 = _avPercentile(arr, 75);
    const iqr = q3 - q1;
    const lowFence = q1 - 1.5 * iqr;
    const highFence = q3 + 1.5 * iqr;
    let whiskerLow = arr[0], whiskerHigh = arr[arr.length - 1];
    for (const v of arr) { if (v >= lowFence) { whiskerLow = v; break; } }
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] <= highFence) { whiskerHigh = arr[i]; break; } }
    const outliers = arr.filter(v => v < lowFence || v > highFence);
    return { q1, med, q3, whiskerLow, whiskerHigh, outliers, n: arr.length };
  }
  const sa = stats(alone);
  const sw = stats(withIt);

  const W = 220, H = 280;
  const padTop = 28, padBottom = 50, padLeft = 38, padRight = 12;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const buckets = [];
  if (sa) buckets.push(sa.whiskerLow, sa.whiskerHigh, ...sa.outliers);
  if (sw) buckets.push(sw.whiskerLow, sw.whiskerHigh, ...sw.outliers);
  let yMin = buckets.length ? Math.min(...buckets) : 0;
  let yMax = buckets.length ? Math.max(...buckets) : 1;
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const range = yMax - yMin;
  yMin -= range * 0.05;
  yMax += range * 0.05;
  const yScale = v => padTop + innerH - (v - yMin) / (yMax - yMin) * innerH;

  const boxW = 36;
  const xAlone = padLeft + innerW * 0.30;
  const xWith  = padLeft + innerW * 0.70;

  function fmtTick(v) {
    if (tickFn) return tickFn(v);
    const r = yMax - yMin;
    if (r >= 10) return Math.round(v).toString();
    return v.toFixed(1);
  }

  const svg = [`<svg viewBox="0 0 ${W} ${H}" class="av-boxplot" xmlns="http://www.w3.org/2000/svg">`];
  svg.push(`<text x="${W / 2}" y="16" text-anchor="middle" class="av-bp-title">${title}</text>`);

  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * (i / 4);
    const y = yScale(v);
    svg.push(`<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${W - padRight}" y2="${y.toFixed(1)}" class="av-bp-grid"/>`);
    svg.push(`<text x="${padLeft - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="av-bp-tick">${fmtTick(v)}</text>`);
  }

  function drawBox(s, x, color) {
    if (!s) return;
    const yL = yScale(s.whiskerLow), yH = yScale(s.whiskerHigh);
    const yQ1 = yScale(s.q1), yQ3 = yScale(s.q3), yMed = yScale(s.med);
    svg.push(`<line x1="${x}" y1="${yL.toFixed(1)}" x2="${x}" y2="${yH.toFixed(1)}" stroke="${color}" stroke-width="1.4"/>`);
    svg.push(`<line x1="${x - boxW / 4}" y1="${yL.toFixed(1)}" x2="${x + boxW / 4}" y2="${yL.toFixed(1)}" stroke="${color}" stroke-width="1.4"/>`);
    svg.push(`<line x1="${x - boxW / 4}" y1="${yH.toFixed(1)}" x2="${x + boxW / 4}" y2="${yH.toFixed(1)}" stroke="${color}" stroke-width="1.4"/>`);
    svg.push(`<rect x="${x - boxW / 2}" y="${yQ3.toFixed(1)}" width="${boxW}" height="${(yQ1 - yQ3).toFixed(1)}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1.5"/>`);
    svg.push(`<line x1="${x - boxW / 2}" y1="${yMed.toFixed(1)}" x2="${x + boxW / 2}" y2="${yMed.toFixed(1)}" stroke="${color}" stroke-width="2"/>`);
    s.outliers.forEach(v => {
      svg.push(`<circle cx="${x}" cy="${yScale(v).toFixed(1)}" r="2" fill="none" stroke="${color}" stroke-width="1"/>`);
    });
  }

  drawBox(sa, xAlone, AV_COLOR_ALONE);
  drawBox(sw, xWith,  AV_COLOR_WITH);

  svg.push(`<text x="${xAlone}" y="${H - 30}" text-anchor="middle" class="av-bp-xlabel" fill="${AV_COLOR_ALONE}">alone</text>`);
  svg.push(`<text x="${xWith}"  y="${H - 30}" text-anchor="middle" class="av-bp-xlabel" fill="${AV_COLOR_WITH}">+IT</text>`);
  svg.push(`<text x="${xAlone}" y="${H - 16}" text-anchor="middle" class="av-bp-n">n=${sa ? sa.n : 0}</text>`);
  svg.push(`<text x="${xWith}"  y="${H - 16}" text-anchor="middle" class="av-bp-n">n=${sw ? sw.n : 0}</text>`);
  if (unit) svg.push(`<text x="6" y="${(padTop - 4).toFixed(1)}" class="av-bp-unit">${unit}</text>`);

  svg.push('</svg>');
  document.getElementById(containerId).innerHTML = svg.join('');
}

function _avRenderItRateChart(popAlone, popWith) {
  destroyChart('av-chart-it-rate');
  const yearMap = new Map();
  popAlone.forEach(({ m }) => {
    if (!m.yearStart) return;
    if (!yearMap.has(m.yearStart)) yearMap.set(m.yearStart, { alone: 0, withIt: 0 });
    yearMap.get(m.yearStart).alone++;
  });
  popWith.forEach(({ m }) => {
    if (!m.yearStart) return;
    if (!yearMap.has(m.yearStart)) yearMap.set(m.yearStart, { alone: 0, withIt: 0 });
    yearMap.get(m.yearStart).withIt++;
  });
  const years = [...yearMap.keys()].sort((a, b) => a - b);
  const data = years.map(y => {
    const d = yearMap.get(y);
    const total = d.alone + d.withIt;
    return { year: y, alone: d.alone, withIt: d.withIt, total, rate: total ? d.withIt / total * 100 : 0 };
  });
  CHARTS['av-chart-it-rate'] = new Chart(document.getElementById('av-chart-it-rate'), {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [{
        label: 'IT collaboration rate',
        data: data.map(d => +d.rate.toFixed(1)),
        backgroundColor: 'rgba(26,79,138,0.7)',
        borderColor: AV_COLOR_WITH, borderWidth: 1, borderRadius: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => `Year ${items[0].label}`,
            label: c => {
              const d = data[c.dataIndex];
              return [
                `IT rate: ${d.rate.toFixed(1)} %`,
                `n with IT: ${d.withIt}`,
                `n alone: ${d.alone}`,
                `n total: ${d.total}`
              ];
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Project start year' }, ticks: { font: { size: 10 } } },
        y: { beginAtZero: true, max: 100, title: { display: true, text: 'IT rate' },
             ticks: { callback: v => v + ' %' } }
      }
    }
  });
}

/* ─────────────── Main entry ─────────────── */

function _avSetScope(scope) {
  if (scope !== 'RIA' && scope !== 'ALL') return;
  if (scope === AV_SCOPE) return;
  AV_SCOPE = scope;
  renderStats();
}

function renderStats() {
  const panel = document.getElementById('tab-stats');
  if (!panel || !Array.isArray(ALL) || !ALL.length) return;

  // Destroy existing charts (panel.innerHTML is about to be replaced)
  destroyChart('av-chart-it-rate');

  // Populations from ALL — independent of FILTERS / VISIBLE_PROJECTS
  const popAloneFull = ALL.filter(p => p.hasINRAE && !p.hasIT).map(p => ({ p, m: _avProjectMetrics(p) }));
  const popWithFull  = ALL.filter(p => p.hasINRAE &&  p.hasIT).map(p => ({ p, m: _avProjectMetrics(p) }));

  const inScope = m => AV_SCOPE === 'RIA' ? m.schemeGroup === 'RIA' : true;
  const popAlone = popAloneFull.filter(x => inScope(x.m));
  const popWith  = popWithFull.filter(x => inScope(x.m));

  const scopeLabel = AV_SCOPE === 'RIA' ? 'RIA only' : 'all actions';

  panel.innerHTML = `
    <div class="av-bandeau">
      <div class="av-bandeau-row">
        <h2 class="av-title">Statistical Analysis</h2>
        <div class="av-toggle-group">
          <span class="av-toggle-label">Scope</span>
          <button class="av-toggle ${AV_SCOPE === 'RIA' ? 'on' : ''}" onclick="_avSetScope('RIA')">RIA only</button>
          <button class="av-toggle ${AV_SCOPE === 'ALL' ? 'on' : ''}" onclick="_avSetScope('ALL')">All actions</button>
        </div>
      </div>
      <div class="av-pop-counts">
        <span class="av-c-tag av-c-alone"><span class="av-c-dot"></span>INRAE alone <strong>n=${popAlone.length}</strong></span>
        <span class="av-c-tag av-c-with"><span class="av-c-dot"></span>INRAE + IT <strong>n=${popWith.length}</strong></span>
        ${AV_SCOPE === 'RIA'
          ? `<span class="av-c-meta">(of ${popAloneFull.length} / ${popWithFull.length} all actions)</span>`
          : ''}
      </div>
      <div class="av-warning">
        ⚠ Sidebar filters do not apply here — scope set by the toggle above.
      </div>
    </div>

    <div class="av-top-grid">
      <div class="av-top-side">
        <div class="av-section">
          <h3 class="av-section-title">IT presence by action type <span class="av-section-meta">— all actions</span></h3>
          ${_avRenderSchemeTable(popAloneFull, popWithFull)}
          <p class="av-note">
            IT % = n with IT / (n alone + n with IT) within each action type.
          </p>
        </div>
      </div>
      <div class="av-top-main">
        <div class="av-section">
          <h3 class="av-section-title">Master comparative table — ${scopeLabel} (n=${popAlone.length} / ${popWith.length})</h3>
          ${_avRenderMasterTable(popAlone, popWith)}
          <p class="av-note">
            Δ % = (INRAE+IT − INRAE alone) / INRAE alone × 100, computed on the same statistic.
            Projects with missing values are excluded from a metric but stay in the group n.
            Sig. = two-sided Mann-Whitney U with tie + continuity correction (one test per metric, on the first row).
            <span class="av-sig-dot av-sig-strong"></span> p&lt;0.01 ·
            <span class="av-sig-dot av-sig-mid"></span> p&lt;0.05 ·
            <span class="av-sig-dot av-sig-no"></span> ns
          </p>
        </div>
      </div>
    </div>

    <div class="av-section">
      <h3 class="av-section-title">Distribution comparison (${scopeLabel})</h3>
      <div class="av-boxplots">
        <div class="av-bp-cell" id="av-box-budget"></div>
        <div class="av-bp-cell" id="av-box-partners"></div>
        <div class="av-bp-cell" id="av-box-orgtypes"></div>
        <div class="av-bp-cell" id="av-box-duration"></div>
      </div>
      <p class="av-note">
        Box = P25–P75, line = median, whiskers cap at 1.5×IQR, circles = outliers.
      </p>
    </div>

    <div class="av-section">
      <h3 class="av-section-title">IT collaboration rate by year (${scopeLabel})</h3>
      <div class="av-chart-wrap"><canvas id="av-chart-it-rate"></canvas></div>
      <p class="av-note">
        For each project start year: rate = n(INRAE+IT) / n(INRAE total). Hover bars for raw counts.
      </p>
    </div>
  `;

  _avRenderBoxplot('av-box-budget',
    popAlone.map(x => x.m.budget), popWith.map(x => x.m.budget),
    'EU budget', 'M€', v => (v / 1e6).toFixed(1));
  _avRenderBoxplot('av-box-partners',
    popAlone.map(x => x.m.nPartners), popWith.map(x => x.m.nPartners),
    'Partners', 'count');
  _avRenderBoxplot('av-box-orgtypes',
    popAlone.map(x => x.m.nActivityTypes), popWith.map(x => x.m.nActivityTypes),
    'Distinct activity types', 'count');
  _avRenderBoxplot('av-box-duration',
    popAlone.map(x => x.m.durationMonths), popWith.map(x => x.m.durationMonths),
    'Duration', 'months');

  _avRenderItRateChart(popAlone, popWith);
}
