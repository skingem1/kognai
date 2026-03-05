#!/usr/bin/env ts-node

/**
 * Invoica CTO Tech Watch Runner
 *
 * Standalone script that runs CTO intelligence gathering OUTSIDE of sprints.
 * Monitors OpenClaw GitHub, ClawHub skills, and project learnings/bug patterns.
 * Uses MiniMax M2.5 for analysis (same as CTO in orchestrator).
 *
 * Usage:
 *   npx ts-node scripts/run-cto-techwatch.ts <watch-type> [additional-context]
 *
 * Watch types:
 *   openclaw-watch         - Check OpenClaw GitHub for new releases, features, updates
 *   clawhub-scan           - Scan ClawHub for relevant skills and MCP servers
 *   learnings-review       - Analyze docs/learnings.md for patterns, propose improvements
 *   verify-implementations - Check CEO-approved proposals were properly implemented
 *   post-sprint-analysis   - Post-sprint retrospective: analyze results, detect patterns, propose improvements
 *   full-scan              - Run all watches and produce a combined report
 *
 * Data Sources:
 *   - OpenClaw GitHub releases API
 *   - npm registry (openclaw package)
 *   - docs/learnings.md (project learnings)
 *   - reports/grok-feed/ (Grok AI X/Twitter intelligence on OpenClaw ecosystem)
 *   - reports/cto/ceo-feedback/ (CEO decisions on previous proposals)
 *   - reports/cto/approved-proposals.json (implementation tracking)
 *
 * Schedule: Daily 10AM CET via PM2 cron (ecosystem.config.js)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn } from 'child_process';
import 'dotenv/config';

// ── Cron guard: prevent PM2 reload from triggering this script off-schedule ──
(function checkCronGuard() {
  const _guardFile = require('path').join(process.cwd(), 'logs', 'cron-guard-cto-daily-scan.json');
  const _minMs = 23 * 60 * 60 * 1000;
  try {
    const _last = require('fs').existsSync(_guardFile)
      ? JSON.parse(require('fs').readFileSync(_guardFile, 'utf-8')).lastRun
      : 0;
    if (Date.now() - new Date(_last).getTime() < _minMs) {
      const _ago = Math.round((Date.now() - new Date(_last).getTime()) / 3600000);
      console.log(`[CronGuard] cto-daily-scan: last run ${_ago}h ago (min interval 23h) — skipping`);
      process.exit(0);
    }
  } catch { /* first run or stale guard */ }
  // Update last-run timestamp
  try {
    require('fs').writeFileSync(_guardFile, JSON.stringify({ lastRun: new Date().toISOString() }));
  } catch { /* non-fatal */ }
})();


// ===== Types =====

type WatchType = 'openclaw-watch' | 'clawhub-scan' | 'learnings-review' | 'verify-implementations' | 'post-sprint-analysis' | 'full-scan';

const VALID_WATCHES: WatchType[] = ['openclaw-watch', 'clawhub-scan', 'learnings-review', 'verify-implementations', 'post-sprint-analysis', 'full-scan'];

interface LLMResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { total_tokens: number };
  base_resp?: { status_code: number; status_msg: string };
}

interface TechWatchReport {
  watchType: WatchType;
  date: string;
  findings: string;
  recommendations: string[];
  tokensUsed: number;
  durationMs: number;
}

// ===== Colors =====

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function log(color: string, msg: string) {
  console.log(color + msg + c.reset);
}

// ===== HTTP Helpers =====

function httpPost(url: string, headers: Record<string, string>, body: string, timeoutMs: number = 300000): Promise<any> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: parsed.hostname, port: parsed.port || (isHttps ? 443 : undefined),
      path: parsed.pathname, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Failed to parse LLM response: ' + data.substring(0, 500))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('LLM request timeout')); });
    req.write(body);
    req.end();
  });
}

function httpGet(url: string, headers: Record<string, string> = {}, timeoutMs: number = 30000): Promise<any> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: parsed.hostname, port: parsed.port || (isHttps ? 443 : undefined),
      path: parsed.pathname + parsed.search, method: 'GET',
      headers: { ...headers, 'User-Agent': 'Invoica-CTO-TechWatch/1.0' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('HTTP GET timeout: ' + url)); });
    req.end();
  });
}

