(function () {
  const specData = window.__SPEC_DATA__ || {};
  const columns = window.__COLUMNS__ || [];
  const reviewerOptions = [...(window.__REVIEWER_OPTIONS__ || [])].filter(Boolean);
  const reviewerSet = new Set(reviewerOptions);
  const pendingChanges = {};
  let currentSpec = null;
  let apiAvailable = null;
  let queueEntries = [];
  let queueOpen = false;
  let activeSlot = null;

  const REFUTATION_TYPE_LABELS = {
    peer_review: 'Peer Review',
    adversarial_vectors: 'Adversarial Vectors',
    dual_model_audit: 'Dual-Model Audit',
    implementation_test: 'Implementation Test',
    integration_test: 'Integration Test',
    field_deployment: 'VR Field Deployment',
  };

  const SEVERITY_LABELS = {
    casual: 'Casual',
    thorough: 'Thorough',
    hostile: 'Hostile',
    competing_models: 'Competing Models',
    real_world: 'Real-World',
  };

  const ALL_REFUTATION_TYPES = [
    'peer_review', 'adversarial_vectors', 'dual_model_audit',
    'implementation_test', 'integration_test', 'field_deployment',
  ];

  function init() {
    initEvents();
    initReviewerSelect();
    updateSummary();
    updateInsights();
    refreshQueueData(false);
  }

  function initEvents() {
    document.querySelectorAll('.spec-name').forEach(el =>
      el.addEventListener('click', () => showDetail(el.dataset.spec))
    );
    document.querySelectorAll('.grid-cell').forEach(el =>
      el.addEventListener('click', () => showDetail(el.dataset.spec, el.dataset.col))
    );
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (closeReviewDialog()) return;
        if (closeQueue()) return;
        closeDetail();
      }
    });
    const queueBtn = document.getElementById('queue-button');
    if (queueBtn) queueBtn.addEventListener('click', openQueue);
    const queueModal = document.getElementById('queue-modal');
    if (queueModal) queueModal.addEventListener('click', e => { if (e.target === queueModal) closeQueue(); });
    const queueClose = document.getElementById('queue-close');
    if (queueClose) queueClose.addEventListener('click', closeQueue);
    const queueList = document.getElementById('queue-list');
    if (queueList) queueList.addEventListener('click', handleQueueClick);
    const reviewModal = document.getElementById('review-modal');
    if (reviewModal) reviewModal.addEventListener('click', e => { if (e.target === reviewModal) closeReviewDialog(); });
    const reviewCancel = document.getElementById('review-cancel');
    if (reviewCancel) reviewCancel.addEventListener('click', closeReviewDialog);
    const reviewSubmit = document.getElementById('review-submit');
    if (reviewSubmit) reviewSubmit.addEventListener('click', submitReviewFromDialog);
    const saveAssignmentBtn = document.getElementById('review-save-assignment');
    if (saveAssignmentBtn) saveAssignmentBtn.addEventListener('click', () => saveAssignment(true));
    const reviewerSelect = document.getElementById('reviewer-select');
    if (reviewerSelect) reviewerSelect.addEventListener('change', handleReviewerSelectChange);
  }

  // -- Detail panel --

  function showDetail(code, focusCol) {
    const sd = specData[code];
    if (!sd) return;
    currentSpec = code;
    const panel = document.getElementById('detail');
    panel.classList.remove('panel-empty');
    document.getElementById('detail-placeholder').hidden = true;
    const overall = Math.round((sd.confidence || 0) * 100);
    const slotOrder = ['review1', 'review2', 'expert'];
    const isStale = sd.spec_modified_since_review;
    let html = '';

    // Header
    html += '<div class="panel-header"><div><h2>' + escHtml(code) + '</h2>';
    html += '<div class="panel-meta">' + escHtml(sd.name) + ' · v' + escHtml(sd.version) + ' · ' + overall + '%';
    if (sd.frontier) html += ' · <span style="color:var(--frontier)">Ready</span>';
    if (sd.downstream) html += ' · Unlocks ' + sd.downstream;
    html += '</div></div>';
    html += '<div class="panel-actions">';
    html += '<button class="close-btn" onclick="closeDetail()">Close</button></div></div>';

    // Staleness timeline
    if (isStale || sd.git_date) {
      html += '<section><div class="staleness-timeline">';
      if (isStale) {
        html += '<span class="dot-stale"></span> <span>Spec changed';
        if (sd.git_date) html += ' · ' + escHtml(sd.git_date.split('T')[0]);
        html += ' — evidence still setting</span>';
      } else if (sd.reviews_list?.length) {
        html += '<span class="dot-fresh"></span> <span>Evidence is fresh against current spec</span>';
      }
      html += '</div></section>';
    }

    // Refutation breadth
    const breadth = sd.refutation_breadth || {};
    if (breadth.total_possible) {
      html += '<section><div class="breadth-card"><div class="section-title">Refutation surface</div>';
      html += '<div class="breadth-summary"><strong>' + (breadth.fresh_count || 0) + '</strong> of ' + breadth.total_possible + ' dimensions survived';
      if (breadth.stale_count > 0) html += ' · ' + breadth.stale_count + ' stale';
      html += '</div>';
      html += '<div class="breadth-bar">';
      const freshSet = new Set(breadth.fresh_types || []);
      const staleSet = new Set(breadth.stale_types || []);
      ALL_REFUTATION_TYPES.forEach(t => {
        const cls = freshSet.has(t) ? 'fresh' : (staleSet.has(t) ? 'stale' : '');
        html += '<div class="breadth-segment ' + cls + '" title="' + (REFUTATION_TYPE_LABELS[t] || t) + '"></div>';
      });
      html += '</div>';
      const covered = [...(breadth.fresh_types || []), ...(breadth.stale_types || [])];
      if (covered.length) {
        html += '<div class="breadth-types">' + covered.map(t => REFUTATION_TYPE_LABELS[t] || t).join(' · ') + '</div>';
      }
      html += '</div></section>';
    }

    // Reviewers
    html += '<section><div class="section-title">Reviewer identities</div><div class="reviewer-grid">';
    slotOrder.forEach(slot => {
      const info = sd.reviewer_slots?.[slot] || {};
      const status = (info.status || 'pending').toLowerCase();
      const className = status.includes('approve') ? 'approved' : (status === 'unassigned' ? 'unassigned' : 'pending');
      const primary = info.fulfilled_by || info.assignee || 'Unassigned';
      let statusLine = 'Pending';
      if (status === 'unassigned') statusLine = 'Not assigned';
      if (status.includes('approve')) statusLine = 'Survived ' + (info.date || '');
      if (status.includes('reject')) statusLine = 'Falsified';
      if (status.includes('needs')) statusLine = 'Needs changes';
      if (!info.assignee && info.fulfilled_by) statusLine = 'By ' + info.fulfilled_by;
      const assignmentNote = (info.assignee && info.fulfilled_by && info.assignee !== info.fulfilled_by)
        ? ' · ' + info.assignee : (info.assignee && !info.fulfilled_by ? ' · ' + info.assignee : '');
      html += '<div class="reviewer-card ' + className + '"><div class="reviewer-name">' + escHtml(primary) + '</div>'
           + '<div class="reviewer-status">' + escHtml(info.label || '') + assignmentNote + '<br>' + statusLine + '</div>'
           + '<button class="reviewer-card-btn" data-review-launch="true" data-slot="' + slot + '" data-spec="' + code + '">Log</button></div>';
    });
    html += '</div></section>';

    // Dependency graph
    html += '<section><div class="section-title">Dependency graph</div><div class="dep-graph-card"><svg class="dep-graph"></svg></div>';
    if ((sd.depends_on || []).length) {
      const depLinks = sd.depends_on.map(d => {
        const pct = Math.round((specData[d]?.confidence || 0) * 100);
        return '<span class="dep-link" onclick="showDetail(\'' + d + '\')">' + d + ' (' + pct + '%)</span>';
      }).join(' · ');
      html += '<div class="dep-list"><strong>Depends on:</strong> ' + depLinks + '</div>';
    }
    if ((sd.depended_by || []).length) {
      html += '<div class="dep-list"><strong>Unlocks:</strong> ' + sd.depended_by.join(' · ') + '</div>';
    }
    html += '</section>';

    // Inherited drops
    const inheritedDrops = sd.inherited_drops || [];
    if (inheritedDrops.length) {
      html += '<section><div class="inherited-drop-alert"><strong>Warning: Inherited confidence drop</strong>';
      html += 'Dependencies with low scores reduce this spec:';
      html += '<ul class="inherited-drop-list">';
      inheritedDrops.forEach(drop => {
        const depPct = Math.round((drop.dep_confidence || 0) * 100);
        html += '<li><button onclick="showDetail(\'' + drop.from + '\')" style="background:none;border:none;color:#f59e0b;cursor:pointer;font:inherit;padding:0">'
             + drop.from + '</button> — ' + depPct + '%</li>';
      });
      html += '</ul></div></section>';
    }

    // Evidence grid
    html += '<section><div class="section-title">Evidence</div><div class="evidence-grid">';
    const evidenceStaleness = sd.evidence_staleness || {};
    columns.forEach(col => {
      const cellConf = sd.cells?.[col.id] || 0;
      const ev = sd.evidence?.[col.id] || {};
      const pct = Math.round(cellConf * 100);
      const colStale = evidenceStaleness[col.id];
      const highlight = focusCol === col.id ? 'style="box-shadow:0 0 0 2px var(--accent)"' : '';
      const staleClass = colStale ? ' ev-stale' : '';
      html += '<div class="ev-card' + staleClass + '" ' + highlight + '><strong>' + col.icon + ' ' + escHtml(col.label) + ' — ' + pct + '%</strong>';
      col.signals.forEach((sig, idx) => {
        const checked = ev[sig] ? 'checked' : '';
        const setKey = col.id + '.' + sig;
        html += '<label><input type="checkbox" ' + checked + ' data-spec="' + code + '" data-key="' + setKey + '" onchange="onEvChange(this)"> ' + escHtml(col.labels[idx]) + '</label>';
      });
      html += '</div>';
    });
    html += '</div></section>';

    // Refutation log
    if (sd.reviews_list?.length) {
      html += '<section><div class="section-title">Refutation log (' + sd.reviews_list.length + ')</div><div class="review-history">';
      sd.reviews_list.slice().reverse().forEach(r => {
        const entryStale = r.is_stale;
        const outcome = r.outcome || (r.status === 'approved' ? 'survived' : 'falsified');
        const statusClass = outcome === 'survived' ? 'survived' : (outcome === 'falsified' ? 'falsified' : (r.status || 'pending').replace(/\s+/g, '-'));
        const rtype = r.type || 'peer_review';
        const severity = r.severity || 'casual';
        html += '<div class="review-entry' + (entryStale ? ' stale-entry' : '') + '">';
        html += '<div class="review-entry-header">';
        html += '<span><strong>' + escHtml(r.reviewer) + '</strong> · v' + escHtml(r.version || '?') + ' · ' + escHtml(r.date || '?') + '</span>';
        html += '<span class="review-entry-status ' + statusClass + '">' + (outcome === 'survived' ? 'Survived' : outcome === 'falsified' ? 'Falsified' : escHtml(r.status || 'pending')) + '</span>';
        html += '</div>';
        html += '<div class="review-entry-badges">';
        html += '<span class="badge badge-type">' + escHtml(REFUTATION_TYPE_LABELS[rtype] || rtype) + '</span>';
        html += '<span class="badge badge-severity badge-' + severity + '">' + escHtml(SEVERITY_LABELS[severity] || severity) + '</span>';
        html += '</div>';
        if (r.note) html += '<div class="review-entry-note">' + escHtml(r.note) + '</div>';
        if (r.falsification) html += '<div class="review-entry-note" style="color:#ef4444">' + escHtml(r.falsification) + '</div>';
        if (r.diff_summary) html += '<div class="review-entry-diff">' + escHtml(r.diff_summary) + '</div>';
        html += '</div>';
      });
      html += '</div></section>';
    }

    // Issues
    if (sd.issues?.length) {
      html += '<section><div class="section-title">Issues</div><div class="issue-list">';
      sd.issues.forEach((iss, idx) => {
        const cls = iss.resolved ? 'issue-resolved' : 'issue-open';
        html += '<div class="' + cls + '">#' + idx + ': ' + escHtml(iss.text) + '</div>';
      });
      html += '</div></section>';
    }

    const detail = document.getElementById('detail-content');
    detail.hidden = false;
    detail.innerHTML = html;
    renderDepGraph(sd);
    detail.querySelectorAll('[data-review-launch="true"]').forEach(btn => {
      btn.addEventListener('click', () => openReviewDialog(btn.dataset.spec, btn.dataset.slot));
    });
  }

  function closeDetail() {
    currentSpec = null;
    const panel = document.getElementById('detail');
    panel.classList.add('panel-empty');
    document.getElementById('detail-placeholder').hidden = false;
    document.getElementById('detail-content').hidden = true;
  }

  function renderDepGraph(sd) {
    const svg = document.querySelector('#detail .dep-graph');
    if (!svg) return;
    svg.innerHTML = '';
    const width = svg.clientWidth || 320;
    const height = svg.clientHeight || 220;
    const centerX = width / 2;
    const centerY = height / 2;
    const upstream = sd.depends_on || [];
    const downstream = sd.depended_by || [];
    const ns = 'http://www.w3.org/2000/svg';
    const node = (x, y, label, fill) => {
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', x); circle.setAttribute('cy', y);
      circle.setAttribute('r', 18); circle.setAttribute('fill', fill);
      circle.setAttribute('stroke', 'var(--border)');
      svg.appendChild(circle);
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', x); text.setAttribute('y', y + 30);
      text.setAttribute('class', 'dep-label');
      text.textContent = label;
      svg.appendChild(text);
    };
    const edge = (x1, y1, x2, y2) => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', 'var(--surface3)'); line.setAttribute('stroke-width', '1.5');
      svg.appendChild(line);
    };
    upstream.forEach((dep, idx) => {
      const angle = Math.PI * (idx + 1) / (upstream.length + 1);
      const x = centerX - Math.cos(angle) * 120;
      const y = centerY - 80;
      edge(centerX, centerY, x, y); node(x, y, dep, 'var(--surface3)');
    });
    downstream.forEach((dep, idx) => {
      const angle = Math.PI * (idx + 1) / (downstream.length + 1);
      const x = centerX + Math.cos(angle) * 120;
      const y = centerY + 80;
      edge(centerX, centerY, x, y); node(x, y, dep, 'var(--surface3)');
    });
    node(centerX, centerY, sd.name.split(':')[0].split('—')[0].trim(), 'var(--accent)');
  }

  // -- Grid updates --

  function updateRow(spec) {
    const sd = specData[spec];
    const evidenceStaleness = sd.evidence_staleness || {};
    document.querySelectorAll(`.grid-cell[data-spec="${spec}"]`).forEach(cell => {
      const col = cell.dataset.col;
      const score = sd.cells?.[col] || 0;
      const isStale = evidenceStaleness[col] || false;
      const size = 8 + score * 16;
      const dot = cell.querySelector('.dot');
      if (dot) {
        dot.style.width = size + 'px';
        dot.style.height = size + 'px';
        dot.style.background = confidenceColor(score);
        dot.style.opacity = (isStale && score > 0) ? '0.35' : '1.0';
        const columnDef = columns.find(c => c.id === col);
        dot.title = (columnDef ? columnDef.label : col) + ': ' + Math.round(score * 100) + '%';
      }
      cell.dataset.stale = String(isStale);
    });
    const row = document.querySelector(`.spec-row[data-spec="${spec}"]`);
    if (row) {
      row.dataset.downstream = sd.downstream;
      row.dataset.confidence = sd.confidence;
      row.dataset.frontier = String(sd.frontier);
      row.dataset.stale = String(sd.spec_modified_since_review || false);
      const drops = sd.inherited_drops || [];
      row.dataset.inheritedDrops = drops.length;
      const marker = row.querySelector('.spec-marker');
      if (marker) {
        let markerHtml = sd.frontier ? '<span class="frontier-marker">▶</span>' : '';
        if (drops.length) markerHtml += '<span class="drop-marker" title="Inherited confidence drop from dependency">⚠</span>';
        marker.innerHTML = markerHtml;
      }
    }
  }

  function confidenceColor(score) {
    if (score <= 0) return 'hsl(220,10%,85%)';
    if (score <= 0.5) {
      const t = score / 0.5;
      return `hsl(${(220 + (45 - 220) * t).toFixed(0)},${(10 + 80 * t).toFixed(0)}%,${(85 + (55 - 85) * t).toFixed(0)}%)`;
    }
    const t = (score - 0.5) / 0.5;
    return `hsl(${(45 + (142 - 45) * t).toFixed(0)},${(90 + (70 - 90) * t).toFixed(0)}%,${(55 + (50 - 55) * t).toFixed(0)}%)`;
  }

  // -- Summary --

  function updateSummary() {
    const entries = Object.values(specData);
    const total = entries.length || 1;
    const done = entries.filter(s => (s.confidence || 0) >= 0.6).length;
    const avg = entries.reduce((acc, s) => acc + (s.confidence || 0), 0) / total;
    const ready = entries.filter(s => s.frontier).length;
    document.getElementById('summary-done').textContent = done;
    document.getElementById('summary-ready').textContent = ready;
    document.getElementById('summary-avg').textContent = Math.round(avg * 100) + '%';
    document.getElementById('progress-fill').style.width = (avg * 100) + '%';

    let evidenceCount = 0, freshCount = 0;
    entries.forEach(sd => {
      const staleness = sd.evidence_staleness || {};
      const hasEvidence = columns.some(c => (sd.cells?.[c.id] || 0) > 0);
      if (!hasEvidence) return;
      evidenceCount++;
      const hasFresh = columns.some(c => (sd.cells?.[c.id] || 0) > 0 && !staleness[c.id]);
      if (hasFresh) freshCount++;
    });
    const freshEl = document.getElementById('summary-fresh');
    const evEl = document.getElementById('summary-evidence');
    if (freshEl) freshEl.textContent = freshCount;
    if (evEl) evEl.textContent = evidenceCount;
  }

  function updateInsights() {
    const entries = Object.entries(specData);
    const impact = entries.slice().sort((a, b) => b[1].downstream - a[1].downstream).slice(0, 4);
    document.getElementById('impact-list').innerHTML = impact
      .map(([code, sd]) => `<li><button onclick="showDetail('${code}')">${code}</button> · ${sd.downstream}</li>`).join('');
    const blocked = entries
      .map(([code, sd]) => {
        const deps = sd.depends_on || [];
        const weak = deps.filter(d => (specData[d]?.confidence || 0) < 0.6).length;
        return { code, weak, total: deps.length };
      })
      .filter(item => item.total)
      .sort((a, b) => (b.weak - a.weak) || (b.total - a.total))
      .slice(0, 4);
    document.getElementById('blocked-list').innerHTML = blocked
      .map(item => `<li><button onclick="showDetail('${item.code}')">${item.code}</button> · ${item.weak}/${item.total}</li>`).join('');
    const ready = entries.filter(([_, sd]) => sd.frontier)
      .sort((a, b) => b[1].downstream - a[1].downstream).slice(0, 4);
    document.getElementById('ready-list').innerHTML = ready
      .map(([code, sd]) => `<li><button onclick="showDetail('${code}')">${code}</button> · unlocks ${sd.downstream}</li>`).join('');
  }

  // -- Evidence changes --

  async function onEvChange(cb) {
    const spec = cb.dataset.spec;
    const key = cb.dataset.key;
    const value = cb.checked;
    if (!pendingChanges[spec]) pendingChanges[spec] = {};
    pendingChanges[spec][key] = value;

    const saved = await saveChange(spec, key, value);
    if (!saved) updateCmdPanel();
  }

  async function ensureApi() {
    if (apiAvailable !== null) return apiAvailable;
    if (!['http:', 'https:'].includes(window.location.protocol)) { apiAvailable = false; return false; }
    try { const res = await fetch('/api/ping'); apiAvailable = res.ok; }
    catch { apiAvailable = false; }
    return apiAvailable;
  }

  async function saveChange(spec, key, value) {
    if (!(await ensureApi())) return false;
    try {
      const res = await fetch('/api/evidence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec, changes: { [key]: value } }),
      });
      if (!res.ok) throw new Error('API error');
      const payload = await res.json();
      syncSpecState(spec, payload.spec);
      delete pendingChanges[spec]?.[key];
      if (pendingChanges[spec] && Object.keys(pendingChanges[spec]).length === 0) delete pendingChanges[spec];
      hideCmdPanel(); showToast('Saved'); return true;
    } catch { apiAvailable = false; showToast('API unavailable — run specs/dashboard/server.py', true); return false; }
  }

  function syncSpecState(spec, payload) {
    if (!spec || !payload) return;
    specData[spec] = payload;
    updateRow(spec); updateSummary(); updateInsights();
    refreshQueueData(queueOpen);
    if (currentSpec === spec) showDetail(spec);
  }

  // -- Command panel --

  function updateCmdPanel() {
    const cmds = [];
    Object.entries(pendingChanges).forEach(([spec, items]) => {
      Object.entries(items).forEach(([key, val]) => cmds.push(`python3 specs/dashboard/review.py ${spec} --set ${key}=${val}`));
    });
    const panel = document.getElementById('cmd-panel');
    if (!cmds.length) { panel.classList.remove('visible'); return; }
    document.getElementById('cmd-text').textContent = cmds.join('\n');
    panel.classList.add('visible');
  }
  function hideCmdPanel() { document.getElementById('cmd-panel').classList.remove('visible'); }
  function dismissCmdPanel() { hideCmdPanel(); }
  function copyCmd(ev) {
    navigator.clipboard.writeText(document.getElementById('cmd-text').textContent).then(() => {
      ev.target.textContent = 'Copied'; setTimeout(() => (ev.target.textContent = 'Copy'), 1500);
    });
  }

  function showToast(message, warn = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.borderColor = warn ? 'var(--warn)' : 'var(--border)';
    toast.classList.add('visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('visible'), 2200);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // -- Queue --

  function refreshQueueData(renderIfOpen = false) {
    queueEntries = computeQueueEntries();
    const el = document.getElementById('queue-count');
    if (el) el.textContent = queueEntries.length;
    if (renderIfOpen && queueOpen) renderQueue();
  }

  function computeQueueEntries() {
    const entries = [];
    Object.entries(specData).forEach(([code, sd]) => {
      Object.entries(sd.reviewer_slots || {}).forEach(([slot, info]) => {
        const status = (info.status || 'pending').toLowerCase();
        if (status.includes('approve')) return;
        entries.push({ spec: code, slot, slotLabel: info.label || slot, assignee: info.assignee || '',
          status, note: info.note || '', date: info.date || '', downstream: sd.downstream || 0, confidence: sd.confidence || 0 });
      });
    });
    const order = s => s === 'unassigned' ? 0 : (s.includes('needs') || s.includes('reject')) ? 1 : 2;
    entries.sort((a, b) => (order(a.status) - order(b.status)) || (b.downstream - a.downstream) || (a.confidence - b.confidence));
    return entries;
  }

  function renderQueue() {
    const list = document.getElementById('queue-list');
    if (!list) return;
    if (!queueEntries.length) { list.innerHTML = '<p class="queue-empty">No pending slots.</p>'; return; }
    list.innerHTML = queueEntries.map(queueEntryTemplate).join('');
  }

  function formatQueueStatus(status) {
    if (status === 'unassigned') return { label: 'Unassigned', className: 'queue-status--unassigned' };
    if (status.includes('needs')) return { label: 'Needs changes', className: 'queue-status--needs' };
    if (status.includes('reject')) return { label: 'Falsified', className: 'queue-status--rejected' };
    return { label: 'Pending', className: 'queue-status--pending' };
  }

  function queueEntryTemplate(e) {
    const s = formatQueueStatus(e.status);
    const assignee = e.assignee ? escHtml(e.assignee) : '<span class="queue-unassigned">Unassigned</span>';
    return `<div class="queue-entry"><div class="queue-entry-head"><div><strong>${e.spec}</strong> · ${escHtml(e.slotLabel)}</div>
      <span class="queue-status ${s.className}">${s.label}</span></div>
      <div class="queue-entry-meta"><span>Assigned: ${assignee}</span><span>Downstream: ${e.downstream}</span><span>Confidence: ${Math.round(e.confidence*100)}%</span></div>
      ${e.note ? '<div class="queue-note">'+escHtml(e.note)+'</div>' : ''}
      <div class="queue-entry-actions"><button class="btn" data-action="review" data-spec="${e.spec}" data-slot="${e.slot}">Log refutation attempt</button></div></div>`;
  }

  function openQueue() {
    const modal = document.getElementById('queue-modal');
    if (!modal) return; queueOpen = true; refreshQueueData(true); modal.classList.add('visible');
  }
  function closeQueue() {
    if (!queueOpen) return false;
    document.getElementById('queue-modal')?.classList.remove('visible'); queueOpen = false; return true;
  }
  function handleQueueClick(ev) {
    const btn = ev.target.closest('button[data-action]');
    if (btn?.dataset.action === 'review') openReviewDialog(btn.dataset.spec, btn.dataset.slot);
  }

  // -- Review dialog --

  function initReviewerSelect() {
    const select = document.getElementById('reviewer-select');
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>Select reviewer</option>';
    reviewerOptions.forEach(name => { const o = document.createElement('option'); o.value = name; o.textContent = name; select.appendChild(o); });
    const c = document.createElement('option'); c.value = '__custom__'; c.textContent = 'Custom...'; select.appendChild(c);
  }

  function handleReviewerSelectChange(ev) {
    const custom = document.getElementById('reviewer-custom');
    if (!custom) return;
    if (ev.target.value === '__custom__') { custom.classList.remove('hidden'); custom.focus(); }
    else { custom.classList.add('hidden'); if (ev.target.value === '') custom.value = ''; }
  }

  function ensureReviewerOption(name) {
    if (!name || reviewerSet.has(name)) return;
    reviewerSet.add(name); reviewerOptions.push(name);
    const select = document.getElementById('reviewer-select');
    if (!select) return;
    const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
    select.insertBefore(opt, select.querySelector('option[value="__custom__"]'));
  }

  function setReviewerSelection(name) {
    const select = document.getElementById('reviewer-select');
    const custom = document.getElementById('reviewer-custom');
    if (!select || !custom) return;
    if (!name) { select.value = ''; custom.value = ''; custom.classList.add('hidden'); return; }
    ensureReviewerOption(name);
    if (reviewerSet.has(name)) { select.value = name; custom.value = ''; custom.classList.add('hidden'); }
    else { select.value = '__custom__'; custom.value = name; custom.classList.remove('hidden'); }
  }

  function getReviewerFromForm() {
    const select = document.getElementById('reviewer-select');
    const custom = document.getElementById('reviewer-custom');
    if (!select) return '';
    if (select.value === '__custom__') return custom ? custom.value.trim() : '';
    return select.value || '';
  }

  function openReviewDialog(spec, slot) {
    closeQueue();
    const sd = specData[spec]; if (!sd) return;
    const slotInfo = sd.reviewer_slots?.[slot] || {};
    activeSlot = { spec, slot, originalReviewer: slotInfo.assignee || '' };
    const modal = document.getElementById('review-modal'); if (!modal) return;
    const specLabel = document.getElementById('review-spec');
    const slotLabel = document.getElementById('review-slot');
    const noteField = document.getElementById('review-note');
    if (specLabel) specLabel.textContent = `${spec} · ${sd.name || ''}`;
    if (slotLabel) slotLabel.textContent = slotInfo.label || slot;
    if (noteField) noteField.value = '';
    const approvedRadio = document.getElementById('review-status-approved');
    if (approvedRadio) approvedRadio.checked = true;
    const col = columns.find(c => c.signals?.includes(slot));
    const refTypeSelect = document.getElementById('refutation-type');
    if (refTypeSelect) refTypeSelect.value = (col?.refutation_type) || 'peer_review';
    const sevSelect = document.getElementById('refutation-severity');
    if (sevSelect) sevSelect.value = 'casual';
    setReviewerSelection(slotInfo.assignee || slotInfo.fulfilled_by || '');
    updateReviewMeta(slotInfo);
    modal.classList.add('visible');
  }

  function closeReviewDialog() {
    const modal = document.getElementById('review-modal');
    if (!modal || !modal.classList.contains('visible')) return false;
    modal.classList.remove('visible'); activeSlot = null; return true;
  }

  function updateReviewMeta(info) {
    const meta = document.getElementById('review-meta'); if (!meta) return;
    const status = formatQueueStatus((info?.status || 'pending').toLowerCase());
    const bits = [status.label];
    if (info?.assignee) bits.push('Assigned to ' + info.assignee);
    if (info?.date) bits.push('Last ' + info.date);
    meta.textContent = bits.join(' · ');
  }

  async function saveAssignment(showToastMsg) {
    if (!activeSlot) return false;
    const reviewer = getReviewerFromForm();
    if (!reviewer) { if (showToastMsg) showToast('Select a reviewer first', true); return false; }
    if (reviewer === activeSlot.originalReviewer) return true;
    if (!(await ensureApi())) return false;
    try {
      const res = await fetch('/api/assignment', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: activeSlot.spec, slot: activeSlot.slot, reviewer }) });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      syncSpecState(activeSlot.spec, payload.spec);
      ensureReviewerOption(reviewer); activeSlot.originalReviewer = reviewer;
      updateReviewMeta(specData[activeSlot.spec]?.reviewer_slots?.[activeSlot.slot] || {});
      if (showToastMsg) showToast('Assignment saved'); return true;
    } catch { showToast('Failed to save assignment', true); return false; }
  }

  async function submitReviewFromDialog() {
    if (!activeSlot) return;
    const reviewer = getReviewerFromForm();
    if (!reviewer) { showToast('Select a reviewer first', true); return; }
    const statusInput = document.querySelector('input[name="review-status"]:checked');
    if (!statusInput) return;
    const note = (document.getElementById('review-note')?.value || '').trim();
    const refType = document.getElementById('refutation-type')?.value || 'peer_review';
    const severity = document.getElementById('refutation-severity')?.value || 'casual';
    const outcome = statusInput.value === 'approved' ? 'survived' : 'falsified';

    const assignmentOk = await saveAssignment(false);
    if (!assignmentOk && !(await ensureApi())) {
      showToast('API unavailable — run specs/dashboard/server.py', true);
      return;
    }
    try {
      const res = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: activeSlot.spec, reviewer, status: statusInput.value, note,
          type: refType, severity, outcome, falsification: outcome === 'falsified' ? note : '' }) });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      syncSpecState(activeSlot.spec, payload.spec);
      ensureReviewerOption(reviewer);
      showToast('Recorded'); closeReviewDialog();
    } catch { showToast('Failed to submit', true); }
  }

  window.showDetail = showDetail;
  window.closeDetail = closeDetail;
  window.onEvChange = onEvChange;
  window.copyCmd = copyCmd;
  window.dismissCmdPanel = dismissCmdPanel;

  // -- Conjecture popup --
  const descriptions = window.__DESCRIPTIONS__ || {};
  const popup = document.getElementById('conjecture-popup');
  if (popup) {
    const popupTitle = popup.querySelector('h4');
    const popupText = popup.querySelector('p');
    let hideTimer = null;

    function showPopup(el) {
      const code = el.dataset.spec;
      const desc = descriptions[code];
      if (!desc) return;
      popupTitle.textContent = desc.title || code;
      popupText.textContent = desc.conjecture || '';
      const rect = el.getBoundingClientRect();
      let left = rect.right + 12;
      let top = rect.top - 4;
      const pw = 420;
      if (left + pw > window.innerWidth) left = rect.left - pw - 12;
      if (left < 8) left = 8;
      if (top + 200 > window.innerHeight) top = window.innerHeight - 220;
      if (top < 8) top = 8;
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
      popup.classList.add('visible');
    }

    function hidePopup() {
      hideTimer = setTimeout(() => popup.classList.remove('visible'), 200);
    }

    document.querySelectorAll('.spec-name').forEach(el => {
      el.addEventListener('mouseenter', () => { clearTimeout(hideTimer); showPopup(el); });
      el.addEventListener('mouseleave', hidePopup);
    });

    document.querySelectorAll('.col-header').forEach(th => {
      th.style.cursor = 'help';
      th.addEventListener('mouseenter', () => {
        clearTimeout(hideTimer);
        const label = th.dataset.label || '';
        const conj = th.dataset.conjecture || '';
        if (!conj) return;
        popupTitle.textContent = label;
        popupText.textContent = conj;
        const rect = th.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - 210;
        let top = rect.bottom + 8;
        if (left + 420 > window.innerWidth) left = window.innerWidth - 430;
        if (left < 8) left = 8;
        if (top + 200 > window.innerHeight) top = rect.top - 160;
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
        popup.classList.add('visible');
      });
      th.addEventListener('mouseleave', hidePopup);
    });

    popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    popup.addEventListener('mouseleave', hidePopup);
  }

  init();
})();
