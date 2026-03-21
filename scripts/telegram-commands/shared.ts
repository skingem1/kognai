/**
 * Shared utilities for Telegram bot command handlers.
 * Extracted from telegram-bot.ts (Sprint 455) to support modular command files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export const ROOT = path.resolve(__dirname, '../..');

export interface Pm2Process {
  name: string;
  status: string;
  restarts: number;
  uptimeMs: number | null;
  memory: number | null;
  cpu: number | null;
}

export function getPm2List(): Pm2Process[] {
  try {
    const out = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    const list: any[] = JSON.parse(out);
    return list.map((p: any) => {
      const env = p.pm2_env || {};
      const status = env.status || 'unknown';
      return {
        name: p.name,
        status,
        restarts: env.restart_time ?? 0,
        uptimeMs: status === 'online' && env.pm_uptime ? Date.now() - env.pm_uptime : null,
        memory: p.monit?.memory ?? null,
        cpu: p.monit?.cpu ?? null,
      };
    });
  } catch (e: any) {
    return [];
  }
}

export function readJSON<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
}

export function readLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

export function fmtUptime(ms: number | null): string {
  if (!ms || ms < 0) return 'stopped';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`;
}

export function fmtMem(bytes: number | null): string {
  if (!bytes) return '';
  return ` ${Math.round(bytes / 1024 / 1024)}MB`;
}

export function latestSprintFile(): string | null {
  const sprintsDir = path.join(ROOT, 'sprints');
  try {
    const files = fs.readdirSync(sprintsDir)
      .filter(f => f.match(/^week-\d+\.json$/))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)![0], 10);
        const nb = parseInt(b.match(/\d+/)![0], 10);
        return nb - na;
      });
    return files[0] ? path.join(sprintsDir, files[0]) : null;
  } catch { return null; }
}

export function findCaptionedMp4(videoId: string): string | null {
  try {
    const scsDir = path.join(ROOT, 'workspace', 'scs001');
    // Check legacy run-* dirs
    const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
    for (const dir of runDirs) {
      const p = path.join(scsDir, dir, 'caption', `${videoId}-captioned.mp4`);
      if (fs.existsSync(p)) return p;
    }
    // Check multiformat-runs output dirs (Sprint 603)
    const mfDir = path.join(scsDir, 'multiformat-runs');
    if (fs.existsSync(mfDir)) {
      const mfRuns = fs.readdirSync(mfDir).filter(d => d.startsWith('mf-'));
      for (const dir of mfRuns) {
        const outDir = path.join(mfDir, dir, 'output');
        if (!fs.existsSync(outDir)) continue;
        // Try _final.mp4 first (best quality), then _final_av.mp4, then base
        for (const suffix of ['_final.mp4', '_final_av.mp4', '_video_only.mp4', '_base.mp4']) {
          const p = path.join(outDir, `${videoId}${suffix}`);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function getExperimentData(videoId: string): { speaker: string; hook_formula: string; viral_score: number | null; topic: string | null; format: string | null } {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  const result = { speaker: 'unknown', hook_formula: 'unknown', viral_score: null as number | null, topic: null as string | null, format: null as string | null };
  if (!fs.existsSync(expPath)) return result;
  try {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        if (id === videoId) {
          if (e.speaker) result.speaker = e.speaker;
          if (e.hook_formula) result.hook_formula = e.hook_formula;
          if (e.partial_viral_score != null) result.viral_score = e.partial_viral_score;
          if (e.topic) result.topic = e.topic;
          if (e.format) result.format = e.format;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return result;
}

export function buildTikTokCaption(videoId: string): string {
  const exp = getExperimentData(videoId);
  let topicTags: string[] = [];
  try {
    const vt = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json'), 'utf-8'));
    topicTags = (vt.topics ?? []).slice(0, 3).map((t: string) => `#${t.replace(/\s+/g, '')}`);
  } catch { /* fallback */ }
  const { buildEngagementCaption } = require('../scs001/engagement-caption');
  return buildEngagementCaption({ videoId, hookFormula: exp.hook_formula, speaker: exp.speaker, topic: exp.topic, extraHashtags: topicTags });
}