async function callMiniMax(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  const apiKey = process.env.MINIMAX_API_KEY || '';
  if (!apiKey) throw new Error('MINIMAX_API_KEY not set in .env');
  const body = JSON.stringify({
    model: 'MiniMax-M2.5',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 8000,
  });
  return httpPost('https://api.minimax.io/v1/chat/completions', {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + apiKey,
  }, body, 120000);
}

// ===== Data Collectors =====

class DataCollector {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /** Read docs/learnings.md */
  getLearnings(): string {
    const path = join(this.projectRoot, 'docs/learnings.md');
    if (!existsSync(path)) return '(no learnings file found)';
    return readFileSync(path, 'utf-8');
  }

  /** Read the current OpenClaw version from package.json or system */
  getCurrentOpenClawVersion(): string {
    try {
      const pkgPath = join(this.projectRoot, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.dependencies?.openclaw) return pkg.dependencies.openclaw;
      }
    } catch { /* ignore */ }
    return 'v2026.2.12'; // known from MEMORY.md
  }

  /** Get recent sprint results */
  getSprintResults(): string {
    const sprintsDir = join(this.projectRoot, 'sprints');
    if (!existsSync(sprintsDir)) return '(no sprints directory)';
    const files = readdirSync(sprintsDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 3);
    const sections: string[] = [];
    for (const file of files) {
      try {
        const content = JSON.parse(readFileSync(join(sprintsDir, file), 'utf-8'));
        const tasks = content.tasks || [];
        const approved = tasks.filter((t: any) => t.status === 'approved').length;
        const failed = tasks.filter((t: any) => t.status === 'failed').length;
        sections.push(`**${file}**: ${approved}/${tasks.length} approved, ${failed} failed`);
        // Include failed task details
        for (const t of tasks.filter((t: any) => t.status === 'failed')) {
          sections.push(`  - FAILED: ${t.id} — ${t.title} (${t.attempts || '?'} attempts)`);
        }
      } catch { sections.push(`**${file}**: (could not parse)`); }
    }
    return sections.join('\n');
  }

  /** List all agents */
  getAgentList(): string {
    const agentsDir = join(this.projectRoot, 'agents');
    if (!existsSync(agentsDir)) return '(no agents directory)';
    const dirs = readdirSync(agentsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    const agents: string[] = [];
    for (const dir of dirs) {
      const yamlPath = join(agentsDir, dir.name, 'agent.yaml');
      if (existsSync(yamlPath)) {
        const content = readFileSync(yamlPath, 'utf-8');
        const roleMatch = content.match(/role:\s*(.+)/);
        const llmMatch = content.match(/llm:\s*(.+)/);
        agents.push(`- **${dir.name}**: ${roleMatch?.[1] || 'unknown'} (${llmMatch?.[1] || 'unknown'})`);
      }
    }
    return agents.join('\n');
  }

  /** Get recent daily reports */
  getRecentDailyReports(count: number = 3): string {
    const reportsDir = join(this.projectRoot, 'reports/daily');
    if (!existsSync(reportsDir)) return '(no daily reports)';
    const files = readdirSync(reportsDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, count);
    const sections: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(reportsDir, file), 'utf-8');
      // Just include first 500 chars of each report
      sections.push(`### ${file}\n${content.substring(0, 500)}...`);
    }
    return sections.join('\n\n');
  }

  /** Get existing CTO reports for context */
  getRecentCTOReports(count: number = 3): string {
    const reportsDir = join(this.projectRoot, 'reports/cto');
    if (!existsSync(reportsDir)) return '(no previous CTO reports)';
    const files = readdirSync(reportsDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, count);
    if (files.length === 0) return '(no previous CTO reports)';
    const sections: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(reportsDir, file), 'utf-8');
      sections.push(`### ${file}\n${content.substring(0, 800)}`);
    }
    return sections.join('\n\n');
  }

  /** Read Grok intelligence feed from reports/grok-feed/ */
  getGrokFeed(count: number = 5): string {
    const feedDir = join(this.projectRoot, 'reports/grok-feed');
    if (!existsSync(feedDir)) return '(no Grok feed directory)';
    const files = readdirSync(feedDir)
      .filter(f => f.endsWith('.md') && f !== '.gitkeep')
      .sort()
      .reverse()
      .slice(0, count);
    if (files.length === 0) return '(no Grok reports available yet — user drops them into reports/grok-feed/)';
    const sections: string[] = [];
    let totalChars = 0;
    for (const file of files) {
      const content = readFileSync(join(feedDir, file), 'utf-8');
      if (totalChars + content.length > 3000) {
        sections.push(`### ${file}\n${content.substring(0, 3000 - totalChars)}... (truncated)`);
        break;
      }
      sections.push(`### ${file}\n${content}`);
      totalChars += content.length;
    }
    return sections.join('\n\n');
  }

  /** Read CEO feedback on previous CTO proposals */
  getCEOFeedback(count: number = 3): string {
    const feedbackDir = join(this.projectRoot, 'reports/cto/ceo-feedback');
    if (!existsSync(feedbackDir)) return '(no CEO feedback yet)';
    const files = readdirSync(feedbackDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, count);
    if (files.length === 0) return '(no CEO feedback yet)';
    const sections: string[] = [];
    for (const file of files) {
      try {
        const content = readFileSync(join(feedbackDir, file), 'utf-8');
        const feedback = JSON.parse(content);
        const decisions = Array.isArray(feedback) ? feedback : (feedback.decisions || [feedback]);
        for (const d of decisions) {
          sections.push(`- **${d.proposal_id || 'unknown'}**: ${d.decision || 'unknown'} — ${d.reasoning || 'no reasoning'}`);
        }
      } catch { sections.push(`- ${file}: (could not parse)`); }
    }
    return sections.join('\n');
  }

  /** Read approved proposals tracker */
  getApprovedProposals(): string {
    const trackerPath = join(this.projectRoot, 'reports/cto/approved-proposals.json');
    if (!existsSync(trackerPath)) return '(no approved proposals tracker)';
    try {
      const content = JSON.parse(readFileSync(trackerPath, 'utf-8'));
      const proposals = content.proposals || [];
      if (proposals.length === 0) return '(no approved proposals yet)';
      return proposals.map((p: any) =>
        `- **${p.id}**: ${p.title} — status: ${p.implementation_status || 'unknown'}${p.verification_notes ? ' (' + p.verification_notes + ')' : ''}`
      ).join('\n');
    } catch { return '(could not parse approved-proposals.json)'; }
  }

  /** Get detailed analysis of the most recent sprint (full task data for post-sprint review) */
  getLatestSprintDetails(): string {
    const sprintsDir = join(this.projectRoot, 'sprints');
    if (!existsSync(sprintsDir)) return '(no sprints directory)';
    const files = readdirSync(sprintsDir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) return '(no sprint files found)';
    try {
      const latestFile = files[0];
      const content = JSON.parse(readFileSync(join(sprintsDir, latestFile), 'utf-8'));
      const tasks = content.tasks || [];
      const done = tasks.filter((t: any) => t.status === 'done').length;
      const doneManual = tasks.filter((t: any) => t.status === 'done-manual').length;
      const rejected = tasks.filter((t: any) => t.status === 'rejected').length;
      const sections: string[] = [
        `### ${latestFile.replace('.json', '')} — Detailed Sprint Results`,
        `- **Total tasks**: ${tasks.length}`,
        `- **Auto-approved**: ${done}`,
        `- **Manual fixes needed**: ${doneManual}`,
        `- **Still rejected**: ${rejected}`,
        `- **Auto success rate**: ${tasks.length > 0 ? ((done / tasks.length) * 100).toFixed(0) : 0}%`,
        '',
      ];
      for (const t of tasks) {
        const status = t.status || 'unknown';
        const agent = t.agent || 'unknown';
        const attempts = t.output?.attempts || t.attempts || '?';
        const score = t.output?.review?.score || t.output?.score || '?';
        const feedback = t.output?.review?.feedback || t.output?.feedback || '';
        const rejectionReasons = t.output?.rejectionReasons || [];
        sections.push(`**${t.id}** (${agent}) — ${t.title || t.description || 'no title'}`);
        sections.push(`  Status: ${status} | Score: ${score} | Attempts: ${attempts}`);
        if (status === 'done-manual' || status === 'rejected') {
          sections.push(`  ⚠ Required manual intervention or failed`);
          if (rejectionReasons.length > 0) {
            sections.push(`  Rejection reasons: ${rejectionReasons.slice(0, 3).join('; ')}`);
          }
          if (feedback) {
            sections.push(`  Last feedback: ${String(feedback).substring(0, 300)}`);
          }
        }
        sections.push('');
      }
      // Also include previous sprint for trend comparison
      if (files.length > 1) {
        const prevFile = files[1];
        const prevContent = JSON.parse(readFileSync(join(sprintsDir, prevFile), 'utf-8'));
        const prevTasks = prevContent.tasks || [];
        const prevDone = prevTasks.filter((t: any) => t.status === 'done').length;
        const prevManual = prevTasks.filter((t: any) => t.status === 'done-manual').length;
        sections.push(`### Previous Sprint (${prevFile.replace('.json', '')}) — Trend Comparison`);
        sections.push(`- Total: ${prevTasks.length}, Auto: ${prevDone}, Manual: ${prevManual}`);
        sections.push(`- Auto success rate: ${prevTasks.length > 0 ? ((prevDone / prevTasks.length) * 100).toFixed(0) : 0}%`);
        sections.push('');
      }
      return sections.join('\n');
    } catch (e: any) { return `(error reading sprint details: ${e.message})`; }
  }

  /** Fetch OpenClaw GitHub releases */
  async fetchOpenClawReleases(): Promise<string> {
    try {
      log(c.gray, '  Fetching OpenClaw GitHub releases...');
      const data = await httpGet(
        'https://api.github.com/repos/openclaw/openclaw/releases?per_page=5',
        { Accept: 'application/vnd.github.v3+json' }
      );
      if (Array.isArray(data) && data.length > 0) {
        return data.map((r: any) => `- **${r.tag_name}** (${r.published_at?.split('T')[0] || 'unknown'}): ${(r.body || 'No release notes').substring(0, 300)}`).join('\n');
      }
      if (data.message) return '(GitHub API: ' + data.message + ')';
      return '(no releases found or API unavailable)';
    } catch (err: any) {
      log(c.yellow, '  ! GitHub API error: ' + err.message);
      return '(GitHub API unavailable: ' + err.message + ')';
    }
  }

  /** Fetch OpenClaw npm package info */
  async fetchOpenClawNpmInfo(): Promise<string> {
    try {
      log(c.gray, '  Fetching OpenClaw npm package info...');
      const data = await httpGet('https://registry.npmjs.org/openclaw/latest');
      if (data.version) {
        return `Latest npm version: ${data.version}\nDescription: ${data.description || 'N/A'}`;
      }
      return '(npm package info unavailable)';
    } catch (err: any) {
      return '(npm registry unavailable: ' + err.message + ')';
    }
  }

  /** Fetch Conway-Research GitHub repos (strategic developer to watch) */
  async fetchConwayResearchRepos(): Promise<string> {
    try {
      log(c.gray, '  Fetching Conway-Research GitHub repos...');
      const data = await httpGet(
        'https://api.github.com/users/Conway-Research/repos?sort=updated&per_page=10',
        { Accept: 'application/vnd.github.v3+json' }
      );
      if (Array.isArray(data) && data.length > 0) {
        return data.map((r: any) =>
          `- **${r.name}** (${r.language || 'unknown'}, ★${r.stargazers_count || 0}, updated: ${r.updated_at?.split('T')[0] || 'unknown'}): ${(r.description || 'No description').substring(0, 200)}`
        ).join('\n');
      }
      if (data.message) return '(GitHub API: ' + data.message + ')';
      return '(no repos found)';
    } catch (err: any) {
      log(c.yellow, '  ! Conway-Research GitHub error: ' + err.message);
      return '(GitHub API unavailable: ' + err.message + ')';
    }
  }
}

