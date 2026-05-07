/* ══════════════════════════════════════════════════════════════
   modal.js — Project detail modal
   ══════════════════════════════════════════════════════════════ */

function openModal(id, prog) {
  const p = ALL.find(x => x.id === id && x.programme === prog) || ALL.find(x => x.id === id);
  if (!p) return;

  document.getElementById('m-acro').textContent = p.acronym || '–';
  document.getElementById('m-title').textContent = p.title;
  document.getElementById('m-obj').textContent = p.objective || 'No objective available.';
  document.getElementById('m-link').href = p.cordisUrl;

  document.getElementById('m-tags').innerHTML =
    `${progTag(p)}<span class="tag tg-${p.status}">${p.status}</span>
    ${p.schemeGroup ? `<span class="tag tg-scheme">${p.schemeGroup}</span>` : ''}
    ${entityBadges(p)}`;

  document.getElementById('m-info').innerHTML = `
    <dt>Programme</dt><dd>${p.frameworkProgramme || p.programme}</dd>
    <dt>Legal basis</dt><dd>${p.legalBasis || '–'}</dd>
    <dt>Topic</dt><dd>${p.topics || '–'}</dd>
    <dt>Funding scheme</dt><dd>${p.fundingScheme || '–'}</dd>
    <dt>Dates</dt><dd>${fmtD(p.startDate)} → ${fmtD(p.endDate)}</dd>
    <dt>Total EU budget</dt><dd>${p.ecMaxContribution ? fmtM(p.ecMaxContribution) : '–'}</dd>
    <dt>Keywords</dt><dd>${p.keywords || '–'}</dd>
    <dt>Domains</dt><dd>${(p.domains || []).join(', ') || '–'}</dd>`;

  function entityRows(label, role, ec, isIT) {
    const v = ec > 0 ? fmtM(ec) : (isIT ? '0€ (via INRAE)' : '0€');
    return `<dt>${label} Role</dt><dd>${roleL(role)}</dd>
            <dt>${label} EU Contribution</dt><dd>${v}</dd>`;
  }
  let entityHTML = '';
  if (p.hasIT)    entityHTML += entityRows('IT',    p.itRole,    p.itEcContribution,    true);
  if (p.hasINRAE) entityHTML += entityRows('INRAE', p.inraeRole, p.inraeEcContribution, false);
  document.getElementById('m-it').innerHTML = entityHTML + `
    <dt>Partners</dt><dd>${p.partnerCount} organisations</dd>
    <dt>Countries</dt><dd>${p.partnerCountries.map(c => flag(c) + ' ' + c).join(', ') || '–'}</dd>`;

  let mTitle;
  if (p.hasIT && p.hasINRAE) mTitle = 'Participation';
  else if (p.hasIT)          mTitle = 'IT participation';
  else                       mTitle = 'INRAE participation';
  document.getElementById('m-it-title').textContent = mTitle;

  document.getElementById('m-pt-title').textContent = `Partners (${p.partnerCount})`;

  const rk = { coordinator: 0, participant: 1, associatedPartner: 2, thirdParty: 3 };
  const sorted = [...p.partners].sort((a, b) => (rk[a.role] ?? 9) - (rk[b.role] ?? 9) || a.name.localeCompare(b.name, 'en'));
  document.getElementById('m-partners').innerHTML = sorted.map(o => {
    const nm = (o.name || '').toUpperCase();
    const sn = (o.shortName || '').toUpperCase();
    const isT = nm.includes('INRAE TRANSFERT') || nm.includes('INRA TRANSFERT');
    const isINRAE = !isT && (sn === 'INRAE' || sn === 'INRA' || nm.includes("INSTITUT NATIONAL DE RECHERCHE POUR L'AGRICULTURE") || nm.includes("INSTITUT NATIONAL DE LA RECHERCHE AGRONOMIQUE"));
    const rowStyle = isT ? 'background:#e8f0fb;color:#1a4f8a;font-weight:700' : isINRAE ? 'background:#e8f5ec;color:#1e5631;font-weight:600' : '';
    return `<tr style="${rowStyle}">
      <td>${o.name}${isT ? ' ✦ IT' : isINRAE ? ' ✦ INRAE' : ''}</td>
      <td>${flag(o.country)} ${o.country}</td>
      <td>${roleL(o.role)}</td>
      <td>${o.activityType || '–'}</td>
      <td>${o.ecContribution ? fmtM(o.ecContribution) : '–'}</td>
    </tr>`;
  }).join('');

  document.getElementById('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function overlayClick(e) {
  if (e.target === document.getElementById('overlay')) closeModal();
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('overlay').classList.contains('open')) closeModal(); });
