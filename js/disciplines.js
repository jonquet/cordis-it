/* ══════════════════════════════════════════════════════════════
   disciplines.js — Disciplines tab (accordion, donut, EuroSciVoc)
   ══════════════════════════════════════════════════════════════ */

let accOpenNodes = new Set();
let _domTree = null;
let _donutDrillNode = null;

function getDomTree() {
  if (!_domTree) _domTree = buildDomainTree();
  return _domTree;
}

/* ── Build EuroSciVoc tree ── */
function buildDomainTree() {
  const root = { name: 'root', children: [], projects: 0, orgs: 0, depth: 0, path: [] };
  const hasAnyScivoc = VISIBLE_PROJECTS.some(p => p.euroSciVoc && p.euroSciVoc.length > 0);

  VISIBLE_PROJECTS.forEach(p => {
    const svocs = p.euroSciVoc && p.euroSciVoc.length ? p.euroSciVoc : null;
    if (svocs) {
      const seen = new Set();
      svocs.forEach(sv => {
        if (!sv.path || seen.has(sv.path)) return;
        seen.add(sv.path);
        const parts = [...sv.path.trim('/').split('/').map(x => x.trim()).filter(Boolean)];
        if (!parts.length) return;
        let node = root;
        parts.forEach((seg, i) => {
          let child = node.children.find(c => c.name === seg);
          if (!child) { child = { name: seg, children: [], projects: 0, orgs: 0, depth: i + 1, path: parts.slice(0, i + 1) }; node.children.push(child); }
          if (i === parts.length - 1) child.projects++;
          node = child;
        });
        root.projects++;
      });
    } else if (!hasAnyScivoc && p.topics) {
      const cats = new Set();
      p.topics.split(';').map(t => t.trim()).filter(Boolean).forEach(t => { const c = topicToCat(t); if (c) cats.add(c); });
      cats.forEach(cat => {
        let child = root.children.find(c => c.name === cat);
        if (!child) { child = { name: cat, children: [], projects: 0, orgs: 0, depth: 1, path: [cat] }; root.children.push(child); }
        child.projects++;
        root.projects++;
      });
    }
  });

  function prop(n) { n.children.forEach(prop); if (n.children.length) n.projects = n.children.reduce((s, c) => s + c.projects, n.projects); }
  prop(root);
  function sortNode(n) { n.children.sort((a, b) => b.projects - a.projects); n.children.forEach(sortNode); }
  sortNode(root);
  return root;
}