// ===== CTO Tech Watch Runner =====

class CTOTechWatch {
  private projectRoot: string;
  private reportsDir: string;
  private collector: DataCollector;
  private ctoPrompt: string;

  constructor() {
    this.projectRoot = join(__dirname, '..');
    this.reportsDir = join(this.projectRoot, 'reports/cto');
    mkdirSync(this.reportsDir, { recursive: true });
    this.collector = new DataCollector(this.projectRoot);

    // Load CTO system prompt
    const promptPath = join(this.projectRoot, 'agents/cto/prompt.md');
    this.ctoPrompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8') : 'You are the CTO of Invoica.';

    log(c.cyan, '\n' + '='.repeat(60));
    log(c.cyan, '  Invoica CTO Tech Watch (MiniMax M2.5)');
    log(c.cyan, '='.repeat(60));
  }

  async run(watchType: WatchType, additionalContext?: string): Promise<string> {
    const startTime = Date.now();
    log(c.blue, '\n[cto-watch] Starting: ' + watchType);

    if (watchType === 'full-scan') {
      return this.runFullScan(additionalContext);
    }

    // Build context + task-specific prompt
    const { systemPrompt, userPrompt } = await this.buildPrompts(watchType, additionalContext);
    log(c.gray, '  System prompt: ' + systemPrompt.length + ' chars');
    log(c.gray, '  User prompt: ' + userPrompt.length + ' chars');

    // Call MiniMax
    log(c.blue, '[cto-watch] Calling MiniMax M2.5...');
    const response = await callMiniMax(systemPrompt, userPrompt);
    const content = response.choices?.[0]?.message?.content || '';
    const tokens = response.usage?.total_tokens || 0;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!content) {
      log(c.red, '  ! Empty response from MiniMax');
      throw new Error('Empty response from CTO analysis');
    }

