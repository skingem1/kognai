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

  const kSkills = data.skills || {};
  const iSkills = data.invoica_skills || {};
  const iFailures = data.invoica_failures || {};
  const iSummary = data.invoica_summary || {};
  const iCrystallised = data.invoica_crystallised_skills || {};

  // Combined stats
  const totalKognaiSkills = kSkills.total_skills || 0;
  const totalInvoicaSkills = iSummary.total_skills || 0;
  const totalCrystallised = iCrystallised.total || 0;
  const totalFailures = iSummary.total_failures || 0;

  html += `
    <div class="stats-row">
      <div class="stat-box" style="border-left: 3px solid var(--accent-blue);">
        <div class="stat-value" style="color: var(--accent-blue);">${totalKognaiSkills}</div>
        <div class="stat-label">Kognai Skills</div>
      </div>
      <div class="stat-box" style="border-left: 3px solid var(--accent-green);">
        <div class="stat-value" style="color: var(--accent-green);">${totalInvoicaSkills}</div>
        <div class="stat-label">Invoica Virtual</div>
      </div>
      <div class="stat-box" style="border-left: 3px solid var(--accent-purple);">
        <div class="stat-value" style="color: var(--accent-purple);">${totalCrystallised}</div>
        <div class="stat-label">Crystallised</div>
      </div>
      <div class="stat-box" style="border-left: 3px solid var(--accent-red);">
        <div class="stat-value" style="color: var(--accent-red);">${totalFailures}</div>
        <div class="stat-label">Failures</div>
      </div>
    </div>
  `;

  // --- Kognai Skills ---
  if (kSkills.skill_files && kSkills.skill_files.length > 0) {
    html += '<div class="section-divider"><span class="project-dot-inline kognai"></span> Kognai Skills</div>';
    for (const s of kSkills.skill_files.slice(0, 6)) {
      html += `
        <div class="asset-row">
          <span class="asset-name" title="${escHtml(s.file)}">${escHtml(s.title || s.file).substring(0, 45)}</span>
          ${s.score ? `<span class="asset-score">${s.score}</span>` : ''}
          ${s.agent ? `<span class="asset-agent mono">${escHtml(s.agent)}</span>` : ''}
        </div>
      `;
    }
    if (kSkills.skill_files.length > 6) {
      html += `<div style="font-size: 10px; color: var(--text-muted); padding: 2px 0;">+${kSkills.skill_files.length - 6} more</div>`;
    }
  }

  // --- Invoica Skills (virtual — from approved sprint tasks) ---
  if (iSkills.skills && iSkills.skills.length > 0) {
    html += '<div class="section-divider"><span class="project-dot-inline invoica"></span> Invoica Skills</div>';
    for (const s of iSkills.skills.slice(0, 6)) {
      const typeIcon = s.type === 'bugfix' ? '🔧' : s.type === 'feature' ? '✨' : s.type === 'refactor' ? '♻️' : '📋';
      html += `
        <div class="asset-row">
          <span style="font-size: 10px;" title="${escHtml(s.type)}">${typeIcon}</span>
          <span class="asset-name" title="${escHtml(s.title)}">${escHtml(s.title).substring(0, 45)}</span>
          <span class="asset-agent mono">${escHtml(s.agent || '')}</span>
        </div>
      `;
    }
    if (iSkills.skills.length > 6) {
      html += `<div style="font-size: 10px; color: var(--text-muted); padding: 2px 0;">+${iSkills.skills.length - 6} more from ${iSkills.sprints_scanned || '?'} sprints</div>`;
    }
  }

  // --- Invoica Crystallised Skills (AMD-02 quality-gated) ---
  if (iCrystallised.skills && iCrystallised.skills.length > 0) {
    html += `<div class="section-divider" style="color: var(--accent-purple);">
      <span class="project-dot-inline invoica"></span> Crystallised Skills
      ${iCrystallised.avg_score ? `<span style="font-size: 10px; color: var(--text-muted); margin-left: 6px;">avg: ${iCrystallised.avg_score}/100</span>` : ''}
    </div>`;
    for (const s of iCrystallised.skills.slice(0, 6)) {
      const scoreColor = s.avg_score >= 90 ? 'var(--accent-green)' : s.avg_score >= 75 ? 'var(--accent-amber)' : 'var(--accent-red)';
      html += `
        <div class="asset-row" style="border-left: 2px solid var(--accent-purple); padding-left: 6px;">
          <span class="asset-name" title="${escHtml(s.description || s.skill_id)}">${escHtml(s.name).substring(0, 40)}</span>
          <span style="font-size: 10px; color: ${scoreColor}; font-weight: bold;">${s.avg_score}</span>
          <span class="asset-agent mono">${escHtml(s.agent || '')}</span>
          <span style="font-size: 9px; color: var(--text-muted);">x${s.execution_count || 1}</span>
        </div>
      `;
    }
    if (iCrystallised.skills.length > 6) {
      html += `<div style="font-size: 10px; color: var(--text-muted); padding: 2px 0;">+${iCrystallised.skills.length - 6} more crystallised</div>`;
    }
  }

  // --- Invoica Failures ---
  if (iFailures.failures && iFailures.failures.length > 0) {
    const types = iFailures.failure_types || {};
    html += '<div class="section-divider" style="color: var(--accent-red);">⚠ Failure Library</div>';

    // Type breakdown (compact)
    const typeEntries = Object.entries(types).sort((a,b) => b[1] - a[1]);
    if (typeEntries.length > 0) {
      html += '<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;">';
      for (const [type, count] of typeEntries) {
        html += `<span class="mini-badge" style="background: rgba(255,99,99,0.1); color: var(--accent-red); font-size: 9px;">${type}: ${count}</span>`;
      }
      html += '</div>';
    }

    for (const f of iFailures.failures.slice(0, 5)) {
      html += `
        <div class="asset-row" style="border-left: 2px solid var(--accent-red); padding-left: 6px;">
          <span class="asset-name" style="color: var(--accent-red);" title="${escHtml(f.reason)}">${escHtml(f.task_id)}</span>
          <span style="font-size: 10px; color: var(--text-muted);">${escHtml(f.reason).substring(0, 40)}</span>
        </div>
      `;
    }
    if (iFailures.failures.length > 5) {
      html += `<div style="font-size: 10px; color: var(--text-muted); padding: 2px 0;">+${iFailures.failures.length - 5} more failures</div>`;
    }
  }

  // Code assets (Kognai)
  const codeAssets = data.code_assets || {};
  if (codeAssets.assets && codeAssets.assets.length > 0) {
    html += '<div class="section-divider">Code Assets</div>';
    for (const a of codeAssets.assets.slice(0, 4)) {
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
  const [kLogs, iLogs, kAgents, iAgents] = await Promise.all([
    fetchJson('/api/logs/latest'),
    fetchJson('/api/invoica/logs/latest'),
    fetchJson('/api/agents'),
    fetchJson('/api/invoica/agents'),
  ]);

  const panel = $('#logs-body');
  if (!panel) return;

  let html = '';

  // --- Kognai Log Summary ---
  if (kLogs && kLogs.summary) {
    const s = kLogs.summary;
    html += '<div class="project-section-header kognai" style="margin-bottom: 4px;"><span class="project-dot-inline kognai"></span> KOGNAI LOG</div>';
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

  if (kLogs && kLogs.lines && kLogs.lines.length > 0) {
    html += `<div class="section-divider">Sprint Log${kLogs.sprint ? ` (${kLogs.sprint})` : ''}</div>`;
    html += '<div class="log-viewer" style="max-height: 200px;">';
    const lines = kLogs.lines.slice(-40);
    for (const line of lines) {
      let cls = 'log-line';
      const lower = line.toLowerCase();
      if (lower.includes('error') || lower.includes('rejected') || lower.includes('failed')) cls += ' error';
      else if (lower.includes('approved') || lower.includes('success')) cls += ' approved';
      else if (lower.includes('task:') || lower.includes('[ceo]') || lower.includes('[cto]')) cls += ' task';
      html += `<div class="${cls}">${escHtml(line)}</div>`;
    }
    html += '</div>';
  }

  // --- Invoica Log Summary ---
  if (iLogs && !iLogs.error) {
    html += '<div class="project-section-header invoica" style="margin-top: 10px; margin-bottom: 4px;"><span class="project-dot-inline invoica"></span> INVOICA LOG</div>';
    html += `<div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">${escHtml(iLogs.file || '')} &middot; ${iLogs.source || ''} &middot; ${iLogs.total_lines || 0} lines</div>`;

    if (iLogs.lines && iLogs.lines.length > 0) {
      html += '<div class="log-viewer" style="max-height: 150px;">';
      const iLines = iLogs.lines.slice(-30);
      for (const line of iLines) {
        let cls = 'log-line';
        const lower = line.toLowerCase();
        if (lower.includes('error') || lower.includes('rejected') || lower.includes('failed')) cls += ' error';
        else if (lower.includes('approved') || lower.includes('success') || lower.includes('done')) cls += ' approved';
        html += `<div class="${cls}">${escHtml(line)}</div>`;
      }
      html += '</div>';
    } else {
      html += '<div style="font-size: 10px; color: var(--text-muted);">Session active — no output yet</div>';
    }

    if (iLogs.errors && iLogs.errors.length > 0) {
      html += `<div style="font-size: 10px; color: var(--accent-red); margin-top: 4px;">${iLogs.errors.length} error(s) in log</div>`;
    }
  }

  // --- Combined Errors ---
  const allErrors = [];
  if (kLogs && kLogs.errors) {
    for (const e of kLogs.errors.slice(0, 5)) allErrors.push({...e, project: 'kognai'});
  }
  if (iLogs && iLogs.errors) {
    for (const e of iLogs.errors.slice(0, 5)) allErrors.push({...e, project: 'invoica'});
  }
  if (allErrors.length > 0) {
    html += `<div class="section-divider" style="color: var(--accent-red);">Errors (${allErrors.length})</div>`;
    for (const err of allErrors.slice(0, 8)) {
      const dot = err.project === 'kognai' ? 'kognai' : 'invoica';
      html += `<div class="log-viewer" style="max-height: 35px; margin-bottom: 3px; color: var(--accent-red); font-size: 10px;"><span class="project-dot-inline ${dot}"></span> ${escHtml(err.line || '')}</div>`;
    }
  }

  // --- Agents ---
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

// --- Panel 12: Pipeline Runs ---
async function renderPipeline() {
  const [latest, runs] = await Promise.all([
    fetchJson('/api/pipeline/latest'),
    fetchJson('/api/pipeline/runs'),
  ]);
  const panel = $('#pipeline-body');
  if (!panel) return;

  // Live Activity section (populated by SSE)
  let html = `
    <div class="section-divider" style="display:flex; align-items:center; gap:6px;">
      <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${sseConnected ? 'var(--accent-green)' : 'var(--accent-red)'}; animation:${sseConnected ? 'pulse 2s infinite' : 'none'};"></span>
      Live Swarm Activity
      <span id="live-routing-indicator" class="mono" style="font-size:10px; color:var(--text-muted); margin-left:auto;"></span>
    </div>
    <div id="live-activity" style="max-height:200px; overflow-y:auto; margin-bottom:12px;">
      <div style="font-size:11px; color:var(--text-muted); padding:6px;">Connecting...</div>
    </div>
  `;

  if (latest && !latest.error) {
    const s = latest.summary || {};
    const elapsed = ((latest.total_elapsed_ms || 0) / 1000).toFixed(1);
    const modeBadge = latest.mode === 'live'
      ? '<span class="mini-badge green">LIVE</span>'
      : '<span class="mini-badge blue">MOCK</span>';

    html += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="font-weight: 700; font-size: 13px;">Latest Run</span>
        ${modeBadge}
        <span class="mono" style="color: var(--text-muted); margin-left: auto;">${elapsed}s</span>
      </div>
    `;

    // Pipeline funnel
    const funnel = [
      { label: 'Topics', count: s.topics_found || 0 },
      { label: 'Clips', count: s.clips_discovered || 0 },
      { label: 'Qualified', count: s.clips_qualified || 0 },
      { label: 'Insights', count: s.insights_generated || 0 },
      { label: 'Scripts', count: s.scripts_produced || 0 },
      { label: 'Videos', count: s.videos_edited || 0 },
      { label: 'QC Pass', count: s.qc_passed || 0 },
      { label: 'Published', count: s.published || 0 },
    ];

    html += '<div class="pipeline-funnel">';
    for (const step of funnel) {
      html += `<div class="funnel-step"><span class="funnel-count">${step.count}</span><span class="funnel-label">${step.label}</span></div>`;
      if (step !== funnel[funnel.length - 1]) {
        html += '<span class="funnel-arrow">&rarr;</span>';
      }
    }
    html += '</div>';

    // Scorer stats (Sprint 104+, backward-compat with older reports)
    if (s.scripts_scored != null) {
      const filterRate = s.scripts_scored > 0
        ? Math.round((s.scripts_filtered / s.scripts_scored) * 100)
        : 0;
      html += `<div style="font-size:11px; color:var(--text-muted); margin:6px 0 10px; padding:4px 8px; background:var(--bg-secondary); border-radius:4px;">&#x2713; Quality scorer: ${s.scripts_scored} scored &rarr; ${s.scripts_filtered} filtered (${filterRate}% below threshold)</div>`;
    }

    // Viral status
    html += `
      <div class="stats-row" style="margin-top: 12px;">
        <div class="stat-box" style="border-left: 3px solid var(--accent-green);">
          <div class="stat-value" style="color: var(--accent-green);">${s.viral || 0}</div>
          <div class="stat-label">Viral</div>
        </div>
        <div class="stat-box" style="border-left: 3px solid var(--accent-blue);">
          <div class="stat-value" style="color: var(--accent-blue);">${s.performing || 0}</div>
          <div class="stat-label">Performing</div>
        </div>
        <div class="stat-box" style="border-left: 3px solid var(--accent-red);">
          <div class="stat-value" style="color: var(--accent-red);">${s.failure_library || 0}</div>
          <div class="stat-label">Failure</div>
        </div>
      </div>
    `;

    // Stage timings
    if (latest.stages && latest.stages.length > 0) {
      html += '<div class="section-divider">Stage Timings</div>';
      for (const st of latest.stages) {
        const statusCls = st.status === 'ok' ? 'green' : st.status === 'error' ? 'red' : 'amber';
        html += `
          <div class="pipeline-stage-row">
            <span class="mini-badge ${statusCls}">${st.status}</span>
            <span class="pipeline-stage-name">${escHtml(st.agent)}</span>
            <span class="mono pipeline-stage-count">${st.count}</span>
            <span class="mono pipeline-stage-time">${st.elapsed_ms}ms</span>
          </div>
        `;
      }
    }
  } else {
    html = '<div class="empty-state"><div class="icon">&#128640;</div>No pipeline runs yet<br><span style="font-size: 11px; color: var(--text-muted);">Run: npx ts-node agents/scs001-orchestrator/run-pipeline.ts</span></div>';
  }

  // Run history
  if (runs && runs.length > 0) {
    html += '<div class="section-divider">Run History</div>';
    for (const r of runs.slice(0, 5)) {
      const elapsed = ((r.total_elapsed_ms || 0) / 1000).toFixed(1);
      const pub = r.summary?.published || 0;
      const viral = r.summary?.viral || 0;
      html += `
        <div class="pipeline-history-row">
          <span class="mono" style="font-size: 10px;">${escHtml(r.started_at || '').substring(0, 16)}</span>
          <span class="mini-badge ${r.mode === 'live' ? 'green' : 'blue'}">${r.mode}</span>
          <span>${pub} pub</span>
          <span style="color: var(--accent-green);">${viral} viral</span>
          <span class="mono" style="color: var(--text-muted);">${elapsed}s</span>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
}

// --- Panel 13: Revenue & Blockers ---
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

// --- SSE Connection: Live Swarm Activity ---
const liveEvents = [];  // Rolling buffer of recent events
const MAX_LIVE_EVENTS = 30;

function connectSSE() {
  const dot = $('#connection-dot');
  let retryDelay = 2000;

  function connect() {
    const es = new EventSource('/api/swarm/stream');

    es.addEventListener('aar', (e) => {
      try {
        const data = JSON.parse(e.data);
        liveEvents.unshift(data);
        if (liveEvents.length > MAX_LIVE_EVENTS) liveEvents.pop();
        renderLiveActivity();
      } catch (err) { /* ignore parse errors */ }
    });

    es.addEventListener('routing', (e) => {
      try {
        const data = JSON.parse(e.data);
        // Update routing indicator if visible
        const routingEl = $('#live-routing-indicator');
        if (routingEl) {
          routingEl.textContent = `${data.model || 'unknown'} (${data._project || ''})`;
        }
      } catch (err) { /* ignore */ }
    });

    es.onopen = () => {
      sseConnected = true;
      retryDelay = 2000;
      if (dot) {
        dot.classList.remove('disconnected');
        dot.title = 'SSE: connected';
      }
    };

    es.onerror = () => {
      sseConnected = false;
      if (dot) {
        dot.classList.add('disconnected');
        dot.title = 'SSE: disconnected — retrying...';
      }
      es.close();
      setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 1.5, 30000);
    };
  }

  // Also load recent events for initial display
  fetchJson('/api/swarm/recent?limit=20').then(events => {
    if (events && Array.isArray(events)) {
      for (const e of events) liveEvents.push(e);
      renderLiveActivity();
    }
  });

  connect();
}

// --- Render Live Activity (in Pipeline panel) ---
function renderLiveActivity() {
  const panel = $('#live-activity');
  if (!panel) return;

  if (liveEvents.length === 0) {
    panel.innerHTML = '<div style="font-size:11px; color:var(--text-muted); padding:6px;">Waiting for swarm activity...</div>';
    return;
  }

  let html = '';
  for (const ev of liveEvents.slice(0, 10)) {
    const score = ev.outcomeScore || 0;
    const scoreColor = score >= 75 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-amber)' : 'var(--accent-red)';
    const projectDot = ev._project === 'invoica' ? 'invoica' : 'kognai';
    const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    const agent = ev.agentId || ev.agent_id || '?';
    const summary = (ev.actionSummary || ev.action_summary || ev.taskId || '').substring(0, 50);
    const status = ev.status || '';
    const statusBadge = status === 'APPROVED'
      ? '<span class="mini-badge green">OK</span>'
      : status === 'REJECTED'
        ? '<span class="mini-badge red">REJ</span>'
        : '<span class="mini-badge blue">RUN</span>';

    html += `
      <div class="live-event-row">
        <span class="project-dot-inline ${projectDot}"></span>
        <span class="mono" style="font-size:10px; color:var(--text-muted); min-width:52px;">${time}</span>
        ${statusBadge}
        <span style="font-size:11px; font-weight:600; color:var(--text-primary); min-width:60px;">${escHtml(agent)}</span>
        <span style="font-size:10px; color:var(--text-secondary); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(summary)}</span>
        <span style="font-size:11px; font-weight:700; color:${scoreColor};">${score > 0 ? score : ''}</span>
      </div>
    `;
  }

  if (liveEvents.length > 10) {
    html += `<div style="font-size:10px; color:var(--text-muted); padding:2px 0;">+${liveEvents.length - 10} more events</div>`;
  }

  panel.innerHTML = html;
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

// --- Panel 14: Go-Live Readiness ---
async function renderReadiness() {
  const panel = $('#readiness-body');
  if (!panel) return;
  try {
    const [r, ps] = await Promise.all([
      fetchJson('/api/readiness'),
      fetchJson('/api/pipeline/status'),
    ]);

    const pct = r.readiness_pct ?? 0;
    const pctColor = pct >= 80 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-blue)' : 'var(--accent-amber)';

    let html = `
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:12px;">
        <div style="font-size:42px; font-weight:800; color:${pctColor}; line-height:1;">${pct}%</div>
        <div>
          <div style="font-weight:700; font-size:13px;">Readiness Score</div>
          <div style="color:var(--text-muted); font-size:12px;">${r.blockers?.length ?? 0} blocker${r.blockers?.length !== 1 ? 's' : ''} remaining</div>
        </div>
      </div>
    `;

    // Env vars checklist
    html += `<div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Environment Variables</div>`;
    for (const [key, ok] of Object.entries(r.env_status ?? {})) {
      const icon = ok ? '&#10003;' : '&#10007;';
      const color = ok ? 'var(--accent-green)' : 'var(--accent-red, #e05a5a)';
      html += `<div style="display:flex; align-items:center; gap:8px; padding:3px 0; border-bottom:1px solid var(--border);">
        <span style="color:${color}; font-weight:700;">${icon}</span>
        <span class="mono" style="font-size:12px; color:${ok ? 'var(--text)' : 'var(--text-muted)'};">${escHtml(key)}</span>
      </div>`;
    }

    // Kill switch proximity
    const ks = r.kill_switch_proximity ?? {};
    html += `<div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin:12px 0 6px;">Kill Switch Targets (Phase 1.5 Gate)</div>`;
    html += `<div class="stats-row">
      <div class="stat-box"><div class="stat-value">${ks.current_views ?? 0}/${ks.views_target ?? 500}</div><div class="stat-label">Views</div></div>
      <div class="stat-box"><div class="stat-value">${ks.current_posts ?? 0}/${ks.posts_target ?? 30}</div><div class="stat-label">Posts</div></div>
      <div class="stat-box"><div class="stat-value">${ks.current_retention ?? 0}%/${ks.retention_target ?? 20}%</div><div class="stat-label">Retention</div></div>
      <div class="stat-box"><div class="stat-value">${ks.current_qc_pass ?? 0}%/${ks.qc_pass_target ?? 80}%</div><div class="stat-label">QC Pass</div></div>
    </div>`;

    // Phase 1.5 projection
    const proj = r.phase_1_5_projection ?? {};
    if (proj.posts_so_far !== undefined) {
      const gateDate = new Date('2026-04-07');
      const projDate = proj.projected_date ? new Date(proj.projected_date) : null;
      const onTrack = projDate && projDate <= gateDate;
      const tight = projDate && (projDate - gateDate) <= 3 * 86400000;
      const projColor = proj.days_to_target === 0 ? 'var(--accent-green)'
        : onTrack ? 'var(--accent-green)'
        : tight ? 'var(--accent-amber, #e0a03a)'
        : 'var(--accent-red, #e05a5a)';
      html += `<div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin:12px 0 6px;">Phase 1.5 Projection (30-post gate: Apr 7)</div>`;
      html += `<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <span style="font-size:13px; font-weight:700; color:${projColor};">${proj.posts_so_far ?? 0}/${proj.posts_target ?? 30} posts</span>
        <span style="font-size:12px; color:var(--text-muted);">avg ${proj.avg_posts_per_day ?? 0}/day</span>
        ${proj.days_to_target !== null && proj.days_to_target !== undefined
          ? `<span style="font-size:12px; color:${projColor};">${proj.days_to_target === 0 ? '✓ Target reached' : proj.days_to_target + ' days to target'}</span>`
          : '<span style="font-size:12px; color:var(--text-muted);">No live data yet</span>'}
        ${proj.projected_date ? `<span class="mini-badge" style="background:${projColor}20; color:${projColor}; border:1px solid ${projColor}40;">~${escHtml(proj.projected_date)}</span>` : ''}
      </div>`;
    }

    // Pipeline status
    const activeBadge = ps?.pipeline_active
      ? '<span class="mini-badge green">ACTIVE</span>'
      : '<span class="mini-badge amber">IDLE</span>';
    const lastRun = ps?.last_run_timestamp
      ? new Date(ps.last_run_timestamp).toLocaleString()
      : 'Never';
    html += `<div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin:12px 0 6px;">Pipeline Status</div>`;
    html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
      ${activeBadge}
      <span style="font-size:12px; color:var(--text-muted);">Last run: ${escHtml(lastRun)}</span>
    </div>`;
    html += `<div style="font-size:12px; color:var(--text-muted);">Runs today: ${ps?.runs_today ?? 0} | Total runs: ${ps?.runs_found ?? 0}</div>`;

    // Blockers
    if (r.blockers?.length > 0) {
      html += `<div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin:12px 0 6px;">Blockers</div>`;
      for (const b of r.blockers) {
        html += `<div style="padding:5px 8px; margin-bottom:4px; border-left:3px solid var(--accent-red, #e05a5a); background:rgba(224,90,90,0.07); font-size:12px; border-radius:2px;">${escHtml(b)}</div>`;
      }
    }

    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = `<div class="empty-state" style="color:var(--text-muted);">Readiness unavailable: ${escHtml(e.message)}</div>`;
  }
}

// --- Panel 15: Publish History ---
async function renderPublishHistory() {
  const panel = $('#publish-history-body');
  if (!panel) return;
  try {
    const [stats, history] = await Promise.all([
      fetch('/api/publish/stats').then(r => r.json()),
      fetch('/api/publish/history').then(r => r.json()),
    ]);

    let html = '';

    // Stats header
    const latestAt = stats.latest_published_at
      ? new Date(stats.latest_published_at).toLocaleString()
      : '—';
    html += `<div class="stats-row" style="margin-bottom:12px;">
      <div class="stat-box"><div class="stat-value">${stats.total_published ?? 0}</div><div class="stat-label">Videos Published</div></div>
      <div class="stat-box"><div class="stat-value">${stats.runs_count ?? 0}</div><div class="stat-label">Pipeline Runs</div></div>
    </div>`;
    html += `<div style="font-size:11px; color:var(--text-muted); margin-bottom:10px;">Latest run: ${escHtml(latestAt)}</div>`;

    // Table
    if (!Array.isArray(history) || history.length === 0) {
      html += `<div class="empty-state" style="color:var(--text-muted);">No published videos yet.</div>`;
    } else {
      html += `<div style="max-height:380px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border); color:var(--text-muted); text-transform:uppercase; font-size:10px;">
              <th style="text-align:left; padding:4px 6px;">Video ID</th>
              <th style="text-align:left; padding:4px 6px;">Published At</th>
              <th style="text-align:left; padding:4px 6px;">Run ID</th>
            </tr>
          </thead>
          <tbody>`;
      for (const v of history) {
        const publishedAt = v.published_at ? new Date(v.published_at).toLocaleString() : '—';
        const runShort = v.run_id ? escHtml(v.run_id.replace('scs001-', '')) : '—';
        html += `<tr style="border-bottom:1px solid var(--border);">
          <td class="mono" style="padding:4px 6px; color:var(--text);">${escHtml(v.video_id ?? v.clip_id ?? '—')}</td>
          <td style="padding:4px 6px; color:var(--text-muted);">${escHtml(publishedAt)}</td>
          <td class="mono" style="padding:4px 6px; color:var(--text-muted); font-size:10px;">${runShort}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
    }

    panel.innerHTML = html;
  } catch (e) {
    const p = $('#publish-history-body');
    if (p) p.innerHTML = `<div class="empty-state" style="color:var(--text-muted);">Publish history unavailable: ${escHtml(e.message)}</div>`;
  }
}

// --- Panel 16: Autonomous Sessions — LIVE ---
const sessionLiveLines = { kognai: [], invoica: [] };
const MAX_SESSION_LINES = 15;

async function renderSessions() {
  const panel = $('#sessions-body');
  const dots = $('#sessions-status-dots');
  if (!panel) return;

  const data = await fetchJson('/api/sessions/live');
  if (!data) {
    panel.innerHTML = '<div class="empty-state"><div class="icon">&#128274;</div>Session data unavailable</div>';
    return;
  }

  const k = data.kognai || {};
  const inv = data.invoica || {};

  // Status dots
  if (dots) {
    dots.innerHTML = `
      <span class="session-dot ${k.active ? 'active' : 'inactive'}"></span><span class="session-dot-label">Kognai Loop</span>
      <span class="session-dot ${inv.active ? 'active' : 'inactive'}"></span><span class="session-dot-label">Invoica Loop</span>
    `;
  }

  let html = '';

  // Summary stats row
  html += `<div class="stats-row" style="margin-bottom:10px;">
    <div class="stat-box">
      <div class="stat-value" style="color:${k.active ? 'var(--accent-green)' : 'var(--text-muted)'}">${k.active ? 'ACTIVE' : 'IDLE'}</div>
      <div class="stat-label">Kognai</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" style="color:${inv.active ? 'var(--accent-green)' : 'var(--text-muted)'}">${inv.active ? 'ACTIVE' : 'IDLE'}</div>
      <div class="stat-label">Invoica</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${k.runs_today || 0}</div>
      <div class="stat-label">K Runs Today</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${inv.runs_today || 0}</div>
      <div class="stat-label">I Runs Today</div>
    </div>
  </div>`;

  // Two-column git commit history
  html += `<div class="sessions-columns">`;

  // Kognai column
  html += `<div class="session-column">
    <div class="session-column-header">
      <span class="project-dot-inline kognai"></span> Kognai Commits
    </div>`;
  if (k.commits && k.commits.length > 0) {
    for (const c of k.commits.slice(0, 10)) {
      const isSprint = c.message.startsWith('Sprint');
      const isState = c.message.startsWith('state:');
      const msgClass = isSprint ? 'commit-sprint' : isState ? 'commit-state' : '';
      html += `<div class="commit-row ${msgClass}">
        <span class="commit-hash">${escHtml(c.short_hash)}</span>
        <span class="commit-msg">${escHtml(c.message.substring(0, 60))}</span>
        <span class="commit-time">${escHtml(c.time_ago)}</span>
      </div>`;
    }
  } else {
    html += `<div style="font-size:11px; color:var(--text-muted); padding:8px;">No recent commits</div>`;
  }
  html += `</div>`;

  // Invoica column
  html += `<div class="session-column">
    <div class="session-column-header">
      <span class="project-dot-inline invoica"></span> Invoica Commits
    </div>`;
  if (inv.commits && inv.commits.length > 0) {
    for (const c of inv.commits.slice(0, 10)) {
      const isSprint = c.message.startsWith('Sprint');
      const isState = c.message.startsWith('state:');
      const msgClass = isSprint ? 'commit-sprint' : isState ? 'commit-state' : '';
      html += `<div class="commit-row ${msgClass}">
        <span class="commit-hash">${escHtml(c.short_hash)}</span>
        <span class="commit-msg">${escHtml(c.message.substring(0, 60))}</span>
        <span class="commit-time">${escHtml(c.time_ago)}</span>
      </div>`;
    }
  } else {
    html += `<div style="font-size:11px; color:var(--text-muted); padding:8px;">No recent commits</div>`;
  }
  html += `</div>`;

  html += `</div>`; // close sessions-columns

  // Session info footer
  html += `<div class="sessions-footer">`;
  if (k.latest) {
    html += `<div class="session-info">
      <span class="mono" style="font-size:10px;">${escHtml(k.latest.file)}</span>
      <span style="font-size:10px; color:var(--text-muted);">${k.latest.size > 0 ? (k.latest.size / 1024).toFixed(1) + 'KB' : '0B'} · ${escHtml(k.latest.mtime_ago)}</span>
      ${k.latest.last_sprint ? `<span class="mini-badge blue" style="font-size:9px;">${escHtml(k.latest.last_sprint)}</span>` : ''}
    </div>`;
  }
  if (inv.latest) {
    html += `<div class="session-info">
      <span class="mono" style="font-size:10px;">${escHtml(inv.latest.file)}</span>
      <span style="font-size:10px; color:var(--text-muted);">${inv.latest.size > 0 ? (inv.latest.size / 1024).toFixed(1) + 'KB' : '0B'} · ${escHtml(inv.latest.mtime_ago)}</span>
      ${inv.latest.last_sprint ? `<span class="mini-badge blue" style="font-size:9px;">${escHtml(inv.latest.last_sprint)}</span>` : ''}
    </div>`;
  }
  html += `<div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Total sessions: K=${k.total_sessions || 0} · I=${inv.total_sessions || 0}</div>`;
  html += `</div>`;

  // Live session output (populated by SSE)
  html += `<div id="session-live-output" class="session-live-output"></div>`;

  panel.innerHTML = html;
}

// --- Session SSE: live terminal output ---
function connectSessionSSE() {
  let retryDelay = 3000;

  function connect() {
    const es = new EventSource('/api/sessions/stream');

    es.addEventListener('session', (e) => {
      try {
        const data = JSON.parse(e.data);
        const project = data.project || 'unknown';
        const line = data.line || '';
        if (!line || line.length < 2) return;

        // Skip ANSI control sequences and empty lines
        const clean = line.replace(/\x1b\[[0-9;]*[mKGHJ]/g, '').trim();
        if (!clean || clean.startsWith('[?') || clean.startsWith(']')) return;

        if (!sessionLiveLines[project]) sessionLiveLines[project] = [];
        sessionLiveLines[project].unshift(clean);
        if (sessionLiveLines[project].length > MAX_SESSION_LINES) sessionLiveLines[project].pop();

        renderSessionLiveOutput();
      } catch (err) { /* ignore */ }
    });

    es.onopen = () => { retryDelay = 3000; };
    es.onerror = () => {
      es.close();
      setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 1.5, 30000);
    };
  }

  connect();
}

function renderSessionLiveOutput() {
  const panel = $('#session-live-output');
  if (!panel) return;

  const kLines = sessionLiveLines.kognai || [];
  const iLines = sessionLiveLines.invoica || [];

  if (kLines.length === 0 && iLines.length === 0) return;

  let html = '<div class="session-column-header" style="margin-top:8px;">Live Output</div>';
  html += '<div class="session-live-lines">';

  // Interleave last few lines from both
  const all = [];
  for (const l of kLines.slice(0, 5)) all.push({ project: 'kognai', line: l });
  for (const l of iLines.slice(0, 5)) all.push({ project: 'invoica', line: l });

  for (const item of all) {
    html += `<div class="session-live-line">
      <span class="project-dot-inline ${item.project}"></span>
      <span class="session-line-text">${escHtml(item.line.substring(0, 120))}</span>
    </div>`;
  }
  html += '</div>';
  panel.innerHTML = html;
}

// --- Panel 17: Experiments & Validation ---
async function renderExperiments() {
  const panel = $('#experiments-body');
  if (!panel) return;
  try {
    const [stats, valSum] = await Promise.all([
      fetch('/api/experiments/stats').then(r => r.json()),
      fetch('/api/validation/summary').then(r => r.json()),
    ]);

    let html = '';

    // Header stats
    html += `<div class="stats-row" style="margin-bottom:12px;">
      <div class="stat-box"><div class="stat-value">${stats.total_logged ?? 0}</div><div class="stat-label">Experiments</div></div>
      <div class="stat-box"><div class="stat-value">${stats.unique_formulas ?? 0}</div><div class="stat-label">Formulas</div></div>
      <div class="stat-box"><div class="stat-value">${valSum.total_errors ?? 0}</div><div class="stat-label">Validation Errors</div></div>
    </div>`;

    // Formula pass-rate bars
    const formulas = stats.top_formulas ?? [];
    if (formulas.length > 0) {
      html += `<div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Hook Formula Pass Rates</div>`;
      for (const f of formulas) {
        const pct = Math.round((f.pass_rate ?? 0) * 100);
        const filled = Math.round(pct / 5);
        const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
        const color = pct >= 80 ? 'var(--accent-green)' : pct >= 50 ? 'var(--accent-amber, #e0a03a)' : 'var(--text-muted)';
        html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <span class="mono" style="font-size:11px; width:110px; color:var(--text); flex-shrink:0;">${escHtml(f.formula)}</span>
          <span class="mono" style="font-size:10px; color:${color}; letter-spacing:-1px;">${bar}</span>
          <span style="font-size:11px; color:${color}; font-weight:700;">${pct}%</span>
          <span style="font-size:10px; color:var(--text-muted);">(${f.passed}/${f.count})</span>
        </div>`;
      }
    } else {
      html += `<div class="empty-state" style="color:var(--text-muted); font-size:11px;">No experiment data yet — run the pipeline to accumulate formula stats.</div>`;
    }

    // Top speakers
    const speakers = stats.top_speakers ?? [];
    if (speakers.length > 0) {
      html += `<div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin:10px 0 6px;">Top Speakers by QC Pass Rate</div>`;
      html += `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">`;
      for (const s of speakers.slice(0, 5)) {
        const pct = Math.round((s.pass_rate ?? 0) * 100);
        const col = pct >= 80 ? 'var(--accent-green)' : pct >= 50 ? 'var(--accent-amber, #e0a03a)' : 'var(--text-muted)';
        html += `<div style="padding:3px 8px; border:1px solid var(--border); border-radius:3px; font-size:11px;">
          <span style="color:var(--text);">${escHtml(s.speaker)}</span>
          <span style="color:${col}; margin-left:4px; font-weight:700;">${pct}%</span>
          <span style="color:var(--text-muted); font-size:10px;"> (${s.count})</span>
        </div>`;
      }
      html += `</div>`;
    }

    // Validation error reasons
    const reasons = valSum.top_reasons ?? [];
    if (reasons.length > 0) {
      html += `<div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin:6px 0 6px;">Top Validation Failure Reasons</div>`;
      for (const r of reasons) {
        html += `<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border); font-size:12px;">
          <span style="color:var(--text);">${escHtml(r.reason)}</span>
          <span class="mini-badge amber" style="font-size:10px;">${r.count}</span>
        </div>`;
      }
    }

    panel.innerHTML = html;
  } catch (e) {
    const p = $('#experiments-body');
    if (p) p.innerHTML = `<div class="empty-state" style="color:var(--text-muted);">Experiments unavailable: ${escHtml(e.message)}</div>`;
  }
}

// --- All render functions ---
const ALL_RENDERERS = [
  renderProgress, renderTodo, renderOverview, renderSCS001,
  renderCosts, renderRouting, renderAmendments, renderChain,
  renderSecurity, renderAssets, renderLogs, renderPipeline, renderRevenue,
  renderReadiness, renderPublishHistory, renderSessions, renderExperiments,
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
  connectSessionSSE();

  // Full refresh every 60s
  setInterval(() => {
    ALL_RENDERERS.forEach(fn => fn());
  }, 60000);
}

document.addEventListener('DOMContentLoaded', init);