export function loadSpeakerMap(): Map<string, string> {
  const speakers = new Map<string, string>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (!fs.existsSync(expPath)) return speakers;
  try {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        const speaker = e.speaker;
        if (id && speaker && speaker !== 'unknown') speakers.set(id, speaker);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return speakers;
}

export function diversifyBySpeaker(videos: any[], speakerMap: Map<string, string>, maxConsecutive: number = 2): any[] {
  if (videos.length <= maxConsecutive) return videos;
  const result: any[] = [];
  const remaining = [...videos];
  while (remaining.length > 0) {
    let lastSpeaker = '';
    let consecutiveCount = 0;
    if (result.length > 0) {
      lastSpeaker = speakerMap.get(result[result.length - 1].video_id) ?? '';
      for (let i = result.length - 1; i >= 0; i--) {
        const s = speakerMap.get(result[i].video_id) ?? '';
        if (s === lastSpeaker && lastSpeaker) consecutiveCount++;
        else break;
      }
    }
    let picked = -1;
    for (let i = 0; i < remaining.length; i++) {
      const candidateSpeaker = speakerMap.get(remaining[i].video_id) ?? '';
      if (consecutiveCount >= maxConsecutive && candidateSpeaker === lastSpeaker && lastSpeaker) continue;
      picked = i;
      break;
    }
    if (picked === -1) picked = 0;
    result.push(remaining.splice(picked, 1)[0]);
  }
  return result;
}

export function loadHookMap(): Map<string, string> {
  const hooks = new Map<string, string>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (!fs.existsSync(expPath)) return hooks;
  try {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        const hook = e.hook_formula;
        if (id && hook && hook !== 'unknown') hooks.set(id, hook);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return hooks;
}

export function diversifyByHook(videos: any[], hookMap: Map<string, string>, maxConsecutive: number = 2): any[] {
  if (videos.length <= maxConsecutive) return videos;
  const result: any[] = [];
  const remaining = [...videos];
  while (remaining.length > 0) {
    let lastHook = '';
    let consecutiveCount = 0;
    if (result.length > 0) {
      lastHook = hookMap.get(result[result.length - 1].video_id) ?? '';
      for (let i = result.length - 1; i >= 0; i--) {
        const h = hookMap.get(result[i].video_id) ?? '';
        if (h === lastHook && lastHook) consecutiveCount++;
        else break;
      }
    }
    let picked = -1;
    for (let i = 0; i < remaining.length; i++) {
      const candidateHook = hookMap.get(remaining[i].video_id) ?? '';
      if (consecutiveCount >= maxConsecutive && candidateHook === lastHook && lastHook) continue;
      picked = i;
      break;
    }
    if (picked === -1) picked = 0;
    result.push(remaining.splice(picked, 1)[0]);
  }
  return result;
}

export function freshnessScore(videoId: string, viralScore: number, ledgerMap: Map<string, string>): number {
  const publishedAt = ledgerMap.get(videoId);
  if (!publishedAt) return viralScore;
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 3) return viralScore;
  const decay = Math.pow(0.85, ageDays - 3);
  return viralScore * decay;
}

export const ARCHIVE_PATH = path.join(ROOT, 'workspace', 'scs001', 'archived-videos.json');

export function loadArchived(): Set<string> {
  if (!fs.existsSync(ARCHIVE_PATH)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf-8'));
    return new Set(Array.isArray(data.ids) ? data.ids : []);
  } catch { return new Set(); }
}

export function saveArchived(ids: Set<string>): void {
  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify({
    ids: Array.from(ids),
    updated_at: new Date().toISOString(),
    count: ids.size,
  }, null, 2), 'utf-8');
}

export const NOTES_PATH = path.join(ROOT, 'workspace', 'scs001', 'video-notes.json');

export function loadNotes(): Record<string, { note: string; at: string }> {
  if (!fs.existsSync(NOTES_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(NOTES_PATH, 'utf-8')); } catch { return {}; }
}

export function saveNotes(notes: Record<string, { note: string; at: string }>): void {
  fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2), 'utf-8');
}

// Sprint 478: Niche/topic diversity guard
export function loadTopicMap(): Map<string, string> {
  const topics = new Map<string, string>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (!fs.existsSync(expPath)) return topics;
  try {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        const topic = e.topic ?? e.niche ?? e.category;
        if (id && topic && topic !== 'unknown') topics.set(id, topic);
      } catch {}
    }
  } catch {}
  return topics;
}

export function diversifyByTopic(videos: any[], topicMap: Map<string, string>, maxConsecutive: number = 2): any[] {
  if (videos.length <= maxConsecutive) return videos;
  const result: any[] = [];
  const remaining = [...videos];
  while (remaining.length > 0) {
    let lastTopic = '';
    let consecutiveCount = 0;
    if (result.length > 0) {
      lastTopic = topicMap.get(result[result.length - 1].video_id) ?? '';
      for (let i = result.length - 1; i >= 0; i--) {
        const t = topicMap.get(result[i].video_id) ?? '';
        if (t === lastTopic && lastTopic) consecutiveCount++;
        else break;
      }
    }
    let picked = -1;
    for (let i = 0; i < remaining.length; i++) {
      const candidateTopic = topicMap.get(remaining[i].video_id) ?? '';
      if (consecutiveCount >= maxConsecutive && candidateTopic === lastTopic && lastTopic) continue;
      picked = i;
      break;
    }
    if (picked === -1) picked = 0;
    result.push(remaining.splice(picked, 1)[0]);
  }
  return result;
}

export function getNicheDiversityScore(recentPosts: any[], topicMap: Map<string, string>): { score: number; distribution: Record<string, number>; total: number } {
  const distribution: Record<string, number> = {};
  let total = 0;
  for (const post of recentPosts) {
    const topic = topicMap.get(post.video_id) ?? 'unknown';
    distribution[topic] = (distribution[topic] ?? 0) + 1;
    total++;
  }
  if (total === 0) return { score: 100, distribution, total };
  const uniqueTopics = Object.keys(distribution).length;
  const maxPct = Math.max(...Object.values(distribution)) / total;
  // Score: 100 = perfect diversity, 0 = all same niche
  // Penalize if any niche >30% of window
  const score = Math.round(Math.min(100, (uniqueTopics / Math.max(total, 1)) * 100 * (1 - Math.max(0, maxPct - 0.3))));
  return { score, distribution, total };
}

export const HOOK_OPENERS: Record<string, string> = {
  curiosity_gap: '"You won\'t believe what happens when..."',
  contrarian: '"Everyone thinks X, but actually..."',
  authority: '"After 10 years in the industry, here\'s what I know..."',
  secret: '"Nobody talks about this, but..."',
  question: '"Have you ever wondered why...?"',
};