    log(c.green, '  Analysis complete (' + elapsed + 's, ' + tokens + ' tokens)');

    // Save report
    const reportPath = this.saveReport(watchType, content);
    this.updateLatestReport(watchType, reportPath);

    log(c.green, '[cto-watch] Report saved: ' + reportPath);
    return reportPath;
  }

  private async runFullScan(additionalContext?: string): Promise<string> {
    log(c.blue, '\n[cto-watch] Running full scan (all five watches)...\n');
    const reports: string[] = [];
    const types: WatchType[] = ['openclaw-watch', 'clawhub-scan', 'learnings-review', 'verify-implementations', 'post-sprint-analysis'];

    for (const watchType of types) {
      try {
        const reportPath = await this.run(watchType, additionalContext);
        const content = readFileSync(reportPath, 'utf-8');
        reports.push('## ' + watchType.toUpperCase() + '\n\n' + content);
        log(c.green, '  ✓ ' + watchType + ' complete\n');
      } catch (err: any) {
        log(c.yellow, '  ! ' + watchType + ' failed: ' + err.message);
        reports.push('## ' + watchType.toUpperCase() + '\n\n(Failed: ' + err.message + ')');
      }
    }

    // Combine into full report
    const combined = '# CTO Full Tech Watch — ' + new Date().toISOString().split('T')[0] + '\n\n' + reports.join('\n\n---\n\n');
    const reportPath = this.saveReport('full-scan', combined);
    this.updateLatestReport('full-scan', reportPath);

    log(c.green, '\n[cto-watch] Full scan complete: ' + reportPath);
    return reportPath;
  }

  private async buildPrompts(watchType: WatchType, additionalContext?: string): Promise<{ systemPrompt: string; userPrompt: string }> {
    const today = new Date().toISOString().split('T')[0];
    const currentVersion = this.collector.getCurrentOpenClawVersion();

    // Common project context
    const projectContext = [
      '## Current Project State',
      '- **Date**: ' + today,
      '- **OpenClaw version**: ' + currentVersion,
      '- **Agents**: ' + this.collector.getAgentList(),
      '',
      '## Recent Sprint Results',
      this.collector.getSprintResults(),
      '',
      '## Previous CTO Reports',
      this.collector.getRecentCTOReports(2),
      '',
      '## Grok Intelligence Feed (OpenClaw Community Signals from X/Twitter)',
      '(Grok AI monitors X/Twitter for posts about new tools, skills, and features for OpenClaw agents)',
      this.collector.getGrokFeed(5),
      '',
      '## Previous CEO Feedback on CTO Proposals',
      this.collector.getCEOFeedback(3),
      '',
      '## Approved Proposals — Implementation Status',
      this.collector.getApprovedProposals(),
    ].join('\n');

    const prompts: Record<Exclude<WatchType, 'full-scan'>, { system: string; user: string }> = {
      'verify-implementations': {
        system: this.ctoPrompt,
        user: [
          '# CTO Task: Verify Implementation of Approved Proposals',
          '',
          'You are running OUTSIDE of a sprint. Check that CEO-approved proposals have been properly implemented.',
          '',
          projectContext,
          '',
          '## Your Task',
          'Review the approved proposals listed above and verify their implementation status.',
          '',
          'For each proposal with status "pending" or "in_progress":',
          '1. **Check implementation_steps**: Were all steps completed?',
          '2. **Look for evidence**: Check if referenced files/configs were changed (based on sprint results and learnings)',
          '3. **Assess quality**: Was the implementation done correctly or just superficially?',
          '4. **Update status**: Set to "verified" (done correctly), "partial" (some steps done), or "not_started"',
          '',
          'Output a JSON object:',
          '```json',
          '{',
          '  "verifications": [',
          '    {',
          '      "proposal_id": "CTO-YYYYMMDD-NNN",',
          '      "previous_status": "pending",',
          '      "new_status": "verified | partial | not_started",',
          '      "evidence": "What you found that confirms/denies implementation",',
          '      "notes": "Any issues or follow-up needed"',
          '    }',
          '  ],',
          '  "summary": "Overall implementation verification status"',
          '}',
          '```',
          '',
          'If there are no pending proposals, report that all is clear.',
          additionalContext ? '\n## Additional Context\n' + additionalContext : '',
        ].join('\n'),
      },

      'openclaw-watch': {
        system: this.ctoPrompt,
        user: [
          '# CTO Task: OpenClaw Ecosystem Watch',
          '',
          'You are running OUTSIDE of a sprint. Your job is to check for OpenClaw/ClawHub updates that could benefit Invoica.',
          '',
          projectContext,
          '',
          '## OpenClaw GitHub Releases',
          await this.collector.fetchOpenClawReleases(),
          '',
          '## OpenClaw npm Info',
          await this.collector.fetchOpenClawNpmInfo(),
          '',
          '## Conway-Research GitHub (Strategic Developer Watch)',
          await this.collector.fetchConwayResearchRepos(),
          '',
          '## Your Task',
          'Analyze the OpenClaw ecosystem data above and report:',
          '1. **Version Status**: Are we on the latest? Any critical updates we\'re missing?',
          '2. **New Features**: Any new capabilities (models, routing, gateway features) that could improve our pipeline?',
          '3. **Cost Optimizations**: Any pricing changes, caching features, or batch APIs that could reduce our costs?',
          '4. **Security Advisories**: Any patches or security updates we need to apply?',
          '5. **Breaking Changes**: Anything that would break our current v2026.2.12 setup if we upgraded?',
          '6. **Conway-Research Watch**: Review repos from Conway-Research — any tools, libraries, or patterns relevant to our agentic finance platform? Flag anything worth adopting or learning from.',
          '',
          'Output a structured markdown report. If GitHub API is unavailable, note that and recommend checking manually.',
          'Include specific version numbers and actionable recommendations.',
          additionalContext ? '\n## Additional Context\n' + additionalContext : '',
        ].join('\n'),
      },

      'clawhub-scan': {
        system: this.ctoPrompt,
        user: [
          '# CTO Task: ClawHub Skill Discovery Scan',
          '',
          'You are running OUTSIDE of a sprint. Scan for ClawHub skills that could improve Invoica.',
          '',
          projectContext,
          '',
          '## Your Task',
          'Based on our current agent architecture and recent sprint failures, recommend:',
          '',
          '1. **Skills to Look For**: What types of ClawHub skills would help with our recurring failures?',
          '   - Based on sprint data: which task types keep failing?',
          '   - Are there skills for: code formatting, test generation, TypeScript validation?',
          '',
          '2. **MCP Server Integrations**: Any MCP servers for services we might integrate?',
          '   - Payment processors, blockchain APIs, invoice management',
          '   - Developer tools: linting, formatting, testing frameworks',
          '',
          '3. **Security Assessment Framework**: For any recommended skill, outline:',
          '   - What it does and why we need it',
          '   - Security review checklist (network calls, file access, credentials)',
          '   - Risk level (low/medium/high)',
          '   - Integration effort estimate',
          '',
          '4. **Agent Architecture Gaps**: Based on sprint data, are there capability gaps?',
          '   - Do we need a test-runner agent?',
          '   - Do we need a code-formatter agent?',
          '   - Do we need a pre-submission validator?',
          '',
          'IMPORTANT: Any ClawHub skill recommendation MUST include security review as the first implementation step.',
          'Output a structured markdown report with clear, actionable recommendations.',
          additionalContext ? '\n## Additional Context\n' + additionalContext : '',
        ].join('\n'),
      },

      'learnings-review': {
        system: this.ctoPrompt,
        user: [
          '# CTO Task: Learnings & Bug Pattern Analysis',
          '',
          'You are running OUTSIDE of a sprint. Review our project learnings and bug patterns.',
          '',
          projectContext,
          '',
          '## docs/learnings.md',
          this.collector.getLearnings(),
          '',
          '## Recent Daily Reports',
          this.collector.getRecentDailyReports(3),
          '',
          '## Your Task',
          'Analyze the learnings file and daily reports to identify:',
          '',
          '1. **Recurring Failure Patterns**:',
          '   - What types of tasks consistently fail? (e.g., complex frontend, Prisma migrations)',
          '   - What are the root causes? (truncation, overengineering, supervisor contradictions)',
          '   - Quantify: how many sprints have been affected by each pattern?',
          '',
          '2. **Process Improvement Proposals**:',
          '   - Based on patterns found, what changes would prevent these failures?',
          '   - Propose concrete orchestrator/prompt changes (not vague "improve quality")',
          '   - Estimate impact: "This would save X rejections per sprint"',
          '',
          '3. **Supervisor Performance Analysis**:',
          '   - Is the supervisor adding value or causing more problems?',
          '   - Track: false positives (rejecting good code), false negatives (approving bad code)',
          '   - Recommendation: keep, modify, or replace?',
          '',
          '4. **Task Scoping Recommendations**:',
          '   - Which task types should be decomposed into smaller pieces?',
          '   - Maximum recommended complexity per task (LOC, number of features)',
          '   - Template improvements for task definitions',
          '',
          'Output as structured proposals following the CTO proposal JSON format from your prompt.',
          'Wrap the JSON array in a markdown code block.',
          additionalContext ? '\n## Additional Context\n' + additionalContext : '',
        ].join('\n'),
      },

      'post-sprint-analysis': {
        system: this.ctoPrompt,
        user: [
          '# CTO Task: Post-Sprint Analysis & Improvement Proposals',
          '',
          'You are running AFTER a sprint has completed. Analyze sprint results and generate improvement proposals for the CEO.',
          '',
          projectContext,
          '',
          '## Detailed Sprint Results',
          this.collector.getLatestSprintDetails(),
          '',
          '## Learnings History',
          this.collector.getLearnings().substring(0, 4000),
          '',
          '## Recent Daily Reports',
          this.collector.getRecentDailyReports(2),
          '',
          '## Your Task',
          'Perform a thorough retrospective analysis of the most recent sprint:',
          '',
          '1. **Success Rate Analysis**:',
          '   - What was the auto-approval rate? How does it compare to the previous sprint?',
          '   - Which agent types performed best/worst?',
          '   - What was the average number of attempts before approval?',
          '',
          '2. **Failure Pattern Detection**:',
          '   - For each failed/manual-fix task: what was the root cause?',
          '   - Group failures by type: truncation, code fences, wrong imports, supervisor false positives, etc.',
          '   - Are these recurring patterns from previous sprints?',
          '',
          '3. **Dual Supervisor Performance**:',
          '   - Did the dual supervisor (Claude + Codex) add value this sprint?',
          '   - Were there conflicts? Which supervisor was usually right?',
          '   - Any false positives (rejecting good code) or false negatives (approving broken code)?',
          '',
          '4. **Agent Capability Assessment**:',
          '   - Are MiniMax agents hitting token limits consistently?',
          '   - Should certain task types be decomposed differently?',
          '   - Are there tasks that should use a different model (e.g., Claude instead of MiniMax)?',
          '',
          '5. **Concrete Improvement Proposals** (max 3):',
          '   - Each proposal must reference specific sprint data (task IDs, rejection counts, patterns)',
          '   - Each must include measurable expected impact',
          '   - Each must be actionable (not vague "improve quality" — specify exact changes)',
          '   - Categories: process_change, tooling, cost_optimization, architecture',
          '',
          'Output a structured markdown report with:',
          '1. Executive summary (2-3 sentences)',
          '2. Sprint scorecard table',
          '3. Failure analysis with root causes',
          '4. Trend analysis (improving/declining/stable)',
          '5. Proposals in CTO JSON format:',
          '```json',
          '{',
          '  "summary": "Post-sprint analysis summary",',
          '  "proposals": [',
          '    {',
          '      "id": "CTO-YYYYMMDD-NNN",',
          '      "title": "Short title",',
          '      "category": "process_change|tooling|cost_optimization|architecture",',
          '      "description": "What and why, referencing specific task IDs",',
          '      "estimated_impact": "Expected improvement (e.g., reduce manual fixes by 50%)",',
          '      "risk_level": "low|medium|high",',
          '      "implementation_steps": ["step1", "step2"]',
          '    }',
          '  ],',
          '  "sprint_metrics": {',
          '    "total_tasks": 0,',
          '    "auto_approved": 0,',
          '    "manual_fixes": 0,',
          '    "rejected": 0,',
          '    "auto_success_rate": "0%",',
          '    "trend": "improving|declining|stable"',
          '  }',
          '}',
          '```',
          additionalContext ? '\n## Additional Context\n' + additionalContext : '',
        ].join('\n'),
      },
    };

    const selected = prompts[watchType as Exclude<WatchType, 'full-scan'>];
    return { systemPrompt: selected.system, userPrompt: selected.user };
  }

  private saveReport(watchType: WatchType, content: string): string {
    const date = new Date().toISOString().split('T')[0];
    const filename = watchType + '-' + date + '.md';
    const filepath = join(this.reportsDir, filename);
    writeFileSync(filepath, content);
    return filepath;
  }

  private updateLatestReport(watchType: WatchType, reportPath: string): void {
    const latestPath = join(this.reportsDir, 'latest-' + watchType + '.md');
    const content = readFileSync(reportPath, 'utf-8');
    writeFileSync(latestPath, content);
    log(c.gray, '  Updated latest pointer: latest-' + watchType + '.md');
  }
}

