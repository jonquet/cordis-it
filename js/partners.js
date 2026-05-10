/* ══════════════════════════════════════════════════════════════
   partners.js — Partners tab
   ══════════════════════════════════════════════════════════════ */

function renderPartners() {
  const colEl = document.getElementById('partners-proj-col');
  if (colEl) colEl.textContent = VIEW_MODE === 'IT'    ? 'Projects with IT'
                              :  VIEW_MODE === 'INRAE' ? 'Projects with INRAE'
                              :  VIEW_MODE === 'BOTH'  ? 'Projects with IT & INRAE'
                              :                          'Projects';

  const q = SEARCH.toLowerCase().trim();
  const type = document.getElementById('partner-type').value;
  const partnerRegion = document.getElementById('partner-region').value;

  // Determine allowed countries
  const allowedCountries = new Set();
  let hasCountryFilter = false;

  if (FILTERS.country.size) {
    hasCountryFilter = true;
    FILTERS.country.forEach(c => allowedCountries.add(c));
  }
  if (REGION_FILTER) {
    hasCountryFilter = true;
    const regionCodes = REGIONS[REGION_FILTER] || [];
    if (REGION_FILTER === 'Other') {
      const allNamed = Object.values(REGIONS).flat();
      VISIBLE_PROJECTS.forEach(p => p.partnerCountries.forEach(c => {
        if (!allNamed.includes(c) && !allNamed.includes(CC_NORM[c] || c)) allowedCountries.add(c);
      }));
    } else {
      regionCodes.forEach(c => allowedCountries.add(c));
      Object.entries(CC_NORM).forEach(([k, v]) => { if (regionCodes.includes(v)) allowedCountries.add(k); });
    }
  }
  if (partnerRegion) {
    hasCountryFilter = true;
    const regionCodes = REGIONS[partnerRegion] || [];
    if (partnerRegion === 'Other') {
      const allNamed = Object.values(REGIONS).flat();
      VISIBLE_PROJECTS.forEach(p => p.partnerCountries.forEach(c => {
        if (!allNamed.includes(c) && !allNamed.includes(CC_NORM[c] || c)) allowedCountries.add(c);
      }));
    } else {
      regionCodes.forEach(c => allowedCountries.add(c));
      Object.entries(CC_NORM).forEach(([k, v]) => { if (regionCodes.includes(v)) allowedCountries.add(k); });
    }
  }

  // Build org map from FILTERED projects
  const orgMap = {};
  FILTERED.forEach(p => {
    (p.partners || []).forEach(o => {
      if (!o.name) return;
      const key = o.name + '||' + o.country;
      if (!orgMap[key]) orgMap[key] = { name: o.name, shortName: o.shortName || '', country: o.country, activityType: o.activityType, pic: o.pic || '', projects: 0, totalEC: 0 };
      orgMap[key].projects++;
      orgMap[key].totalEC += (o.ecContribution || 0);
      if (!orgMap[key].pic && o.pic) orgMap[key].pic = o.pic;
    });
  });

  let rows = Object.values(orgMap)
    .filter(o => {
      if (!q) return true;
      return o.name.toLowerCase().includes(q) || (o.shortName || '').toLowerCase().includes(q);
    })
    .filter(o => !type || o.activityType === type)
    .filter(o => !hasCountryFilter || allowedCountries.has(o.country) || allowedCountries.has(CC_NORM[o.country] || o.country))
    .sort((a, b) => b.projects - a.projects);

  const total = rows.length;
  rows = rows.slice(PARTNER_PAGE * PER_PAGE, (PARTNER_PAGE + 1) * PER_PAGE);
  window._partnerRows = [];

  const CORDIS_ORG = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/org-details/';
  document.getElementById('partner-tbody').innerHTML = rows.length
    ? rows.map(o => {
      const nm = (o.name || '').toUpperCase();
      const sn = (o.shortName || '').toUpperCase();
      const isT     = nm.includes('INRAE TRANSFERT') || nm.includes('INRA TRANSFERT');
      const isINRAE = !isT && (sn === 'INRAE' || sn === 'INRA' || nm.includes("INSTITUT NATIONAL DE RECHERCHE POUR L'AGRICULTURE") || nm.includes("INSTITUT NATIONAL DE LA RECHERCHE AGRONOMIQUE"));
      const isActive = PARTNER_FILTER && PARTNER_FILTER.name === o.name && PARTNER_FILTER.country === o.country;
      const baseStyle = isT     ? 'background:#e8f0fb;color:#1a4f8a;font-weight:700'
                      : isINRAE ? 'background:#e8f5ec;color:#1e5631;font-weight:600'
                      : '';
      const activeStyle = isActive ? 'background:var(--it-pale);outline:2px solid var(--it);' : '';
      const picCell = o.pic
        ? `<a href="${CORDIS_ORG}${o.pic}" target="_blank" style="font-family:'Fira Code',monospace;font-size:.67rem;color:var(--it-mid);text-decoration:underline" onclick="event.stopPropagation()">${o.pic}</a>`
        : '–';
      const nameStr = `${o.name}${isT ? ' ✦ IT' : ''}${isINRAE ? ' ✦ INRAE' : ''}${isActive ? ' 🔍' : ''}`;
      const idx = window._partnerRows.length;
      window._partnerRows.push({ name: o.name, country: o.country });
      return `<tr style="${baseStyle};${activeStyle}cursor:pointer" title="Click to filter projects by this partner"
          onclick="setPartnerFilter(window._partnerRows[${idx}])">
          <td>${nameStr}</td>
          <td style="font-family:'Fira Code',monospace;font-size:.7rem;color:var(--ink-light)">${o.shortName || '–'}</td>
          <td>${flag(o.country)} ${o.country}</td>
          <td>${o.activityType || '–'}</td>
          <td>${picCell}</td>
          <td>${o.projects}</td>
          <td>${o.totalEC ? fmtM(o.totalEC) : '–'}</td>
        </tr>`;
    }).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--ink-light);padding:12px">No partners match.</td></tr>';

  // Partner filter indicator
  const pfEl = document.getElementById('partner-filter-active');
  const pfLabel = document.getElementById('partner-filter-label');
  if (pfEl && pfLabel) {
    if (PARTNER_FILTER) {
      pfEl.style.display = '';
      pfLabel.textContent = `Filtering projects by: ${PARTNER_FILTER.name}`;
    } else {
      pfEl.style.display = 'none';
    }
  }

  // Pager
  const pages = Math.ceil(total / PER_PAGE);
  const pager = document.getElementById('partner-pager');
  pager.innerHTML = `<span style="color:var(--ink-light);margin-right:4px">${total} orgs</span>`;
  if (pages > 1) for (let i = 0; i < Math.min(pages, 10); i++)
    pager.innerHTML += `<button class="${i === PARTNER_PAGE ? 'on' : ''}" onclick="setPartnerPage(${i})">${i + 1}</button>`;
}

function setPartnerFilter(org) {
  if (PARTNER_FILTER && PARTNER_FILTER.name === org.name && PARTNER_FILTER.country === org.country) {
    PARTNER_FILTER = null;
  } else {
    PARTNER_FILTER = org;
  }
  apply();
}

function clearPartnerFilter() { PARTNER_FILTER = null; apply(); }
function setPartnerPage(p) { PARTNER_PAGE = p; renderPartners(); }
