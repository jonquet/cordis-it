/* ══════════════════════════════════════════════════════════════
   stats.js — Statistical Analysis tab
   Sidebar-independent: always reads from ALL. Rendered once at init.
   Audience: IT + INRAE members. Purpose: show IT's positioning in
   INRAE's European portfolio and profile the consortia they lead
   together.

   Structure:
     1. Intro bandeau — descriptive, dynamic key numbers
     2. Block A — coverage matrix (one row per action type)
     3. Block C — consortium profile (4 boxplots, RIA only,
                  INRAE coord + IT vs INRAE participant)
   ══════════════════════════════════════════════════════════════ */

const AV_EU27 = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR',
  'DE','GR','HU','IE','IT','LV','LT','LU','MT','NL',
  'PL','PT','RO','SK','SI','ES','SE'
]);

const AV_SCHEME_ORDER = ['RIA','IA','MSCA','ERC','CSA','EIC','INFRA','COFUND','Other'];

/* Reserved palette (kept for compatibility / future re-use) */
const AV_GROUP_COLORS = ['#1a4f8a', '#00847f', '#92600a', '#b91c1c', '#7c3aed', '#0891b2', '#be185d'];

/* Two-group colors used throughout Block C */
const AV_COLOR_COORD_IT = '#1a4f8a';   // IT blue — INRAE coord + IT
const AV_COLOR_PARTI    = '#00847f';   // INRAE green — INRAE participant

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
  if (!c.length) { kinds.forEach(k => out[k] = null); return out; }
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

/* Lanczos approximation for ln(Γ(s)), s > 0 */
function _avLnGamma(s) {
  if (s < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * s)) - _avLnGamma(1 - s);
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  s -= 1;
  let a = c[0];
  for (let i = 1; i < 9; i++) a += c[i] / (s + i);
  const t = s + 7 + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (s + 0.5) * Math.log(t) - t + Math.log(a);
}

/* Regularized lower incomplete gamma P(s, x) — Numerical Recipes 6.2.
   Returns a value in [0, 1]. */
