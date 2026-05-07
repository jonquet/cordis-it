/* ══════════════════════════════════════════════════════════════
   geography.js — Geography tab (choropleth, regions, charts)
   All stats use VISIBLE_PROJECTS (global), NOT FILTERED.
   Region clicks still filter other tabs via REGION_FILTER.
   ══════════════════════════════════════════════════════════════ */

let GEO_PATHS = null;
let GEO_CC = null;

async function loadGeoPaths() {
  if (GEO_PATHS) return;
  try {
    const r = await fetch(GEO_PATHS_URL);
    const data = await r.json();
    GEO_PATHS = data.paths;
    GEO_CC = data.cc;
  } catch (e) {
    console.warn('Could not load geo paths:', e);
    GEO_PATHS = {};
    GEO_CC = {};
  }
}

/* ── Helper: which countries belong to the selected European region? ── */
function getHighlightedCountryCodes() {
  if (!REGION_FILTER || !EURO_REGIONS.includes(REGION_FILTER)) return new Set();
  const codes = new Set(REGIONS[REGION_FILTER] || []);
  // Add alternate CORDIS codes (EL↔GR, UK↔GB)
  Object.entries(CC_NORM).forEach(([k, v]) => {
    if (codes.has(v)) codes.add(k);
    if (codes.has(k)) codes.add(v);
  });
  return codes;
}

