/**
 * Vault Dashboard v3.0 — 12-Panel Dual-Project Frontend
 * Monitors both Kognai (sovereign AI runtime) and Invoica (financial OS).
 * Vanilla JS. No frameworks. No build step.
 */

const API = '';  // Same origin

// --- State ---
let sseConnected = false;

// --- Helpers ---
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function statusClass(status) {
  return `status status-${(status || 'pending').replace(/\s/g, '-')}`;
}

function priorityClass(priority) {
  return `priority priority-${(priority || 'medium')}`;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Data Fetchers ---
async function fetchJson(path) {
  try {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`Fetch ${path} failed:`, e);
    return null;
  }
}

// --- Sprint Progress Block (reusable for both projects) ---
function renderSprintBlock(sprint, projectName, accentClass) {
  if (!sprint || sprint.error) {
    return `<div class="empty-state" style="padding: 12px;"><span style="color: var(--text-muted);">No active sprint</span></div>`;
  }

  const pct = sprint.completion_pct || 0;
  const color = pct >= 80 ? 'green' : pct >= 40 ? 'blue' : 'amber';
  let html = '';

  html += `
    <div style="margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <span style="font-weight: 600; font-size: 13px;">${escHtml(sprint.title || sprint.id)}</span>
        <span style="font-size: 12px; color: var(--text-secondary);">${sprint.completed_tasks}/${sprint.total_tasks} tasks</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${color}" style="width: ${pct}%"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted);">
        <span>${pct}% complete</span>
        ${sprint.approval_rate ? `<span>${sprint.approval_rate}% approval</span>` : ''}
      </div>
    </div>
  `;

  // Task board (show max 8 tasks)
  if (sprint.tasks && sprint.tasks.length > 0) {
    const tasks = sprint.tasks.slice(0, 8);
    for (const t of tasks) {
      html += `
        <div class="task-card">
          <span class="task-id">${escHtml(t.id)}</span>
          <span class="${statusClass(t.status)}">${escHtml(t.status)}</span>
          <span class="task-title">${escHtml(t.title)}</span>
          <span class="task-agent">${escHtml(t.agent)}</span>
        </div>
      `;
    }
    if (sprint.tasks.length > 8) {
      html += `<div style="font-size: 11px; color: var(--text-muted); padding: 4px 12px;">+${sprint.tasks.length - 8} more tasks</div>`;
    }
  }

  return html;
}

// ==============================================
// Panel Renderers (12 panels)
// ==============================================

