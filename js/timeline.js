/* ══════════════════════════════════════════════════════════════
   timeline.js — Timeline tab (Gantt + concurrent projects chart)
   ══════════════════════════════════════════════════════════════ */

function renderTimeline() {
  const gf = document.getElementById('gantt-filter').value;
  const gs = document.getElementById('gantt-sort').value;
  let proj = FILTERED.filter(p => (gf === 'ALL' || p.status === 'SIGNED') && p.startDate && p.endDate);
  if (gs === 'end-desc') proj.sort((a, b) => b.endDate.localeCompare(a.endDate));
  else proj.sort((a, b) => a.endDate.localeCompare(b.endDate));

  if (!proj.length) {
    document.getElementById('gantt-wrap').innerHTML = '<div class="empty"><span class="big">∅</span>No projects to display.</div>';
    return;
  }

  const allD = proj.flatMap(p => [p.startDate, p.endDate]).filter(Boolean);
  let minD = new Date(allD.reduce((a, b) => a < b ? a : b));
  let maxD = new Date(allD.reduce((a, b) => a > b ? a : b));
  minD = new Date(minD.getFullYear(), minD.getMonth() - 1, 1);
  maxD = new Date(maxD.getFullYear(), maxD.getMonth() + 2, 1);
  const totalMs = maxD - minD;

  // Year ticks
  const ticks = [];
  let t = new Date(minD.getFullYear(), 0, 1);
  while (t <= maxD) { if (t >= minD) ticks.push(new Date(t)); t = new Date(t.getFullYear() + 1, 0, 1); }

  const today = new Date();
  const todayPct = Math.max(0, Math.min(100, (today - minD) / totalMs * 100));
  const pct = d => Math.max(0, (new Date(d) - minD) / totalMs * 100);
  const w = (s, e) => Math.max(0.5, (new Date(e) - new Date(s)) / totalMs * 100);

  const GANTT_PROGS = [
    { key: 'FP7',     label: 'FP7' },
    { key: 'H2020',   label: 'H2020' },
    { key: 'HORIZON', label: 'Horizon Europe' },
  ];
  const legend = `<div class="gantt-legend">${
    GANTT_PROGS.map(({ key, label }) =>
      `<span><span class="gl-dot" style="background:${PROG_COLORS[key]}"></span>${label}</span>`
    ).join('')
  }<span class="gl-closed"><span class="gl-dot" style="background:rgba(100,100,100,.3)"></span>Closed</span></div>`;

  const head = `<div class="gantt-head">
    <div class="g-label-col">Project</div>
    <div class="g-months">${ticks.map(d => `<div class="g-tick">${d.getFullYear()}</div>`).join('')}</div>
  </div>`;

  const rows = proj.map(p => {
    const base = PROG_COLORS[normProg(p)] || 'rgba(100,100,100,.8)';
    const barColor = p.status === 'CLOSED' ? base.replace(/[\d.]+\)$/, '.3)') : base;
    const roles = [];
    if (p.hasIT)    roles.push(`IT: ${roleL(p.itRole)}`);
    if (p.hasINRAE) roles.push(`INRAE: ${roleL(p.inraeRole)}`);
    return `<div class="g-row">
      <div class="g-name" onclick="openModal('${p.id}','${p.programme}')" title="${p.title}">${p.acronym || '–'}</div>
      <div style="flex:1;position:relative;height:13px">
        <div class="g-bar" style="left:${pct(p.startDate)}%;width:${w(p.startDate, p.endDate)}%;background:${barColor}"
             onclick="openModal('${p.id}','${p.programme}')"
             title="${p.acronym} | ${fmtD(p.startDate)} → ${fmtD(p.endDate)} | ${p.status} | ${roles.join(' · ')}"></div>
        <div style="position:absolute;top:0;bottom:0;width:1.5px;background:var(--red);opacity:.4;left:${todayPct}%;pointer-events:none"></div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('gantt-wrap').innerHTML = legend + head + rows;

  // Simultaneous active projects per year
  const allProj = FILTERED.filter(p => p.startDate && p.endDate);
  if (allProj.length) {
    const years = [];
    const minY = Math.min(...allProj.map(p => parseInt(p.startDate)));
    const maxY = Math.max(...allProj.map(p => parseInt(p.endDate)));
    for (let y = minY; y <= maxY; y++) years.push(y);

    const PROG_ORDER  = ['FP7', 'H2020', 'HORIZON'];
    const PROG_LABELS = { 'FP7': 'FP7', 'H2020': 'H2020', 'HORIZON': 'Horizon Europe' };
    const currentYear = new Date().getFullYear();
    const byYProg = {};
    years.forEach(y => { byYProg[y] = { FP7: 0, H2020: 0, HORIZON: 0 }; });
    allProj.forEach(p => {
      const s = parseInt(p.startDate);
      const e = parseInt(p.endDate);
      const prog = normProg(p);
      for (let y = s; y <= e; y++) {
        if (byYProg[y]) byYProg[y][prog] = (byYProg[y][prog] || 0) + 1;
      }
    });

    destroyChart('chart-concurrent');
    CHARTS['chart-concurrent'] = new Chart(document.getElementById('chart-concurrent'), {
      type: 'bar',
      data: {
        labels: years,
        datasets: PROG_ORDER
          .filter(prog => years.some(y => byYProg[y][prog] > 0))
          .map(prog => ({
            label: PROG_LABELS[prog],
            data: years.map(y => byYProg[y][prog]),
            backgroundColor: years.map(y => y === currentYear
              ? PROG_COLORS[prog].replace(/[\d.]+\)$/, '1)')
              : PROG_COLORS[prog].replace(/[\d.]+\)$/, '0.6)')),
            borderRadius: 2,
          }))
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: c => `${c.dataset.label}: ${c.raw} active project${c.raw !== 1 ? 's' : ''}`,
              footer: items => {
                const total = items.reduce((s, it) => s + it.raw, 0);
                return `Total: ${total}`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true, title: { display: true, text: 'Year' } },
          y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, title: { display: true, text: 'Active projects' } }
        }
      }
    });
  }
}