function _avRegLowerGamma(s, x) {
  if (x <= 0 || s <= 0) return 0;
  const lnGammaS = _avLnGamma(s);
  if (x < s + 1) {
    let ap = s, sum = 1 / s, del = 1 / s;
    for (let n = 0; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return Math.max(0, Math.min(1, sum * Math.exp(-x + s * Math.log(x) - lnGammaS)));
  } else {
    let b = x + 1 - s, c = 1e30, d = 1 / b, h = d;
    for (let i = 1; i <= 200; i++) {
      const an = -i * (i - s);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    const Q = h * Math.exp(-x + s * Math.log(x) - lnGammaS);
    return Math.max(0, Math.min(1, 1 - Q));
  }
}

/* Kruskal-Wallis H (omnibus, k ≥ 2 groups) with tie correction.
   Returns p (chi² with df = k−1) or null when insufficient data. */
function _avKruskalWallis(groupsArr) {
  const groups = groupsArr.map(g => _avClean(g));
  const nonEmpty = groups.filter(g => g.length > 0);
  if (nonEmpty.length < 2) return null;
  const N = groups.reduce((s, g) => s + g.length, 0);
  if (N < 3) return null;

  const combined = [];
  groups.forEach((g, i) => g.forEach(v => combined.push([v, i])));
  combined.sort((a, b) => a[0] - b[0]);

  const ranks = new Array(N);
  const tieGroups = [];
  let i = 0;
  while (i < N) {
    let j = i;
    while (j + 1 < N && combined[j + 1][0] === combined[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;
    const size = j - i + 1;
    if (size > 1) tieGroups.push(size);
    for (let m = i; m <= j; m++) ranks[m] = avgRank;
    i = j + 1;
  }

  const k = groups.length;
  const Rsum = new Array(k).fill(0);
  const ni   = new Array(k).fill(0);
  for (let m = 0; m < N; m++) {
    Rsum[combined[m][1]] += ranks[m];
    ni[combined[m][1]]++;
  }

  let H = 0;
  for (let g = 0; g < k; g++) if (ni[g] > 0) H += Rsum[g] * Rsum[g] / ni[g];
  H = (12 / (N * (N + 1))) * H - 3 * (N + 1);

  if (tieGroups.length) {
    const sumT = tieGroups.reduce((s, t) => s + (t * t * t - t), 0);
    const C = 1 - sumT / (N * N * N - N);
    if (C > 0) H = H / C;
  }

  const df = ni.filter(n => n > 0).length - 1;
  if (df < 1 || !isFinite(H) || H < 0) return null;
  return 1 - _avRegLowerGamma(df / 2, H / 2);
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

  return {
    budget: budget > 0 ? budget : null,
    nPartners: partners.length || null,
    nCountries: countries.size || null,
    nNonEu: nonEu,
    nActivityTypes: activityTypes.size || null,
    durationMonths,
    schemeGroup: p.schemeGroup || schemeGroup(p.fundingSchemeShort || p.fundingScheme || ''),
    programme: p.programme || normProg(p)
  };
}

/* ─────────────── Formatters ─────────────── */

function _avFmtSig(p) {
  if (p === null || p === undefined || !isFinite(p)) return { text: '—', stars: '', klass: '' };
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

function _avFmtPctShare(v, dec) {
  if (v === null || v === undefined) return '—';
  return v.toFixed(dec === undefined ? 1 : dec) + ' %';
}

/* ─────────────── Boxplot (unchanged signature) ─────────────── */

function _avRenderBoxplot(containerId, series, title, unit, tickFn) {
  function boxStats(arr) {
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
  const stats = series.map(s => boxStats(_avClean(s.values).sort((a, b) => a - b)));

  const W = 220, H = 280;
  const padTop = 28, padBottom = 50, padLeft = 38, padRight = 12;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const buckets = [];
  stats.forEach(s => { if (s) buckets.push(s.whiskerLow, s.whiskerHigh, ...s.outliers); });
  let yMin = buckets.length ? Math.min(...buckets) : 0;
  let yMax = buckets.length ? Math.max(...buckets) : 1;
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const range = yMax - yMin;
  yMin -= range * 0.05;
  yMax += range * 0.05;
  const yScale = v => padTop + innerH - (v - yMin) / (yMax - yMin) * innerH;

  const n = series.length;
  const slot = innerW / Math.max(n, 1);
  const boxW = Math.min(36, slot * 0.55);
  const xPos = i => padLeft + slot * (i + 0.5);

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
  series.forEach((s, i) => drawBox(stats[i], xPos(i), s.color));

  const maxLen = n <= 3 ? 12 : n <= 5 ? 8 : 6;
  series.forEach((s, i) => {
    const x = xPos(i);
    const lbl = s.label.length > maxLen ? s.label.slice(0, maxLen - 1) + '…' : s.label;
    svg.push(`<text x="${x}" y="${H - 30}" text-anchor="middle" class="av-bp-xlabel" fill="${s.color}">${lbl}</text>`);
    svg.push(`<text x="${x}" y="${H - 16}" text-anchor="middle" class="av-bp-n">n=${stats[i] ? stats[i].n : 0}</text>`);
  });

  if (unit) svg.push(`<text x="6" y="${(padTop - 4).toFixed(1)}" class="av-bp-unit">${unit}</text>`);

  svg.push('</svg>');
  document.getElementById(containerId).innerHTML = svg.join('');
}

/* ─────────────── Renderers ─────────────── */

function _avRenderCoverageMatrix(allInrae) {
  let html = '<table class="av-table av-coverage-table"><thead><tr>'
    + '<th>Action</th>'
    + '<th>INRAE projects</th>'
    + '<th>INRAE-coordinated</th>'
    + '<th>IT % of INRAE coordinations</th>'
    + '</tr></thead><tbody>';
  AV_SCHEME_ORDER.forEach(grp => {
    const inrae = allInrae.filter(p => p.schemeGroup === grp);
    if (inrae.length === 0) return;
    const coord   = inrae.filter(p => p.inraeRole === 'coordinator');
    const coordIt = coord.filter(p => p.hasIT);
    const pct = coord.length ? (coordIt.length / coord.length * 100) : null;
    const pctCell = pct === null
      ? '<span class="av-num">—</span>'
      : `<div class="av-progress" title="${coordIt.length} of ${coord.length} INRAE-coordinated ${grp} projects involve IT">
           <div class="av-progress-bar" style="width:${pct.toFixed(1)}%"></div>
           <span class="av-progress-text">${pct.toFixed(0)} %</span>
         </div>`;
    html += '<tr>'
      + `<td class="av-lbl">${grp}</td>`
      + `<td class="av-num">${inrae.length}</td>`
      + `<td class="av-num">${coord.length}</td>`
      + `<td class="av-num av-pct-cell">${pctCell}</td>`
      + '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

/* ─────────────── Main entry ─────────────── */

function renderStats() {
  const panel = document.getElementById('tab-stats');
  if (!panel || !Array.isArray(ALL) || !ALL.length) return;

  /* All numbers below derived dynamically from ALL — sidebar-independent. */

  // Intro key figures
  const allInrae = ALL.filter(p => p.hasINRAE);
  const riaInrae = allInrae.filter(p => p.schemeGroup === 'RIA');
  const riaInraeCoord = riaInrae.filter(p => p.inraeRole === 'coordinator');
  const riaInraeCoordIt = riaInraeCoord.filter(p => p.hasIT);
  const riaInraeCoordNoIt = riaInraeCoord.filter(p => !p.hasIT);
  const pctItInCoord = riaInraeCoord.length
    ? (riaInraeCoordIt.length / riaInraeCoord.length * 100)
    : 0;
  const nTotal = ALL.length;

  // Block C populations
  const groupCoordIt = riaInraeCoordIt;
  const groupParti   = riaInrae.filter(p => p.inraeRole === 'participant');
  const metricsCoordIt = groupCoordIt.map(_avProjectMetrics);
  const metricsParti   = groupParti.map(_avProjectMetrics);

  const sig = key => _avKruskalWallis([
    metricsCoordIt.map(m => m[key]),
    metricsParti.map(m => m[key])
  ]);
  const sigBudget   = _avFmtSig(sig('budget'));
  const sigPartners = _avFmtSig(sig('nPartners'));
  const sigActTypes = _avFmtSig(sig('nActivityTypes'));
  const sigDuration = _avFmtSig(sig('durationMonths'));

  panel.innerHTML = `
    <div class="av-bandeau">
      <h2 class="av-title">Statistical Analysis</h2>
      <p class="av-intro">
        This page shows <strong>IT</strong>'s position within <strong>INRAE</strong>'s European research
        portfolio and characterises the consortia they lead together. Out of
        <strong>${riaInrae.length}</strong> RIA projects involving INRAE,
        <strong>${riaInraeCoord.length}</strong> are coordinated by INRAE, and
        <strong>IT figures in ${pctItInCoord.toFixed(0)} %</strong> of those — the central insight
        explored below.
        <span class="av-intro-meta">Dataset: ${nTotal} projects total (IT or INRAE involved).</span>
      </p>
    </div>

    <div class="av-section">
      <h3 class="av-section-title">Coverage matrix <span class="av-section-meta">— by action type</span></h3>
      ${_avRenderCoverageMatrix(allInrae)}
      <p class="av-note">
        For each action type: how many projects involve INRAE, how many are INRAE-coordinated,
        and what share of those coordinations also involve IT.
        The IT % bar reads as <em>n(INRAE coord + IT) / n(INRAE coord)</em>.
      </p>
    </div>

    <div class="av-section">
      <h3 class="av-section-title">
        Consortium profile <span class="av-section-meta">— RIA only: INRAE coord + IT vs INRAE participant</span>
      </h3>
      <p class="av-note av-note-callout">
        Note: <strong>${riaInraeCoordNoIt.length}</strong> INRAE-coordinated RIA
        project${riaInraeCoordNoIt.length === 1 ? '' : 's'} without IT
        ${riaInraeCoordNoIt.length === 1 ? 'is' : 'are'} not shown here (too few for a reliable third group).
      </p>
      <div class="av-boxplots">
        <div class="av-bp-cell">
          <div id="av-box-budget"></div>
          <div class="av-bp-sig ${sigBudget.klass}">p = ${sigBudget.text}</div>
        </div>
        <div class="av-bp-cell">
          <div id="av-box-partners"></div>
          <div class="av-bp-sig ${sigPartners.klass}">p = ${sigPartners.text}</div>
        </div>
        <div class="av-bp-cell">
          <div id="av-box-orgtypes"></div>
          <div class="av-bp-sig ${sigActTypes.klass}">p = ${sigActTypes.text}</div>
        </div>
        <div class="av-bp-cell">
          <div id="av-box-duration"></div>
          <div class="av-bp-sig ${sigDuration.klass}">p = ${sigDuration.text}</div>
        </div>
      </div>
      <p class="av-note">
        Box = P25–P75, line = median, whiskers cap at 1.5×IQR, circles = outliers.
        p-value from Kruskal-Wallis (two-group case, equivalent to Mann-Whitney with continuity correction).
      </p>
    </div>
  `;

  const seriesFor = key => ([
    { values: metricsCoordIt.map(m => m[key]), label: 'coord+IT',  color: AV_COLOR_COORD_IT },
    { values: metricsParti.map(m => m[key]),   label: 'particip',  color: AV_COLOR_PARTI }
  ]);

  _avRenderBoxplot('av-box-budget',   seriesFor('budget'),         'EU budget',               'M€',    v => (v / 1e6).toFixed(1));
  _avRenderBoxplot('av-box-partners', seriesFor('nPartners'),      'Partners',                'count');
  _avRenderBoxplot('av-box-orgtypes', seriesFor('nActivityTypes'), 'Distinct activity types', 'count');
  _avRenderBoxplot('av-box-duration', seriesFor('durationMonths'), 'Duration',                'months');
}
