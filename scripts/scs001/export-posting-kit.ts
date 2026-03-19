#!/usr/bin/env npx ts-node
/**
 * SCS-001 Batch Content Export — HTML Posting Kit
 * Sprint 262
 *
 * Generates an HTML report from pipeline outputs for manual TikTok posting.
 * Includes: video file paths, captions, hashtags, posting schedule, gate status.
 *
 * Usage: npx ts-node scripts/scs001/export-posting-kit.ts
 * Output: workspace/scs001/posting-kit.html
 */

import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE = path.resolve('workspace/scs001');
const OUTPUT_PATH = path.join(WORKSPACE, 'posting-kit.html');

// ── Load data sources ──────────────────────────────────────────────────────────

interface PublishEntry {
  clip_id: string;
  video_id: string;
  published_at: string;
  run_id: string;
}

interface ExperimentEntry {
  clip_id: string;
  hook_formula: string;
  speaker: string;
  qc_passed: boolean;
  run_id: string;
  timestamp: string;
}

interface ScheduleSlot {
  video_id: string;
  slot: string;
  viral_score: number | null;
  speaker: string;
  topic: string;
}

interface ContentCalendar {
  generated_at: string;
  gate_date: string;
  total_days: number;
  total_videos_assigned: number;
  schedule: Record<string, ScheduleSlot[]>;
}

function loadJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as T[];
}

// Load all data
const publishEntries = loadJsonl<PublishEntry>(path.join(WORKSPACE, 'publish-ledger.jsonl'));
const experiments = loadJsonl<ExperimentEntry>(path.join(WORKSPACE, 'experiments.jsonl'));
const calendarPath = path.join(WORKSPACE, 'content-calendar.json');
const calendar: ContentCalendar | null = fs.existsSync(calendarPath)
  ? JSON.parse(fs.readFileSync(calendarPath, 'utf-8'))
  : null;

// Build experiment lookup
const expMap = new Map<string, ExperimentEntry>();
for (const e of experiments) {
  expMap.set(e.clip_id, e);
}

// Find video files
const captionDir = path.join(WORKSPACE, 'captioned-output');
const editingDir = path.join(WORKSPACE, 'editing-outputs');
const captionFiles = new Set<string>();
const videoFiles = new Map<string, string>(); // video_id -> absolute path

if (fs.existsSync(captionDir)) {
  for (const f of fs.readdirSync(captionDir)) {
    if (f.endsWith('.mp4')) {
      const id = f.replace('-captioned.mp4', '');
      captionFiles.add(id);
      videoFiles.set(id, path.join(captionDir, f));
    }
  }
}

if (fs.existsSync(editingDir)) {
  for (const sub of fs.readdirSync(editingDir)) {
    const subPath = path.join(editingDir, sub);
    if (fs.statSync(subPath).isDirectory()) {
      for (const f of fs.readdirSync(subPath)) {
        if (f.endsWith('.mp4')) {
          const id = f.replace('.mp4', '');
          if (!videoFiles.has(id)) {
            videoFiles.set(id, path.join(subPath, f));
          }
        }
      }
    }
  }
}

// ── Gate progress ──────────────────────────────────────────────────────────────