/* ── Render disciplines ── */
function renderDisciplines() {
  // Build domToIds lookup
  const domToIds = {};
  FILTERED.forEach(p => {
    const cats = projectCats(p);
    const pkey = p.id + '|' + p.programme;
    cats.forEach(d => {
      if (!d) return;
      if (!domToIds[d]) domToIds[d] = new Set();
      domToIds[d].add(pkey);
    });
  });
  window._domToIds = domToIds;

  // Build _domDescendants once
  if (!window._domDescendants) {
    const domDescendants = {};
    function collectIds(node) {
      const key = node.path.join('|||');
      if (!domDescendants[key]) domDescendants[key] = new Set();
      VISIBLE_PROJECTS.forEach(p => {
        const pkey = p.id + '|' + p.programme;
        (p.euroSciVoc || []).forEach(sv => {
          if (sv.path && (sv.path.includes('/' + node.name + '/') || sv.path.endsWith('/' + node.name)))
            domDescendants[key].add(pkey);
        });
        if (projectCats(p).some(c => c === node.name)) domDescendants[key].add(pkey);
      });
      node.children.forEach(c => {
        collectIds(c);
        const ckey = c.path.join('|||');
        (domDescendants[ckey] || new Set()).forEach(id => domDescendants[key].add(id));
      });
    }
    const tree = getDomTree();
    tree.children.forEach(c => collectIds(c));
    window._domDescendants = domDescendants;
  }

  // Build filtered project set for scoped counts
  const filteredPkeys = new Set(FILTERED.map(p => p.id + '|' + p.programme));
  window._filteredPkeys = filteredPkeys;

  // Helper: count projects in a node (intersecting with FILTERED)
  function nodeFilteredCount(node) {
    const key = node.path.join('|||');
    const ids = window._domDescendants && window._domDescendants[key];
    if (!ids) return 0;
    let n = 0;
    ids.forEach(id => { if (filteredPkeys.has(id)) n++; });
    return n;
  }
  window._nodeFilteredCount = nodeFilteredCount;

  // Doughnut chart — built from tree, counts intersected with FILTERED
  const tree = getDomTree();
  const domE = tree.children
    .map(n => [n.name, nodeFilteredCount(n), n])
    .filter(e => e[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  destroyChart('chart-domains');
  if (domE.length) {
    domE.forEach(([d], i) => { L1_COLORS_DOM[d] = DONUT_PAL[i % DONUT_PAL.length]; });
    if (_donutDrillNode) {
      const freshNode = tree.children.find(n => n.name === _donutDrillNode.name) || _donutDrillNode;
      const freshEntries = freshNode.children
        .map(c => [c.name, nodeFilteredCount(c)])
        .filter(e => e[1] > 0);
      renderDonutChart(freshEntries.length ? freshEntries : domE.map(e => [e[0], e[1]]), freshEntries.length ? freshNode : null);
    } else {
      renderDonutChart(domE.map(e => [e[0], e[1]]), null);
    }
  }

  renderL2Top25();
  renderAcc();
  renderSelPanel();
}

/* ── Donut chart ── */
function renderDonutChart(entries, drillNode) {
  _donutDrillNode = drillNode;
  destroyChart('chart-domains');
  if (!entries || !entries.length) return;

  const titleEl = document.getElementById('chart-domains-title');
  if (titleEl) titleEl.textContent = drillNode
    ? `Scientific Domains — ${drillNode.name}`
    : 'Scientific Disciplines overview (EuroSciVoc)';

  const labels = entries.map(e => e[0]);
  const data = entries.map(e => e[1]);
  const baseColors = drillNode
    ? entries.map((_, i) => d3brighten(L1_COLORS_DOM[drillNode.path[0]] || DONUT_PAL[0], i * 0.3))
    : entries.map((_, i) => DONUT_PAL[i % DONUT_PAL.length]);

  // Fill with transparency (aa ≈ 67%), border with full color
  const fillColors = baseColors.map(c => c.startsWith('#') ? c + 'aa' : c);
  const borderColors = baseColors;

  function d3brighten(hex, amt) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const mix = v => Math.min(255, Math.round(v + (255 - v) * amt * 0.5));
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }

  CHARTS['chart-domains'] = new Chart(document.getElementById('chart-domains'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: fillColors, borderColor: borderColors, borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { size: 11 }, boxWidth: 12, padding: 10,
            generateLabels: chart => chart.data.labels.map((label, i) => ({
              text: `${label} (${chart.data.datasets[0].data[i]})`,
              fillStyle: chart.data.datasets[0].backgroundColor[i],
              strokeStyle: '#fff', lineWidth: 1, hidden: false, index: i
            }))
          }
        },
        tooltip: { callbacks: { title: () => '', label: c => `${c.label}: ${c.raw} project${c.raw !== 1 ? 's' : ''}` } }
      }
    }
  });
}

function drillDonut(node) {
  if (!node || !node.children || !node.children.length) {
    const tree = getDomTree();
    const rootEntries = tree.children.map(c => [c.name, c.projects]);
    renderDonutChart(rootEntries, null);
    return;
  }
  renderDonutChart(node.children.map(c => [c.name, c.projects]), node);
}

/* ── Accordion ── */
function filterAcc(q) { renderAcc(q); }