function renderGeo() {
  // ── Global data for regions, stacked area ──
  const SRC = VISIBLE_PROJECTS;

  // ── Programme-filtered data for map + top 25 ──
  const SRC_PROG = FILTERS.programme.size
    ? VISIBLE_PROJECTS.filter(p => FILTERS.programme.has(p.programme))
    : VISIBLE_PROJECTS;

  // Country counts from programme-filtered source
  const ccProg = {};
  SRC_PROG.forEach(p => p.partnerCountries.forEach(c => { ccProg[c] = (ccProg[c] || 0) + 1; }));
  const sortedProg = Object.entries(ccProg).sort((a, b) => b[1] - a[1]);
  const maxCountProg = sortedProg.filter(([c]) => c !== 'FR').length ? sortedProg.filter(([c]) => c !== 'FR')[0][1] : 1;

  // Unique organisations per country (programme-filtered)
  const orgsByCountryProg = {};
  SRC_PROG.forEach(p => (p.partners || []).forEach(o => {
    if (!o.country) return;
    if (!orgsByCountryProg[o.country]) orgsByCountryProg[o.country] = new Set();
    orgsByCountryProg[o.country].add(o.name);
  }));
  const orgCountProg = {};
  Object.entries(orgsByCountryProg).forEach(([c, s]) => { orgCountProg[c] = s.size; });

  // Country counts from global source (for regions + stacked area)
  const cc = {};
  SRC.forEach(p => p.partnerCountries.forEach(c => { cc[c] = (cc[c] || 0) + 1; }));

  // ── Choropleth (programme-filtered) ──
  const highlightCodes = getHighlightedCountryCodes();
  if (GEO_PATHS) {
    renderChoropleth(ccProg, maxCountProg, orgCountProg, highlightCodes);
  } else {
    loadGeoPaths().then(() => renderChoropleth(ccProg, maxCountProg, orgCountProg, highlightCodes));
  }

  // ── Top 25 vertical bar chart (programme-filtered, excl. FR) ──
  const EU_MEMBERS = new Set(['AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR','EL','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);
  const top25 = sortedProg.filter(([c]) => c !== 'FR').slice(0, 25);
  const top25Colors = top25.map(([c]) => {
    const norm = CC_NORM[c] || c;
    return EU_MEMBERS.has(c) || EU_MEMBERS.has(norm) ? 'rgba(37,99,171,.65)' : 'rgba(156,163,175,.55)';
  });
  destroyChart('chart-countries');
  CHARTS['chart-countries'] = new Chart(document.getElementById('chart-countries'), {
    type: 'bar',
    data: {
      labels: top25.map(([c]) => CC_NORM[c] || c),
      datasets: [
        { label: 'EU member', data: top25.map(([c, n]) => { const norm = CC_NORM[c] || c; return (EU_MEMBERS.has(c) || EU_MEMBERS.has(norm)) ? n : null; }), backgroundColor: 'rgba(37,99,171,.65)', borderRadius: 3 },
        { label: 'Non-EU', data: top25.map(([c, n]) => { const norm = CC_NORM[c] || c; return (EU_MEMBERS.has(c) || EU_MEMBERS.has(norm)) ? null : n; }), backgroundColor: 'rgba(156,163,175,.55)', borderRadius: 3 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 12, padding: 10 } },
        tooltip: { callbacks: {
          title: items => { const code = items[0].label; return CC_NAMES[code] || CC_NAMES[CC_NORM[code]] || code; },
          label: c => c.raw !== null ? `${c.raw} participations` : ''
        } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 10 } } },
        x: { stacked: true, ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 40 } }
      }
    }
  });

  // ── Region tiles (global data) ──
  const countryBudget = {};
  SRC.forEach(p => (p.partners || []).forEach(o => {
    if (!o.country) return;
    countryBudget[o.country] = (countryBudget[o.country] || 0) + (o.ecContribution || 0);
  }));
  const rData = {};
  Object.keys(REGIONS).forEach(r => rData[r] = { count: 0, budget: 0, countries: [] });
  Object.entries(cc).forEach(([c, n]) => {
    const r = getRegion(c);
    if (!rData[r]) rData[r] = { count: 0, budget: 0, countries: [] };
    rData[r].count += (n || 0);
    rData[r].budget += (countryBudget[c] || 0);
    rData[r].countries.push(c);
  });
  const maxR = Math.max(...Object.values(rData).map(d => d.count), 1);
  const sortedRegions = Object.entries(rData).filter(([, d]) => d.count > 0).sort((a, b) => b[1].count - a[1].count);
  document.getElementById('region-grid').innerHTML = sortedRegions.map(([r, d]) => {
    const flags = d.countries.sort((a, b) => (cc[b] || 0) - (cc[a] || 0)).slice(0, 12).map(flag).join(' ');
    const budgetStr = d.budget > 0 ? fmtM(d.budget) : '–';
    const isActive = REGION_FILTER === r;
    return `<div class="region-card ${isActive ? 'region-active' : ''}" onclick="toggleRegion('${r}')"
      style="cursor:pointer;transition:all .15s;${isActive ? 'border-color:var(--it);box-shadow:0 0 0 2px var(--it-pale);' : ''}"
      onmouseover="if(!${isActive})this.style.borderColor='var(--it-light)'"
      onmouseout="if(!${isActive})this.style.borderColor='var(--rule)'">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
        <div class="region-name" style="${isActive ? 'color:var(--it)' : ''}">${r}</div>
        ${isActive ? `<span style="font-size:.6rem;color:var(--it);cursor:pointer" onclick="event.stopPropagation();toggleRegion('${r}')">✕</span>` : ''}
      </div>
      <div style="font-size:.78rem;margin:3px 0">${flags}</div>
      <div class="rbar-wrap"><div class="rbar-fill" style="width:${d.count / maxR * 100}%;${isActive ? 'background:var(--it);' : ''}"></div></div>
      <div class="rstat">${d.count} · ${budgetStr}</div>
    </div>`;
  }).join('');

  // ── Stacked area chart (absolute, not 100%) — global data ──
  // Colors derived from DONUT_PAL with aa transparency (≈67%) for fill, full color for border
  const REG_COLORS_T = {
    'Western Europe':            '#3b82f666',
    'Northern Europe':           '#22d3ee66',
    'Southern Europe':           '#f59e0b66',
    'Central & Eastern Europe':  '#a78bfa66',
    'Americas & Oceania':        '#34d39966',
    'Asia':                      '#f8717166',
    'Africa':                    '#f472b666',
    'Rest of the World':         '#94a3b866',
  };
  const REG_BORDERS = {
    'Western Europe':            '#1a4f8a',
    'Northern Europe':           '#0891b2',
    'Southern Europe':           '#92600a',
    'Central & Eastern Europe':  '#7c3aed',
    'Americas & Oceania':        '#166534',
    'Asia':                      '#b91c1c',
    'Africa':                    '#be185d',
    'Rest of the World':         '#374151',
  };

  const byYearReg = {};
  SRC.forEach(p => {
    const y = (p.startDate || '').slice(0, 4);
    if (!y || y < '2013') return;
    if (!byYearReg[y]) byYearReg[y] = {};
    const seen = new Set();
    p.partnerCountries.forEach(c => {
      const r = getRegion(c);
      if (!seen.has(r)) { byYearReg[y][r] = (byYearReg[y][r] || 0) + 1; seen.add(r); }
    });
  });
  const years = Object.keys(byYearReg).sort();

  // Sort regions by total project count (desc) for stacking order
  const regTotals = {};
  sortedRegions.forEach(([r]) => {
    regTotals[r] = years.reduce((s, y) => s + (byYearReg[y]?.[r] || 0), 0);
  });
  const REG_ORDER = sortedRegions.map(([r]) => r).sort((a, b) => regTotals[b] - regTotals[a]);

  destroyChart('chart-region-time');
  CHARTS['chart-region-time'] = new Chart(document.getElementById('chart-region-time'), {
    type: 'line',
    data: {
      labels: years,
      datasets: REG_ORDER.map(r => ({
        label: r,
        data: years.map(y => byYearReg[y]?.[r] || 0),
        backgroundColor: REG_COLORS_T[r] || 'rgba(175,175,185,.40)',
        borderColor: REG_BORDERS[r] || 'rgba(130,130,140,.70)',
        borderWidth: 1.5, fill: true, tension: 0.35, pointRadius: 2,
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} project${ctx.raw !== 1 ? 's' : ''}` } }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Projects' }, ticks: { stepSize: 1, precision: 0 } }
      }
    }
  });
}

/* ── Choropleth rendering ── */
function renderChoropleth(cc, maxCount, orgCount, highlightCodes) {
  const svg = document.getElementById('geo-map');
  if (!svg || !GEO_PATHS) return;

  function getColor(count, isFR) {
    if (isFR) return '#4a5568';
    if (!count) return '#e8f0fb';
    const t = Math.pow(count / maxCount, 0.5);
    const r = Math.round(200 + (26 - 200) * t);
    const g = Math.round(220 + (79 - 220) * t);
    const b = Math.round(245 + (138 - 245) * t);
    return `rgb(${r},${g},${b})`;
  }

  // Build a set of geoCode keys that should be highlighted
  const highlightGeo = new Set();
  if (highlightCodes.size) {
    Object.entries(GEO_CC).forEach(([cordis, geo]) => {
      if (highlightCodes.has(cordis)) highlightGeo.add(geo);
    });
  }

  let html = `<rect width="391" height="333" fill="#dbeafe" rx="6" opacity=".35"/>`;

  Object.entries(GEO_PATHS).forEach(([geoCode, path]) => {
    let count = 0, orgs = 0;
    Object.entries(GEO_CC).forEach(([c, g]) => {
      if (g === geoCode) {
        count += (cc[c] || 0);
        orgs += (orgCount[c] || 0);
      }
    });
    const isFR = geoCode === 'FR';
    const col = getColor(count, isFR);
    const isHighlighted = highlightGeo.has(geoCode);
    const stroke = isHighlighted ? '#cc2222' : (count || isFR) ? '#1a4f8a' : '#a8c4de';
    const sw = isHighlighted ? 2.2 : (count || isFR) ? 0.8 : 0.4;
    html += `<path d="${path}" fill="${col}" stroke="${stroke}" stroke-width="${sw}"
      onmouseover="geoHover(event,'${geoCode}',${count},${orgs})"
      onmouseout="document.getElementById('geo-tooltip').style.display='none'"/>`;
  });

  svg.innerHTML = html;

  const legendEl = document.getElementById('geo-legend-scale');
  if (legendEl) {
    legendEl.innerHTML = Array.from({ length: 6 }, (_, i) => {
      const count = Math.round(i / 5 * maxCount);
      return `<div style="width:18px;height:10px;border-radius:2px;background:${getColor(count, false)};border:1px solid #a8c4de" title="${count}"></div>`;
    }).join('');
  }
}

function geoHover(e, code, count, orgs) {
  const tip = document.getElementById('geo-tooltip');
  const wrap = document.getElementById('geo-map-wrap');
  if (!tip || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  tip.style.display = 'block';
  tip.style.left = (e.clientX - rect.left + 10) + 'px';
  tip.style.top = (e.clientY - rect.top - 32) + 'px';
  const name = CC_NAMES[code] || code;
  if (!count) {
    tip.innerHTML = `<strong>${name}</strong> · no data`;
  } else {
    tip.innerHTML = `<strong>${name}</strong> · ${count} participation${count > 1 ? 's' : ''}<br><span style="font-size:.75rem;opacity:.85">${orgs} organisation${orgs > 1 ? 's' : ''}</span>`;
  }
}

function toggleCountry(code) {
  const normCode = CC_NORM[code] || code;
  if (FILTERS.country.has(code) || FILTERS.country.has(normCode)) {
    FILTERS.country.delete(code); FILTERS.country.delete(normCode);
  } else {
    FILTERS.country.add(code);
  }
  document.querySelectorAll('[data-key="country"]').forEach(cb => {
    if (cb.value === code || cb.value === normCode) cb.checked = FILTERS.country.has(cb.value);
  });
  apply();
}
