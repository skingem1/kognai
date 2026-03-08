/**
 * Vault Dashboard — Dual-Project Frontend
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

// --- Panel Renderers ---

async function renderProgress() {
  const [kCurrent, kList, iCurrent, iList, iStats, phases] = await Promise.all([
    fetchJson('/api/sprint/current'),
    fetchJson('/api/sprint/list'),
    fetchJson('/api/invoica/sprint/current'),
    fetchJson('/api/invoica/sprint/list'),
    fetchJson('/api/invoica/stats'),
    fetchJson('/api/phases'),
  ]);

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
    html += `<span class="project-stats">${iStats.total_completed || 0} tasks · ${iStats.approval_rate || 0}% rate · ${iStats.total_sprints || 0} sprints</span>`;
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

  // Kognai sprints
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

  // Invoica sprints
  if (iList && iList.length > 0) {
    html += '<div style="font-size: 10px; color: var(--accent-green); margin-bottom: 4px; margin-top: 8px; font-weight: 600;">INVOICA</div>';
    const recent = iList.slice(0, 4);
    for (const s of recent) {
      const rateStr = s.approval_rate ? ` · ${s.approval_rate}%` : '';
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

async function renderTodo() {
  const [brief, gates] = await Promise.all([
    fetchJson('/api/tasks/today'),
    fetchJson('/api/gates'),
  ]);

  const panel = $('#todo-body');
  if (!panel) return;

  let html = '';

  if (brief && !brief.error) {
    // Date header
    if (brief.date) {
      const d = new Date(brief.date + 'T00:00:00');
      const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      html += `<div class="todo-date">${dateStr}</div>`;
    }

    // Stats row
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

    // Time blocks
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
        const icon = t.disabled ? '—' : t.deferred ? '⏭️' : (t.done ? '✅' : '⬜');
        const clickable = (t.disabled || t.deferred) ? '' : `onclick="toggleTask('${block}', ${idx})"`;
        const deferBtn = (!t.disabled && !t.done && !t.deferred)
          ? `<button class="defer-btn" onclick="event.stopPropagation(); deferTask('${block}', ${idx})" title="Defer to tomorrow">→</button>`
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
    html += `<div class="empty-state"><div class="icon">📝</div>${escHtml(msg)}</div>`;
  }

  // Gates
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

    // Tier distribution bar
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

      // Local vs cloud percentage
      html += `
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 12px;">
          <span style="color: var(--accent-green);">${costs.local_pct || 0}% local</span>
          <span style="color: var(--accent-amber);">${costs.cloud_pct || 0}% cloud</span>
        </div>
      `;

      // Tier breakdown
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
        html += `<div class="empty-state"><div class="icon">📊</div>${escHtml(costs.message)}</div>`;
      }
    }

    // Budget bar
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
    html += '<div class="empty-state"><div class="icon">💰</div>Cost data unavailable</div>';
  }

  panel.innerHTML = html;
}

async function renderLogs() {
  const [logs, kAgents, iAgents] = await Promise.all([
    fetchJson('/api/logs/latest'),
    fetchJson('/api/agents'),
    fetchJson('/api/invoica/agents'),
  ]);

  const panel = $('#logs-body');
  if (!panel) return;

  let html = '';

  // Log summary
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

  // Log viewer
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
    html += '<div class="empty-state"><div class="icon">📋</div>No sprint logs yet</div>';
  }

  // Errors
  if (logs && logs.errors && logs.errors.length > 0) {
    html += `<div class="section-divider">Errors (${logs.errors.length})</div>`;
    for (const err of logs.errors.slice(0, 10)) {
      html += `<div class="log-viewer" style="max-height: 40px; margin-bottom: 4px; color: var(--accent-red); font-size: 11px;">${escHtml(err.line)}</div>`;
    }
  }

  // --- Agents: Both projects ---
  const kCount = (kAgents && kAgents.length) || 0;
  const iCount = (iAgents && iAgents.length) || 0;

  html += `<div class="section-divider">Agents (${kCount + iCount})</div>`;

  // Kognai agents
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

  // Invoica agents
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
  const evtSource = new EventSource('/api/stream');

  evtSource.onopen = () => {
    sseConnected = true;
    if (dot) dot.classList.remove('disconnected');
  };

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'update') {
        const sources = data.sources || [];
        // Kognai updates
        if (sources.includes('sprints') || sources.includes('strategic')) renderProgress();
        if (sources.includes('brief') || sources.includes('gates')) renderTodo();
        if (sources.includes('logs')) renderLogs();
        // Invoica updates
        if (sources.includes('invoica_sprints')) renderProgress();
        if (sources.includes('invoica_agents')) renderLogs();
        // Shared infra update refreshes everything
        if (sources.includes('shared_infra')) refreshAll();
      }
    } catch (e) {
      // Heartbeat or parse error — ignore
    }
  };

  evtSource.onerror = () => {
    sseConnected = false;
    if (dot) dot.classList.add('disconnected');
    // EventSource auto-reconnects
  };
}

// --- Toggle Task Checkbox ---
async function toggleTask(block, index) {
  try {
    const res = await fetch('/api/tasks/toggle', {
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
    const res = await fetch('/api/tasks/defer', {
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

// --- Manual Refresh ---
async function refreshAll() {
  const btn = $('#refresh-btn');
  if (btn) btn.classList.add('spinning');
  await Promise.all([renderProgress(), renderTodo(), renderCosts(), renderLogs()]);
  if (btn) setTimeout(() => btn.classList.remove('spinning'), 600);
}

// --- Init ---
async function init() {
  // Render all panels
  await Promise.all([
    renderProgress(),
    renderTodo(),
    renderCosts(),
    renderLogs(),
  ]);

  // Start clock
  updateClock();
  setInterval(updateClock, 1000);

  // Connect SSE for auto-refresh
  connectSSE();

  // Fallback: full refresh every 60s
  setInterval(() => {
    renderProgress();
    renderTodo();
    renderCosts();
    renderLogs();
  }, 60000);
}

// Go
document.addEventListener('DOMContentLoaded', init);