function renderAcc(q = '') {
  const body = document.getElementById('acc-body');
  if (!body) return;
  const sq = (q || SEARCH).toLowerCase().trim();
  const tree = getDomTree();

  function matches(node) {
    if (!sq) return true;
    if (node.name.toLowerCase().includes(sq)) return true;
    return node.children.some(matches);
  }

  function renderNode(node, container) {
    if (!matches(node)) return;
    const hasC = node.children.length > 0;
    const key = node.path.join('|||');
    const isOpen = accOpenNodes.has(key) || !!sq;
    const isSel = DOMAIN_FILTERS.some(df => df.key === key);
    const l1 = node.path[0] || node.name;
    const col = L1_COLORS_DOM[l1] || DOM_PAL[0];

    const row = document.createElement('div');
    row.className = 'acc-row acc-d' + node.depth + (isSel ? ' acc-sel' : '');

    if (hasC) {
      const btnOpen = document.createElement('button');
      btnOpen.className = 'acc-btn acc-btn-open' + (isOpen ? ' on' : '');
      btnOpen.textContent = 'open';
      btnOpen.onclick = e => {
        e.stopPropagation();
        accOpenNodes.has(key) ? accOpenNodes.delete(key) : accOpenNodes.add(key);
        renderAcc();
        drillDonut(node);
      };
      row.appendChild(btnOpen);
    } else {
      const sp = document.createElement('span');
      sp.className = 'acc-btn-spacer';
      row.appendChild(sp);
    }

    const btnSel = document.createElement('button');
    btnSel.className = 'acc-btn acc-btn-sel' + (isSel ? ' on' : '');
    btnSel.textContent = 'select';
    btnSel.onclick = e => {
      e.stopPropagation();
      toggleDomSel({ key, name: node.name, path: node.path, col, projects: node.projects, orgs: node.orgs || 0 });
      drillDonut(node);
    };
    row.appendChild(btnSel);

    const lbl = document.createElement('div');
    lbl.className = 'acc-label';
    if (isSel) lbl.style.color = col;
    if (sq && node.name.toLowerCase().includes(sq)) {
      const i = node.name.toLowerCase().indexOf(sq);
      lbl.innerHTML = node.name.slice(0, i) + `<mark style="background:#fef08a;border-radius:2px">${node.name.slice(i, i + sq.length)}</mark>` + node.name.slice(i + sq.length);
    } else {
      lbl.textContent = node.name;
    }
    row.appendChild(lbl);

    const badge = document.createElement('span');
    badge.className = 'acc-badge';
    badge.textContent = node.projects + 'p';
    row.appendChild(badge);

    container.appendChild(row);

    if (hasC) {
      const childWrap = document.createElement('div');
      childWrap.className = 'acc-children' + (isOpen ? ' open' : '');
      node.children.forEach(c => renderNode(c, childWrap));
      container.appendChild(childWrap);
    }
  }

  body.innerHTML = '';
  tree.children.forEach(c => renderNode(c, body));
  if (!body.children.length) {
    body.innerHTML = '<div style="padding:12px;font-size:.78rem;color:var(--ink-light)">No disciplines found.</div>';
  }
}

/* ── Selection logic ── */
function resetDomainFilter() {
  DOMAIN_FILTERS = [];
  _donutDrillNode = null;
  const tree = getDomTree();
  renderDonutChart(tree.children.map(c => [c.name, c.projects]), null);
  renderL2Top25();
  renderAcc();
  renderSelPanel();
  apply();
}

function toggleDomSel(df) {
  const idx = DOMAIN_FILTERS.findIndex(x => x.key === df.key);
  if (idx >= 0) {
    DOMAIN_FILTERS.splice(idx, 1);
  } else {
    if (DOMAIN_FILTERS.length >= 3) DOMAIN_FILTERS.shift();
    DOMAIN_FILTERS.push(df);
  }
  apply();
  renderAcc();
}

function setDomOp(op) {
  DOMAIN_OPERATOR = op;
  document.getElementById('sw-or').classList.toggle('on', op === 'OR');
  document.getElementById('sw-and').classList.toggle('on', op === 'AND');
  apply();
}