// --- Panel 1: Progress ---
async function renderProgress() {
  const [kCurrent, kList, iCurrent, iList, iStats, gatesData] = await Promise.all([
    fetchJson('/api/sprints/current'),
    fetchJson('/api/sprints'),
    fetchJson('/api/invoica/sprints/current'),
    fetchJson('/api/invoica/sprints'),
    fetchJson('/api/invoica/stats'),
    fetchJson('/api/gates'),
  ]);
  const phases = (gatesData && gatesData.phases) || [];

  const panel = $('#progress-body');
  if (!panel) return;

  let html = '';

  // --- Kognai Section ---
  html += '<div class="project-section">';
  html += '<div class="project-section-header kognai"><span class="project-dot-inline kognai"></span> KOGNAI</div>';

  if (kCurrent && !kCurrent.error) {
    const sprintBadge = $('#badge-sprint');
    if (sprintBadge) sprintBadge.textContent = kCurrent.id || '';
    const phaseBadge = $('#badge-phase');
    if (phaseBadge) phaseBadge.textContent = kCurrent.phase || '';
  }

  html += renderSprintBlock(kCurrent, 'kognai', 'blue');
  html += '</div>';

  // --- Invoica Section ---
  html += '<div class="project-section">';
  html += '<div class="project-section-header invoica"><span class="project-dot-inline invoica"></span> INVOICA';
  if (iStats) {
    html += `<span class="project-stats">${iStats.total_completed || 0} tasks &middot; ${iStats.approval_rate || 0}% rate &middot; ${iStats.total_sprints || 0} sprints</span>`;
  }
  html += '</div>';

  if (iCurrent && !iCurrent.error) {
    const invBadge = $('#badge-invoica');
    if (invBadge) invBadge.textContent = iCurrent.title || iCurrent.id || '';
  }

  html += renderSprintBlock(iCurrent, 'invoica', 'green');
  html += '</div>';

  // --- Phase timeline (Kognai) ---
  if (phases && phases.length > 0) {
    html += '<div class="section-divider">Kognai Phase Timeline</div>';
    html += '<div class="phase-timeline">';
    for (const p of phases) {
      const cls = p.current ? 'current' : '';
      html += `<div class="phase-segment ${cls}" title="${escHtml(p.phase)}: ${escHtml(p.focus || '')}"></div>`;
    }
    html += '</div>';
    html += '<div class="phase-labels">';
    for (const p of phases) {
      const cls = p.current ? 'current' : '';
      html += `<span class="${cls}">${escHtml(p.phase)}</span>`;
    }
    html += '</div>';
  }

  // --- Sprint history (both projects, interleaved) ---
  html += '<div class="section-divider">Recent Sprints</div>';

  if (kList && kList.length > 0) {
    html += '<div style="font-size: 10px; color: var(--accent-blue); margin-bottom: 4px; font-weight: 600;">KOGNAI</div>';
    const recent = kList.slice(-4).reverse();
    for (const s of recent) {
      html += `
        <div class="sprint-mini">
          <span class="sprint-mini-id">${escHtml(s.number)}</span>
          <div class="sprint-mini-bar">
            <div class="sprint-mini-fill kognai-fill" style="width: ${s.completion_pct}%"></div>
          </div>
          <span class="sprint-mini-pct">${s.completion_pct}%</span>
        </div>
      `;
    }
  }

  if (iList && iList.length > 0) {
    html += '<div style="font-size: 10px; color: var(--accent-green); margin-bottom: 4px; margin-top: 8px; font-weight: 600;">INVOICA</div>';
    const recent = iList.slice(0, 4);
    for (const s of recent) {
      const rateStr = s.approval_rate ? ` &middot; ${s.approval_rate}%` : '';
      html += `
        <div class="sprint-mini">
          <span class="sprint-mini-id" title="${escHtml(s.title)}">${escHtml(s.title.substring(0, 12))}</span>
          <div class="sprint-mini-bar">
            <div class="sprint-mini-fill invoica-fill" style="width: ${s.completion_pct}%"></div>
          </div>
          <span class="sprint-mini-pct">${s.completion_pct}%${rateStr}</span>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
}

// --- Panel 2: Today's Tasks ---
async function renderTodo() {
  const [brief, gatesResp] = await Promise.all([
    fetchJson('/api/daily-brief'),
    fetchJson('/api/gates'),
  ]);
  const gates = (gatesResp && gatesResp.gates) || [];

  const panel = $('#todo-body');
  if (!panel) return;

  let html = '';

  if (brief && !brief.error) {
    if (brief.date) {
      const d = new Date(brief.date + 'T00:00:00');
      const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      html += `<div class="todo-date">${dateStr}</div>`;
    }

    html += `
      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-value">${brief.done_tasks || 0}/${brief.total_tasks || 0}</div>
          <div class="stat-label">Tasks Done</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${brief.hours || '?'}</div>
          <div class="stat-label">Hours Today</div>
        </div>
      </div>
    `;

    const blockNames = { AM: 'AM 07:00-09:30', MID: 'MID 12:00-14:00', PM: 'PM 18:00-19:30' };
    for (const [block, label] of Object.entries(blockNames)) {
      const tasks = (brief.blocks && brief.blocks[block]) || [];
      if (tasks.length === 0) continue;

      html += `<div class="todo-block-header">${label}</div>`;
      for (let idx = 0; idx < tasks.length; idx++) {
        const t = tasks[idx];
        const doneClass = t.done ? 'done' : '';
        const disabledClass = t.disabled ? 'disabled' : '';
        const deferredClass = t.deferred ? 'deferred' : '';
        const icon = t.disabled ? '&mdash;' : t.deferred ? '&#9197;' : (t.done ? '&#9989;' : '&#11036;');
        const clickable = (t.disabled || t.deferred) ? '' : `onclick="toggleTask('${block}', ${idx})"`;
        const deferBtn = (!t.disabled && !t.done && !t.deferred)
          ? `<button class="defer-btn" onclick="event.stopPropagation(); deferTask('${block}', ${idx})" title="Defer to tomorrow">&rarr;</button>`
          : '';
        html += `
          <div class="todo-item ${doneClass} ${disabledClass} ${deferredClass}" ${clickable}>
            <span class="todo-check">${icon}</span>
            <span class="todo-text">${escHtml(t.text)}</span>
            ${deferBtn}
          </div>
        `;
      }
    }
  } else {
    const msg = (brief && brief.error) || 'No daily brief found';
    html += `<div class="empty-state"><div class="icon">&#128221;</div>${escHtml(msg)}</div>`;
  }

  if (gates && gates.length > 0) {
    html += '<div class="section-divider">Upcoming Gates</div>';
    const pending = gates.filter(g => g.status === 'pending').slice(0, 4);
    for (const g of pending) {
      let daysClass = 'far';
      let daysText = '';
      if (g.days_until !== null && g.days_until !== undefined) {
        if (g.days_until < 0) {
          daysClass = 'soon';
          daysText = `${Math.abs(g.days_until)}d overdue`;
        } else if (g.days_until <= 7) {
          daysClass = 'soon';
          daysText = `${g.days_until}d`;
        } else if (g.days_until <= 21) {
          daysClass = 'upcoming';
          daysText = `${g.days_until}d`;
        } else {
          daysText = `${g.days_until}d`;
        }
      }

      html += `
        <div class="gate-row">
          <span class="gate-name">${escHtml(g.gate)}</span>
          <span class="gate-date">${escHtml(g.target_date)}</span>
          <span class="gate-days ${daysClass}">${daysText}</span>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
}

// --- Panel 3: Project Overview ---
async function renderOverview() {
  const data = await fetchJson('/api/overview');
  const panel = $('#overview-body');
  if (!panel) return;

  let html = '';

  if (!data) {
    html = '<div class="empty-state"><div class="icon">&#128203;</div>Overview unavailable</div>';
    panel.innerHTML = html;
    return;
  }

  // Git status for both repos
  if (data.git) {
    for (const [repo, g] of Object.entries(data.git)) {
      const isKognai = repo === 'kognai';
      const dotClass = isKognai ? 'kognai' : 'invoica';
      const cleanBadge = g.clean
        ? '<span class="mini-badge green">CLEAN</span>'
        : `<span class="mini-badge amber">${g.modified}M ${g.untracked}U</span>`;
      const syncBadge = g.ahead === 0
        ? '<span class="mini-badge green">SYNCED</span>'
        : `<span class="mini-badge red">${g.ahead} ahead</span>`;

      html += `
        <div class="overview-row">
          <span class="project-dot-inline ${dotClass}"></span>
          <span class="overview-repo">${repo.toUpperCase()}</span>
          <span class="overview-commit mono">${escHtml(g.last_commit || '').substring(0, 40)}</span>
          ${cleanBadge} ${syncBadge}
        </div>
      `;
    }
  }

  // Build progress
  if (data.build_progress) {
    html += '<div class="section-divider">Build Sequence</div>';
    for (const b of data.build_progress) {
      const icon = b.status === 'done' ? '&#9745;' : b.status === 'seeded' ? '&#9744;' : '&#8212;';
      const cls = b.status === 'done' ? 'done' : b.status === 'seeded' ? 'active' : 'future';
      html += `<div class="build-step ${cls}"><span class="build-icon">${icon}</span><span class="build-num">${b.num}.</span> ${escHtml(b.task)}</div>`;
    }
  }

  // Blockers
  if (data.blockers && data.blockers.length > 0) {
    html += '<div class="section-divider">Blockers</div>';
    for (const b of data.blockers) {
      const ownerCls = b.owner === 'external' ? 'amber' : 'red';
      html += `
        <div class="blocker-row">
          <span class="mini-badge ${ownerCls}">${escHtml(b.owner)}</span>
          <span class="blocker-name">${escHtml(b.name)}</span>
          <span class="blocker-detail">${escHtml(b.detail)}</span>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
}

// --- Panel 4: SCS-001 Build Track ---
async function renderSCS001() {
  const data = await fetchJson('/api/overview');
  const panel = $('#scs001-body');
  if (!panel) return;

  let html = '';

  if (!data || !data.scs001_blocks) {
    html = '<div class="empty-state"><div class="icon">&#128736;</div>SCS-001 data unavailable</div>';
    panel.innerHTML = html;
    return;
  }

  const statusColors = {
    conditional_pass: 'green',
    done: 'green',
    in_progress: 'blue',
    not_started: 'amber',
    blocked: 'red',
    future: 'muted',
  };

  for (const block of data.scs001_blocks) {
    const color = statusColors[block.status] || 'muted';
    const statusLabel = block.status.replace(/_/g, ' ').toUpperCase();
    html += `
      <div class="scs-block">
        <div class="scs-block-header">
          <span class="scs-block-letter">Block ${escHtml(block.block)}</span>
          <span class="scs-block-name">${escHtml(block.name)}</span>
          <span class="mini-badge ${color}">${statusLabel}</span>
        </div>
        <div class="scs-block-detail">
          <span class="scs-agents">${escHtml(block.agents)}</span>
          <span class="scs-sprints mono">${escHtml(block.sprints)}</span>
        </div>
      </div>
    `;
  }

  panel.innerHTML = html;
}

// --- Panel 5: Costs ---
async function renderCosts() {
  const costs = await fetchJson('/api/costs');
  const panel = $('#costs-body');
  if (!panel) return;

  let html = '';

  if (costs) {
    const total = costs.total_usd || 0;
    const colorClass = total > 3 ? 'var(--accent-red)' : total > 1 ? 'var(--accent-amber)' : 'var(--accent-green)';

    html += `
      <div class="cost-big" style="color: ${colorClass}">$${total.toFixed(4)}</div>
      <div class="cost-label">Total spend today</div>
    `;

    const byTier = costs.by_tier || {};
    const totalTasks = Object.values(byTier).reduce((a, b) => a + b, 0);

    if (totalTasks > 0) {
      html += '<div class="tier-bar">';
      const tiers = ['NANO', 'LOCAL', 'POWER', 'CLOUD', 'APEX'];
      for (const tier of tiers) {
        const count = byTier[tier] || 0;
        if (count === 0) continue;
        const pct = (count / totalTasks * 100).toFixed(1);
        html += `<div class="tier-segment tier-${tier}" style="width: ${pct}%">${pct > 8 ? tier : ''}</div>`;
      }
      html += '</div>';

      html += `
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 12px;">
          <span style="color: var(--accent-green);">${costs.local_pct || 0}% local</span>
          <span style="color: var(--accent-amber);">${costs.cloud_pct || 0}% cloud</span>
        </div>
      `;

      html += '<div class="section-divider">Tier Breakdown</div>';
      const tierCosts = { NANO: 0, LOCAL: 0, POWER: 0, CLOUD: 0.003, APEX: 0.015 };
      for (const tier of tiers) {
        const count = byTier[tier] || 0;
        const cost = (count * (tierCosts[tier] || 0)).toFixed(4);
        html += `
          <div class="tier-row">
            <div class="tier-dot tier-${tier}" style="width: 10px; height: 10px; border-radius: 2px;"></div>
            <span class="tier-name">${tier}</span>
            <span class="tier-count">${count} tasks</span>
            <span class="tier-cost">$${cost}</span>
          </div>
        `;
      }
    } else {
      html += `
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin: 8px 0;">
          <span style="color: var(--text-muted);">Target: >95% local</span>
          <span style="color: var(--text-muted);">Budget: $5.00/day</span>
        </div>
      `;
      if (costs.message) {
        html += `<div class="empty-state"><div class="icon">&#128200;</div>${escHtml(costs.message)}</div>`;
      }
    }

    const budgetPct = Math.min((total / 5.0) * 100, 100);
    const budgetClass = budgetPct > 80 ? 'danger' : budgetPct > 50 ? 'warning' : 'safe';
    html += `
      <div class="section-divider">Daily Budget</div>
      <div class="budget-bar">
        <div class="budget-fill ${budgetClass}" style="width: ${budgetPct}%"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted);">
        <span>$${total.toFixed(2)} spent</span>
        <span>$${(costs.budget_remaining || 5).toFixed(2)} remaining</span>
      </div>
    `;
  } else {
    html += '<div class="empty-state"><div class="icon">&#128176;</div>Cost data unavailable</div>';
  }

  panel.innerHTML = html;
}

// --- Panel 6: Model Routing ---
async function renderRouting() {
  const data = await fetchJson('/api/routing/stats');
  const tbody = document.querySelector('#model-table tbody');
  const ul = document.getElementById('recent-list');
  if (!tbody || !ul) return;

  const byModel = data.by_model || {};
  const total = data.total || 0;
  const rows = Object.entries(byModel)
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => {
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      return `<tr><td>${model}</td><td>${count}</td><td>${pct}%</td></tr>`;
    }).join('');
  tbody.innerHTML = rows || '<tr><td colspan="3" style="color:var(--text-muted)">No data yet</td></tr>';

  const recent = (data.recent || []).slice(-5).reverse();
  ul.innerHTML = recent.map(r =>
    `<li><span style="color:var(--text-muted)">[${r.sprint_id || '?'}]</span> ${r.task_id} &rarr; <strong>${r.model}</strong></li>`
  ).join('') || '<li style="color:var(--text-muted)">No recent decisions</li>';
}

// --- Panel 7: Amendments ---
async function renderAmendments() {
  const data = await fetchJson('/api/overview');
  const panel = $('#amendments-body');
  if (!panel) return;

  let html = '';

  if (!data || !data.amendments) {
    html = '<div class="empty-state"><div class="icon">&#128220;</div>Amendment data unavailable</div>';
    panel.innerHTML = html;
    return;
  }

  const doneCount = data.amendments.filter(a => a.status === '&#9989;' || a.phase === 'COMPLETE' || a.p0.includes('DONE')).length;
  html += `
    <div class="stats-row">
      <div class="stat-box">
        <div class="stat-value">${doneCount}/${data.amendments.length}</div>
        <div class="stat-label">AMDs Complete</div>
      </div>
    </div>
  `;

  for (const a of data.amendments) {
    const isDone = a.p0.includes('DONE');
    const cls = isDone ? 'done' : 'pending';
    html += `
      <div class="amd-row ${cls}">
        <span class="amd-id mono">${escHtml(a.id)}</span>
        <span class="amd-title">${escHtml(a.title)}</span>
        <span class="amd-status">${isDone ? '&#9745;' : '&#9744;'}</span>
        <span class="amd-detail">${escHtml(a.detail)}</span>
      </div>
    `;
  }

  panel.innerHTML = html;
}

// --- Panel 8: On-Chain ---
async function renderChain() {
  const data = await fetchJson('/api/chain');
  const panel = $('#chain-body');
  if (!panel) return;

  let html = '';

  if (!data) {
    html = '<div class="empty-state"><div class="icon">&#9939;</div>Chain data unavailable</div>';
    panel.innerHTML = html;
    return;
  }

  // EAS Schemas
  if (data.eas_schemas && data.eas_schemas.length > 0) {
    html += '<div class="chain-section-label">EAS Schemas</div>';
    if (data.eas_network) {
      html += `<div class="chain-meta">Network: ${escHtml(data.eas_network)}</div>`;
    }
    for (const s of data.eas_schemas) {
      html += `
        <div class="chain-item">
          <span class="chain-name">${escHtml(s.name)}</span>
          <span class="chain-uid mono" title="${escHtml(s.uid_full)}">${escHtml(s.uid)}</span>
        </div>
      `;
    }
  }

  // Agent Registry
  if (data.agent_registry && data.agent_registry.agents && data.agent_registry.agents.length > 0) {
    html += '<div class="section-divider">Agent NFTs (ERC-8004)</div>';
    if (data.agent_registry.address) {
      html += `<div class="chain-meta">Registry: ${escHtml(data.agent_registry.address.substring(0, 20))}...</div>`;
    }
    for (const a of data.agent_registry.agents) {
      const mintedBadge = a.minted ? '<span class="mini-badge green">MINTED</span>' : '<span class="mini-badge amber">PENDING</span>';
      html += `
        <div class="chain-item">
          <span class="chain-name">${escHtml(a.name)}</span>
          ${a.role ? `<span class="chain-role">${escHtml(a.role)}</span>` : ''}
          ${mintedBadge}
        </div>
      `;
    }
  }

  // AAR Receipts
  html += `<div class="section-divider">AAR Receipts (${data.aar_total_receipts || 0} total)</div>`;
  if (data.aar_recent && data.aar_recent.length > 0) {
    for (const r of data.aar_recent.slice(0, 6)) {
      const ts = r.timestamp ? r.timestamp.substring(11, 19) : '';
      html += `
        <div class="chain-receipt">
          <span class="mono" style="color: var(--text-muted);">${ts}</span>
          <span>${escHtml(r.agent || r.type || '')}</span>
          <span class="chain-action">${escHtml(r.action || r.event || '')}</span>
        </div>
      `;
    }
  } else {
    html += '<div style="font-size: 12px; color: var(--text-muted);">No recent receipts</div>';
  }

  panel.innerHTML = html;
}

// --- Panel 9: Security ---
async function renderSecurity() {
  const data = await fetchJson('/api/overview');
  const panel = $('#security-body');
  if (!panel) return;

  let html = '';

  if (!data || !data.security) {
    html = '<div class="empty-state"><div class="icon">&#128274;</div>Security data unavailable</div>';
    panel.innerHTML = html;
    return;
  }

  const statusIcons = { done: '&#9745;', partial: '&#9744;', future: '&#8212;' };
  const statusColors = { done: 'green', partial: 'amber', future: 'muted' };

  for (const layer of data.security) {
    const color = statusColors[layer.status] || 'muted';
    const icon = statusIcons[layer.status] || '&#8212;';
    html += `
      <div class="security-layer">
        <div class="security-layer-header">
          <span class="security-layer-num">L${layer.layer}</span>
          <span class="security-layer-name">${escHtml(layer.name)}</span>
          <span class="mini-badge ${color}">${layer.status.toUpperCase()}</span>
        </div>
        <div class="security-layer-detail">${escHtml(layer.detail)}</div>
      </div>
    `;
  }

  panel.innerHTML = html;
}

// --- Panel 10: Assets ---
async function renderAssets() {
  const data = await fetchJson('/api/assets');
  const panel = $('#assets-body');
  if (!panel) return;

  let html = '';

  if (!data) {
    html = '<div class="empty-state"><div class="icon">&#128218;</div>Asset data unavailable</div>';
    panel.innerHTML = html;
    return;
  }

  // Skills summary
  const skills = data.skills || {};
  html += `
    <div class="stats-row">
      <div class="stat-box">
        <div class="stat-value">${skills.total_skills || 0}</div>
        <div class="stat-label">Total Skills</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${(data.code_assets && data.code_assets.total_assets) || 0}</div>
        <div class="stat-label">Code Assets</div>
      </div>
    </div>
  `;

  // Skill directories
  if (skills.skill_dirs && skills.skill_dirs.length > 0) {
    html += '<div class="section-divider">Skill Categories</div>';
    for (const d of skills.skill_dirs) {
      html += `
        <div class="asset-row">
          <span class="asset-name">${escHtml(d.name)}</span>
          <span class="asset-count">${d.count} files</span>
        </div>
      `;
    }
  }

  // Skill files (top 8)
  if (skills.skill_files && skills.skill_files.length > 0) {
    html += '<div class="section-divider">Recent Skills</div>';
    for (const s of skills.skill_files.slice(0, 8)) {
      html += `
        <div class="asset-row">
          <span class="asset-name" title="${escHtml(s.file)}">${escHtml(s.title || s.file).substring(0, 40)}</span>
          ${s.score ? `<span class="asset-score">${s.score}</span>` : ''}
          ${s.agent ? `<span class="asset-agent mono">${escHtml(s.agent)}</span>` : ''}
        </div>
      `;
    }
    if (skills.skill_files.length > 8) {
      html += `<div style="font-size: 11px; color: var(--text-muted); padding: 4px 0;">+${skills.skill_files.length - 8} more</div>`;
    }
  }

  // Code assets
  const codeAssets = data.code_assets || {};
  if (codeAssets.assets && codeAssets.assets.length > 0) {
    html += '<div class="section-divider">Code Assets</div>';
    for (const a of codeAssets.assets.slice(0, 6)) {
      html += `
        <div class="asset-row">
          <span class="mini-badge purple">T${a.tier}</span>
          <span class="asset-name">${escHtml(a.title)}</span>
          <span class="asset-lang mono">${escHtml(a.language)}</span>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
}

// --- Panel 11: Logs & Agents ---
async function renderLogs() {
  const [logs, kAgents, iAgents] = await Promise.all([
    fetchJson('/api/logs/latest'),
    fetchJson('/api/agents'),
    fetchJson('/api/invoica/agents'),
  ]);

  const panel = $('#logs-body');
  if (!panel) return;

  let html = '';

  if (logs && logs.summary) {
    const s = logs.summary;
    html += `
      <div class="log-summary">
        <div class="log-summary-item">
          <span style="color: var(--accent-green);">&#10003;</span>
          <span>${s.approved || 0} approved</span>
        </div>
        <div class="log-summary-item">
          <span style="color: var(--accent-red);">&#10007;</span>
          <span>${s.rejected || 0} rejected</span>
        </div>
        <div class="log-summary-item">
          <span style="color: var(--text-muted);">#</span>
          <span>${s.total_lines || 0} lines</span>
        </div>
        ${s.approval_rate ? `<div class="log-summary-item"><span>${s.approval_rate}% rate</span></div>` : ''}
      </div>
    `;
  }

  if (logs && logs.lines && logs.lines.length > 0) {
    html += `<div class="section-divider">Sprint Log${logs.sprint ? ` (${logs.sprint})` : ''}</div>`;
    html += '<div class="log-viewer">';
    const lines = logs.lines.slice(-60);
    for (const line of lines) {
      let cls = 'log-line';
      const lower = line.toLowerCase();
      if (lower.includes('error') || lower.includes('rejected') || lower.includes('failed')) cls += ' error';
      else if (lower.includes('approved') || lower.includes('success')) cls += ' approved';
      else if (lower.includes('task:') || lower.includes('[ceo]') || lower.includes('[cto]')) cls += ' task';
      html += `<div class="${cls}">${escHtml(line)}</div>`;
    }
    html += '</div>';
  } else {
    html += '<div class="empty-state"><div class="icon">&#128203;</div>No sprint logs yet</div>';
  }

  if (logs && logs.errors && logs.errors.length > 0) {
    html += `<div class="section-divider">Errors (${logs.errors.length})</div>`;
    for (const err of logs.errors.slice(0, 10)) {
      html += `<div class="log-viewer" style="max-height: 40px; margin-bottom: 4px; color: var(--accent-red); font-size: 11px;">${escHtml(err.line)}</div>`;
    }
  }

  const kCount = (kAgents && kAgents.length) || 0;
  const iCount = (iAgents && iAgents.length) || 0;

  html += `<div class="section-divider">Agents (${kCount + iCount})</div>`;

  if (kAgents && kAgents.length > 0) {
    html += '<div class="agent-section-label kognai">KOGNAI <span class="agent-count">' + kCount + '</span></div>';
    html += '<div class="agent-grid">';
    for (const a of kAgents) {
      const tier = a.tier || 'auto';
      html += `
        <div class="agent-chip" title="${escHtml(a.role || '')} [${escHtml(a.llm || '')}]">
          <span class="agent-dot ${tier}"></span>
          <span>${escHtml(a.name)}</span>
        </div>
      `;
    }
    html += '</div>';
  }

  if (iAgents && iAgents.length > 0) {
    html += '<div class="agent-section-label invoica">INVOICA <span class="agent-count">' + iCount + '</span></div>';
    html += '<div class="agent-grid">';
    for (const a of iAgents) {
      const tier = a.tier || 'auto';
      html += `
        <div class="agent-chip invoica-chip" title="${escHtml(a.role || '')} [${escHtml(a.llm || '')}]">
          <span class="agent-dot ${tier}"></span>
          <span>${escHtml(a.name)}</span>
        </div>
      `;
    }
    html += '</div>';
  }

  panel.innerHTML = html;
}

// --- Panel 12: Revenue & Blockers ---
async function renderRevenue() {
  const data = await fetchJson('/api/overview');
  const panel = $('#revenue-body');
  if (!panel) return;

  let html = '';

  if (!data || !data.revenue) {
    html = '<div class="empty-state"><div class="icon">&#128181;</div>Revenue data unavailable</div>';
    panel.innerHTML = html;
    return;
  }

  const rev = data.revenue;

  html += `
    <div class="stats-row">
      <div class="stat-box">
        <div class="stat-value" style="color: ${rev.current_mrr > 0 ? 'var(--accent-green)' : 'var(--text-muted)'};">$${rev.current_mrr}</div>
        <div class="stat-label">Current MRR</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" style="font-size: 14px;">${escHtml(rev.phase)}</div>
        <div class="stat-label">Phase</div>
      </div>
    </div>
  `;

  if (rev.first_revenue_gate) {
    html += `<div style="font-size: 12px; color: var(--accent-amber); margin-bottom: 12px;">Gate: ${escHtml(rev.first_revenue_gate)}</div>`;
  }

  // Revenue targets
  if (rev.targets && rev.targets.length > 0) {
    html += '<div class="section-divider">MRR Targets</div>';
    for (const t of rev.targets) {
      const barPct = Math.min((rev.current_mrr / t.mrr) * 100, 100);
      html += `
        <div class="revenue-target">
          <div class="revenue-target-header">
            <span class="mono">${escHtml(t.month)}</span>
            <span>$${t.mrr}/mo</span>
            <span style="color: var(--text-muted); font-size: 11px;">${escHtml(t.source)}</span>
          </div>
          <div class="progress-bar" style="height: 4px;">
            <div class="progress-fill ${barPct >= 100 ? 'green' : 'blue'}" style="width: ${barPct}%"></div>
          </div>
        </div>
      `;
    }
  }

  // Backlog evaluations
  if (data.backlog_evals && data.backlog_evals.length > 0) {
    html += '<div class="section-divider">Backlog Evaluations</div>';
    for (const e of data.backlog_evals) {
      html += `
        <div class="eval-row">
          <span class="mono eval-id">${escHtml(e.id)}</span>
          <span class="eval-product">${escHtml(e.product)}</span>
          <span class="mini-badge amber">${escHtml(e.status.replace(/_/g, ' '))}</span>
          <span class="eval-gate">Gate: ${escHtml(e.gate)}</span>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
}

// --- Clock ---
function updateClock() {
  const el = $('#clock');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

// --- SSE Connection ---
function connectSSE() {
  const dot = $('#connection-dot');
  if (dot) dot.classList.remove('disconnected');
  sseConnected = true;
}

// --- Toggle Task Checkbox ---
async function toggleTask(block, index) {
  try {
    const res = await fetch('/api/daily-brief/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block, index }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await renderTodo();
  } catch (e) {
    console.error('Toggle failed:', e);
  }
}

// --- Defer Task to Tomorrow ---
async function deferTask(block, index) {
  try {
    const res = await fetch('/api/daily-brief/defer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block, index }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await renderTodo();
  } catch (e) {
    console.error('Defer failed:', e);
  }
}

// --- All render functions ---
const ALL_RENDERERS = [
  renderProgress, renderTodo, renderOverview, renderSCS001,
  renderCosts, renderRouting, renderAmendments, renderChain,
  renderSecurity, renderAssets, renderLogs, renderRevenue,
];

// --- Manual Refresh ---
async function refreshAll() {
  const btn = $('#refresh-btn');
  if (btn) btn.classList.add('spinning');
  await Promise.all(ALL_RENDERERS.map(fn => fn()));
  if (btn) setTimeout(() => btn.classList.remove('spinning'), 600);
}

// --- Init ---
async function init() {
  await Promise.all(ALL_RENDERERS.map(fn => fn()));

  updateClock();
  setInterval(updateClock, 1000);

  connectSSE();

  // Full refresh every 60s
  setInterval(() => {
    ALL_RENDERERS.forEach(fn => fn());
  }, 60000);
}

document.addEventListener('DOMContentLoaded', init);