// ===== CLI Entry Point =====

async function main() {
  const watchType = process.argv[2] as WatchType;
  const additionalContext = process.argv.slice(3).join(' ') || undefined;

  if (!watchType || !VALID_WATCHES.includes(watchType)) {
    console.log('Usage: npx ts-node scripts/run-cto-techwatch.ts <watch-type> [context]');
    console.log('');
    console.log('Watch types:');
    console.log('  openclaw-watch         Check OpenClaw GitHub for new releases & features');
    console.log('  clawhub-scan           Scan for relevant ClawHub skills and MCP servers');
    console.log('  learnings-review       Analyze docs/learnings.md for patterns & improvements');
    console.log('  verify-implementations Check CEO-approved proposals were properly implemented');
    console.log('  post-sprint-analysis   Analyze most recent sprint results, detect patterns, propose improvements');
    console.log('  full-scan              Run all five watches combined');
    console.log('');
    console.log('Schedule: Daily 10AM CET (9 UTC) via PM2 cron — full-scan');
    console.log('');
    console.log('Data Sources:');
    console.log('  reports/grok-feed/               Grok AI X/Twitter intelligence');
    console.log('  reports/cto/ceo-feedback/         CEO decisions on proposals');
    console.log('  reports/cto/approved-proposals.json  Implementation tracker');
    console.log('');
    console.log('Examples:');
    console.log('  npx ts-node scripts/run-cto-techwatch.ts openclaw-watch');
    console.log('  npx ts-node scripts/run-cto-techwatch.ts learnings-review "Focus on FE truncation issues"');
    console.log('  npx ts-node scripts/run-cto-techwatch.ts full-scan');
    process.exit(1);
  }

  try {
    const runner = new CTOTechWatch();
    const reportPath = await runner.run(watchType, additionalContext);

    log(c.green, '\n' + '='.repeat(60));
    log(c.green, '  CTO Tech Watch complete: ' + watchType);
    log(c.green, '  Report: ' + reportPath);
    log(c.green, '='.repeat(60) + '\n');

    // Trigger CEO review asynchronously — CEO reads this report and decides if a sprint is needed
    const ceoReview = spawn('node', ['-r', 'ts-node/register', join(__dirname, 'run-ceo-review.ts'), '--source=cto'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true', TS_NODE_PROJECT: join(__dirname, '..', 'tsconfig.json') },
    });
    ceoReview.unref();
    log(c.gray, '  CEO review triggered (background PID ' + ceoReview.pid + ')');

    process.exit(0);
  } catch (error: any) {
    log(c.red, '\n[cto-watch] FAILED: ' + error.message);
    if (error.stack) log(c.gray, error.stack);
    process.exit(1);
  }
}

main();