function renderSelPanel() {
  const list = document.getElementById('sel-list');
  const results = document.getElementById('sel-results');
  if (!list || !results) return;

  if (!DOMAIN_FILTERS.length) {
    list.innerHTML = '<div class="sel-empty">Click a discipline<br>in the tree<br>(up to 3)</div>';
    results.innerHTML = '';
    return;
  }

  list.innerHTML = DOMAIN_FILTERS.map(df => {
    const col = df.col || 'var(--it)';
    const parentPath = df.path && df.path.length > 1 ? df.path.slice(0, -1).join(' › ') : '';
    const safeKey = df.key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div class="sel-item" style="border-color:${col}44;background:${col}0d">
      <div class="sel-item-body">
        <div class="sel-item-name" style="color:${col}">${df.name}</div>
        ${parentPath ? `<div class="sel-item-path">${parentPath}</div>` : ''}
      </div>
      <span class="sel-item-x" onclick="removeDomFilter('${safeKey}')">✕</span>
    </div>`;
  }).join('');

  // Calculate counts
  function matchesDisciplines(p) {
    if (!DOMAIN_FILTERS.length) return true;
    const pkey = p.id + '|' + p.programme;
    const matchOne = df => {
      const ids = window._domDescendants && window._domDescendants[df.key];
      return ids && ids.size > 0 ? ids.has(pkey) : projectCats(p).some(c => c === df.name);
    };
    return DOMAIN_OPERATOR === 'AND' ? DOMAIN_FILTERS.every(matchOne) : DOMAIN_FILTERS.some(matchOne);
  }
  const matchingProjects = VISIBLE_PROJECTS.filter(matchesDisciplines);
  const projCount = matchingProjects.length;
  const orgSet = new Set();
  matchingProjects.forEach(p => (p.partners || []).forEach(o => {
    if (o.name) orgSet.add(o.name + '||' + (o.country || ''));
  }));
  const orgCount = orgSet.size;

  results.innerHTML = `
    <button class="sel-result-btn" onclick="goToTabDisc('projects')" title="Switch to Projects tab">
      <span><span class="rn">${projCount}</span> project${projCount !== 1 ? 's' : ''}</span>
      <span class="rarr">Projects ↗</span>
    </button>
    <button class="sel-result-btn" onclick="goToTabDisc('partners')" title="Switch to Partners tab">
      <span><span class="rn">${orgCount}</span> organisation${orgCount !== 1 ? 's' : ''}</span>
      <span class="rarr">Partners ↗</span>
    </button>
    <div class="sel-op-label">${DOMAIN_OPERATOR} · ${DOMAIN_FILTERS.length} discipline${DOMAIN_FILTERS.length > 1 ? 's' : ''}</div>`;
}

function removeDomFilter(key) {
  DOMAIN_FILTERS = DOMAIN_FILTERS.filter(x => x.key !== key);
  apply();
  renderAcc();
}

/* ── Top 25 L2 bar chart colored by L1 ── */
function renderL2Top25() {
  const tree = getDomTree();
  const nodeCount = window._nodeFilteredCount || (n => n.projects);

  // Collect all L2 nodes across all L1 nodes, with their L1 parent
  const l2Entries = [];
  tree.children.forEach(l1Node => {
    const l1Color = L1_COLORS_DOM[l1Node.name] || DOM_PAL[0];
    l1Node.children.forEach(l2Node => {
      const count = nodeCount(l2Node);
      if (count > 0) {
        l2Entries.push({ name: l2Node.name, count, l1: l1Node.name, color: l1Color });
      }
    });
  });

  // Sort by count desc, take top 25
  l2Entries.sort((a, b) => b.count - a.count);
  const top25 = l2Entries.slice(0, 25);

  destroyChart('chart-l2-top25');
  if (!top25.length) return;

  CHARTS['chart-l2-top25'] = new Chart(document.getElementById('chart-l2-top25'), {
    type: 'bar',
    data: {
      labels: top25.map(e => e.name),
      datasets: [{
        data: top25.map(e => e.count),
        backgroundColor: top25.map(e => e.color + 'aa'),
        borderColor: top25.map(e => e.color),
        borderWidth: 1,
        borderRadius: 3,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: items => items[0].label,
          label: c => `${c.raw} project${c.raw !== 1 ? 's' : ''} · ${top25[c.dataIndex].l1}`
        }}
      },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 9 } } },
        y: { ticks: { font: { size: 9 } } }
      }
    }
  });
}

function goToTabDisc(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('on'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn) { btn.classList.add('on'); const sortBlock = document.getElementById('sort-block'); if (sortBlock) sortBlock.style.display = tab === 'projects' ? '' : 'none'; }
  document.getElementById('tab-' + tab).classList.add('on');
}

function toggleRegion(r) {
  REGION_FILTER = (REGION_FILTER === r) ? null : r;
  const sel = document.getElementById('partner-region');
  if (sel) sel.value = REGION_FILTER || '';
  apply();
}
