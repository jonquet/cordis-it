/* ══════════════════════════════════════════════════════════════
   budget.js — Budget tab (stats + charts), mode-aware
   ══════════════════════════════════════════════════════════════ */

function renderBudget() {
  // Per-project budget value depending on active VIEW_MODE
  const pBudget = p => VIEW_MODE === 'BOTH'
    ? (p.itEcContribution || 0) + (p.inraeEcContribution || 0)
    : (p[activeBudgetField()] || 0);

  const lbl = activeColors().label;   // 'IT' | 'INRAE' | 'IT + INRAE'

  // ── Aggregate stats on combined-or-single budget ──
  const valued = FILTERED.map(p => ({ p, v: pBudget(p) })).filter(x => x.v > 0);
  const total  = valued.reduce((s, x) => s + x.v, 0);
  const avg    = valued.length ? total / valued.length : 0;
  const sorted = [...valued].sort((a, b) => a.v - b.v);
  const minE   = sorted.length ? sorted[0] : null;
  const maxE   = sorted.length ? sorted[sorted.length - 1] : null;
  const min    = minE ? minE.v : 0;
  const max    = maxE ? maxE.v : 0;

  // Average annual budget (prorata) since 2012 to current year
  const AVG_BUDGET_START = 2012;
  const currentYear = new Date().getFullYear();
  const byYstat = {};
  valued.forEach(({ p, v }) => {
    if (!p.startDate || !p.endDate) return;
    const start = new Date(p.startDate);
    const end   = new Date(p.endDate);
    const totalDays = (end - start) / 86400000 + 1;
    if (totalDays <= 0) return;
    const dailyBudget = v / totalDays;
    for (let y = Math.max(start.getFullYear(), AVG_BUDGET_START); y <= Math.min(end.getFullYear(), currentYear); y++) {
      const yearStart    = new Date(y, 0, 1);
      const yearEnd      = new Date(y, 11, 31);
      const overlapStart = start > yearStart ? start : yearStart;
      const overlapEnd   = end   < yearEnd   ? end   : yearEnd;
      const daysInYear   = (overlapEnd - overlapStart) / 86400000 + 1;
      if (daysInYear > 0) byYstat[y] = (byYstat[y] || 0) + dailyBudget * daysInYear;
    }
  });
  const statYears = Object.keys(byYstat);
  const avgAnnual = statYears.length
    ? Object.values(byYstat).reduce((s, v) => s + v, 0) / statYears.length
    : 0;

  // ── Stats cards ──
  const totalLbl = VIEW_MODE === 'BOTH' ? 'Total EU Contribution' : `Total ${lbl} EU Contribution`;
  const knownLbl = VIEW_MODE === 'BOTH' ? 'with known budget' : `with known ${lbl} budget`;
  const totalSub = VIEW_MODE === 'BOTH' ? '<div class="stat-sub">IT+INRAE combined</div>' : '';

  let cardsHTML = `
    <div class="stat-card"><div class="stat-val">${FILTERED.length}</div><div class="stat-lbl">Projects</div><div class="stat-sub">${valued.length} ${knownLbl}</div></div>
    <div class="stat-card"><div class="stat-val">${fmtM(total)}</div><div class="stat-lbl">${totalLbl}</div>${totalSub}</div>`;

  if (VIEW_MODE === 'BOTH') {
    const totalIT    = FILTERED.reduce((s, p) => s + (p.itEcContribution    || 0), 0);
    const totalINRAE = FILTERED.reduce((s, p) => s + (p.inraeEcContribution || 0), 0);
    cardsHTML += `
    <div class="stat-card"><div class="stat-val">${fmtM(totalIT)}</div><div class="stat-lbl">Total IT</div></div>
    <div class="stat-card"><div class="stat-val">${fmtM(totalINRAE)}</div><div class="stat-lbl">Total INRAE</div></div>`;
  }

  cardsHTML += `
    <div class="stat-card"><div class="stat-val">${fmtM(avg)}</div><div class="stat-lbl">Average per project</div></div>
    <div class="stat-card"><div class="stat-val">${fmtM(min)}</div><div class="stat-lbl">Smallest</div>${minE ? `<div class="stat-sub">${minE.p.acronym || minE.p.title}</div>` : ''}</div>
    <div class="stat-card"><div class="stat-val">${fmtM(max)}</div><div class="stat-lbl">Largest</div>${maxE ? `<div class="stat-sub">${maxE.p.acronym || maxE.p.title}</div>` : ''}</div>
    <div class="stat-card"><div class="stat-val">${fmtM(avgAnnual)}</div><div class="stat-lbl">Avg annual budget</div><div class="stat-sub">Since 2012 (post FP6)</div></div>`;

  document.getElementById('budget-stats').innerHTML = cardsHTML;

  // ── Chart titles (mode-dependent) ──
  const titlePrefix = VIEW_MODE === 'BOTH' ? '' : lbl + ' ';
  document.getElementById('ct-hist').textContent   = `${titlePrefix}Grants Distribution (k€)`;
  document.getElementById('ct-scheme').textContent = `${titlePrefix}Budget by Funding Type`;
  document.getElementById('ct-time').textContent   = `${titlePrefix}Annual Budget (prorata over project duration)`;

  // ── Histogram ──
  const HIST = VIEW_MODE === 'IT'
    ? { bins: [0, 100, 200, 300, 400, 500, Infinity],
        labels: ['<100k', '100–200k', '200–300k', '300–400k', '400–500k', '>500k'] }
    : { bins: [0, 200, 400, 600, 800, 1000, Infinity],
        labels: ['<200k', '200–400k', '400–600k', '600–800k', '800k–1M', '>1M'] };
  const bins = HIST.bins, labels = HIST.labels;
  function binCounts(values) {
    const counts = new Array(labels.length).fill(0);
    values.forEach(v => {
      const k = v / 1000;
      const i = bins.findIndex((b, j) => k < bins[j + 1]);
      if (i >= 0) counts[i]++;
    });
    return counts;
  }

  let histDatasets, hasAny;
  if (VIEW_MODE === 'BOTH') {
    const itValues    = FILTERED.filter(p => p.hasIT).map(p => p.itEcContribution || 0).filter(x => x > 0);
    const inraeValues = FILTERED.filter(p => p.hasINRAE).map(p => p.inraeEcContribution || 0).filter(x => x > 0);
    histDatasets = [
      { label: 'IT',    data: binCounts(itValues),    backgroundColor: 'rgba(37,99,171,.7)', borderRadius: 3 },
      { label: 'INRAE', data: binCounts(inraeValues), backgroundColor: 'rgba(0,132,127,.7)', borderRadius: 3 },
    ];
    hasAny = itValues.length > 0 || inraeValues.length > 0;
  } else {
    const values = FILTERED.map(p => p[activeBudgetField()] || 0).filter(x => x > 0);
    histDatasets = [{ label: lbl, data: binCounts(values), backgroundColor: activeColors().rgba(0.7), borderRadius: 3 }];
    hasAny = values.length > 0;
  }

  const noBudgetText = VIEW_MODE === 'IT'    ? 'No known IT budget (funded via INRAE)'
                    :  VIEW_MODE === 'INRAE' ? 'No known INRAE budget'
                    :                          'No known IT or INRAE budget';

  destroyChart('chart-hist');
  const nobudgetPlugin = !hasAny ? [{
    id: 'nobudget',
    afterDraw(chart) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(107,114,128,.7)';
      ctx.font = '13px Lato, sans-serif';
      ctx.fillText(noBudgetText, width / 2, height / 2);
      ctx.restore();
    }
  }] : [];
  CHARTS['chart-hist'] = new Chart(document.getElementById('chart-hist'), {
    type: 'bar',
    data: { labels, datasets: histDatasets },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { display: VIEW_MODE === 'BOTH', position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { title: t => t[0].label, label: c => `${c.dataset.label}: ${c.raw} project${c.raw !== 1 ? 's' : ''}` } }
      },
      scales: {
        x: { stacked: VIEW_MODE === 'BOTH' },
        y: { stacked: VIEW_MODE === 'BOTH', beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
      }
    },
    plugins: nobudgetPlugin
  });

  // ── Donut by scheme group ──
  const bySG = {};
  FILTERED.forEach(p => {
    const g = p.schemeGroup || 'Other';
    if (!bySG[g]) bySG[g] = { count: 0, total: 0 };
    bySG[g].count++;
    bySG[g].total += pBudget(p);
  });
  const sgE = Object.entries(bySG).filter(e => e[1].total > 0).sort((a, b) => b[1].total - a[1].total);
  destroyChart('chart-scheme');
  CHARTS['chart-scheme'] = new Chart(document.getElementById('chart-scheme'), {
    type: 'doughnut',
    data: { labels: sgE.map(e => `${e[0]} (${fmtM(e[1].total)})`), datasets: [{ data: sgE.map(e => +(e[1].total / 1e6).toFixed(2)), backgroundColor: PAL }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: c => `${c.label.split(' (')[0]}: ${c.raw} M€` } } } }
  });

  // ── Annual budget by programme — stacked bar with prorata ──
  const byYProg = {};
  FILTERED.filter(p => pBudget(p) > 0 && p.startDate && p.endDate).forEach(p => {
    const v = pBudget(p);
    const prog = normProg(p);
    const start = new Date(p.startDate);
    const end = new Date(p.endDate);
    const totalDays = (end - start) / 86400000 + 1;
    if (totalDays <= 0) return;
    const dailyBudget = v / totalDays;
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      const yearStart = new Date(y, 0, 1);
      const yearEnd   = new Date(y, 11, 31);
      const overlapStart = start > yearStart ? start : yearStart;
      const overlapEnd   = end   < yearEnd   ? end   : yearEnd;
      const daysInYear = (overlapEnd - overlapStart) / 86400000 + 1;
      if (daysInYear > 0) {
        if (!byYProg[y]) byYProg[y] = {};
        byYProg[y][prog] = (byYProg[y][prog] || 0) + dailyBudget * daysInYear;
      }
    }
  });
  const years = Object.keys(byYProg).sort();
  const PROG_ORDER = ['FP7', 'H2020', 'HORIZON'];
  const PROG_LABELS = { 'FP7': 'FP7', 'H2020': 'H2020', 'HORIZON': 'Horizon Europe' };
  destroyChart('chart-time');
  CHARTS['chart-time'] = new Chart(document.getElementById('chart-time'), {
    type: 'bar',
    data: {
      labels: years,
      datasets: PROG_ORDER
        .filter(prog => years.some(y => byYProg[y]?.[prog] > 0))
        .map(prog => ({
          label: PROG_LABELS[prog],
          data: years.map(y => +((byYProg[y]?.[prog] || 0) / 1e6).toFixed(2)),
          backgroundColor: PROG_COLORS[prog],
          borderRadius: 2,
        }))
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw} M€` } }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: 'M€' }, grid: { color: 'rgba(0,0,0,.04)' } }
      }
    }
  });
}