const gateDate = calendar?.gate_date ? new Date(calendar.gate_date) : new Date('2026-04-07');
const now = new Date();
const daysRemaining = Math.max(0, Math.ceil((gateDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
const totalVideos = publishEntries.length;
const target = 30;
const paceNeeded = daysRemaining > 0 ? Math.ceil((target - totalVideos) / daysRemaining * 10) / 10 : 0;

// ── Build schedule rows ────────────────────────────────────────────────────────

interface PostingRow {
  date: string;
  slot: string;
  videoId: string;
  hasFile: boolean;
  filePath: string;
  hasCaptions: boolean;
  hookFormula: string;
  speaker: string;
  qcPassed: boolean;
}

const rows: PostingRow[] = [];
if (calendar) {
  const dates = Object.keys(calendar.schedule).sort();
  for (const date of dates) {
    for (const slot of calendar.schedule[date]) {
      const exp = expMap.get(slot.video_id);
      const hasFile = videoFiles.has(slot.video_id);
      const hasCaptions = captionFiles.has(slot.video_id);
      rows.push({
        date,
        slot: slot.slot,
        videoId: slot.video_id,
        hasFile,
        filePath: videoFiles.get(slot.video_id) || '',
        hasCaptions,
        hookFormula: exp?.hook_formula || slot.speaker || 'unknown',
        speaker: exp?.speaker || slot.speaker || 'unknown',
        qcPassed: exp?.qc_passed ?? true,
      });
    }
  }
}

// Also add any videos not in the calendar
for (const [id, fpath] of videoFiles) {
  if (!rows.some(r => r.videoId === id)) {
    const exp = expMap.get(id);
    rows.push({
      date: 'unscheduled',
      slot: '-',
      videoId: id,
      hasFile: true,
      filePath: fpath,
      hasCaptions: captionFiles.has(id),
      hookFormula: exp?.hook_formula || 'unknown',
      speaker: exp?.speaker || 'unknown',
      qcPassed: exp?.qc_passed ?? true,
    });
  }
}

// ── Hashtag bank ───────────────────────────────────────────────────────────────

const hashtags = [
  '#ai', '#artificialintelligence', '#machinelearning', '#tech', '#innovation',
  '#startup', '#founder', '#entrepreneurship', '#saas', '#buildinpublic',
  '#tiktokgrowth', '#techstartup', '#aitools', '#futuretechnology', '#deeplearning',
  '#coding', '#programming', '#automation', '#productivty', '#growth',
];

// ── Generate HTML ──────────────────────────────────────────────────────────────

const readyCount = rows.filter(r => r.hasFile).length;
const todayStr = now.toISOString().split('T')[0];
const todayRows = rows.filter(r => r.date === todayStr);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kognai SCS-001 Posting Kit</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
  h1 { color: #fff; margin-bottom: 0.5rem; }
  .subtitle { color: #888; margin-bottom: 2rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .stat { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1.5rem; }
  .stat-value { font-size: 2rem; font-weight: 700; color: #fff; }
  .stat-label { color: #888; font-size: 0.85rem; margin-top: 0.25rem; }
  .stat.urgent .stat-value { color: #ff4444; }
  .stat.ok .stat-value { color: #44ff44; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
  th { text-align: left; padding: 0.75rem; background: #1a1a1a; color: #888; font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid #333; }
  td { padding: 0.75rem; border-bottom: 1px solid #1a1a1a; font-size: 0.9rem; }
  tr:hover { background: #111; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .badge-ready { background: #1a3a1a; color: #44ff44; }
  .badge-missing { background: #3a1a1a; color: #ff4444; }
  .badge-today { background: #3a3a1a; color: #ffff44; }
  .file-path { font-family: monospace; font-size: 0.8rem; color: #888; word-break: break-all; cursor: pointer; }
  .file-path:hover { color: #fff; }
  .section { margin-bottom: 2rem; }
  .section h2 { color: #fff; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #333; }
  .hashtags { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1rem; font-family: monospace; font-size: 0.85rem; line-height: 1.8; cursor: pointer; }
  .hashtags:hover { border-color: #666; }
  .caption-box { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1rem; margin-bottom: 0.5rem; }
  .caption-box p { font-size: 0.9rem; line-height: 1.5; }
  .copy-hint { color: #666; font-size: 0.75rem; }
</style>
</head>
<body>

<h1>SCS-001 Posting Kit</h1>
<p class="subtitle">Generated ${now.toISOString()} | Phase 1.5 Gate: ${gateDate.toISOString().split('T')[0]}</p>

<div class="stats">
  <div class="stat ${totalVideos >= target ? 'ok' : 'urgent'}">
    <div class="stat-value">${totalVideos}/${target}</div>
    <div class="stat-label">Posts Published</div>
  </div>
  <div class="stat ${daysRemaining > 14 ? 'ok' : 'urgent'}">
    <div class="stat-value">${daysRemaining}d</div>
    <div class="stat-label">Days to Gate</div>
  </div>
  <div class="stat">
    <div class="stat-value">${paceNeeded}/day</div>
    <div class="stat-label">Pace Needed</div>
  </div>
  <div class="stat">
    <div class="stat-value">${readyCount}</div>
    <div class="stat-label">Videos Ready</div>
  </div>
  <div class="stat">
    <div class="stat-value">${rows.length}</div>
    <div class="stat-label">Total Scheduled</div>
  </div>
</div>

${todayRows.length > 0 ? `
<div class="section">
  <h2>Today's Posts (${todayStr})</h2>
  <table>
    <tr><th>Slot</th><th>Video</th><th>Status</th><th>File Path</th></tr>
    ${todayRows.map(r => `
    <tr>
      <td>${r.slot}</td>
      <td>${r.videoId}</td>
      <td>${r.hasFile ? '<span class="badge badge-ready">READY</span>' : '<span class="badge badge-missing">NO FILE</span>'}</td>
      <td class="file-path" onclick="navigator.clipboard.writeText('${r.filePath.replace(/'/g, "\\'")}')">${r.filePath || '-'}</td>
    </tr>`).join('')}
  </table>
</div>
` : `<div class="section"><h2>Today's Posts</h2><p style="color:#888">No posts scheduled for today (${todayStr}).</p></div>`}

<div class="section">
  <h2>Full Schedule</h2>
  <table>
    <tr><th>Date</th><th>Slot</th><th>Video ID</th><th>Hook</th><th>Speaker</th><th>File</th><th>Captions</th></tr>
    ${rows.map(r => `
    <tr>
      <td>${r.date === todayStr ? `<span class="badge badge-today">${r.date}</span>` : r.date}</td>
      <td>${r.slot}</td>
      <td>${r.videoId}</td>
      <td>${r.hookFormula}</td>
      <td>${r.speaker}</td>
      <td>${r.hasFile ? '<span class="badge badge-ready">YES</span>' : '<span class="badge badge-missing">NO</span>'}</td>
      <td>${r.hasCaptions ? '<span class="badge badge-ready">YES</span>' : '<span class="badge badge-missing">NO</span>'}</td>
    </tr>`).join('')}
  </table>
</div>

<div class="section">
  <h2>Hashtag Bank</h2>
  <p class="copy-hint">Click to copy all hashtags</p>
  <div class="hashtags" onclick="navigator.clipboard.writeText(this.innerText)">
${hashtags.join(' ')}
  </div>
</div>

<div class="section">
  <h2>Posting Workflow</h2>
  <ol style="padding-left: 1.5rem; line-height: 2;">
    <li>Open this page daily</li>
    <li>Check "Today's Posts" section</li>
    <li>Click the file path to copy it</li>
    <li>Open TikTok app → upload video from that path</li>
    <li>Click hashtags to copy → paste into TikTok caption</li>
    <li>Post at the scheduled slot time</li>
    <li>Run <code style="color:#44ff44">npx ts-node scripts/scs001/record-post.ts VIDEO_ID</code> to log it</li>
  </ol>
</div>

<div class="section" style="color:#666; font-size:0.8rem; margin-top:3rem;">
  <p>Kognai SCS-001 | Phase 1 Content Pipeline | Sprint 262</p>
  <p>Videos in: ${captionDir}</p>
  <p>Total pipeline entries: ${publishEntries.length} published, ${experiments.length} experiments</p>
</div>

</body>
</html>`;

// Write output
fs.writeFileSync(OUTPUT_PATH, html);

console.log('=== SCS-001 Posting Kit Generated ===');
console.log(`Output: ${OUTPUT_PATH}`);
console.log(`Videos ready: ${readyCount}/${rows.length}`);
console.log(`Gate progress: ${totalVideos}/${target} posts (${daysRemaining} days remaining)`);
console.log(`Pace needed: ${paceNeeded} posts/day`);
console.log(`Today (${todayStr}): ${todayRows.length} slots`);
console.log(`\nOpen in browser: file://${OUTPUT_PATH}`);
