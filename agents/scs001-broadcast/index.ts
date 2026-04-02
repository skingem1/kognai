/**
 * SCS-001 Broadcast Narrator Agent (AMD-17)
 *
 * Transforms internal swarm events into plain-language narrations for
 * external broadcast surfaces (Telegram channel, X/Twitter, dashboard).
 *
 * Input:  Git commits, pipeline runs, gate updates, agent actions
 * Output: ≤280 char factual narrations → ACP filter → 60s delay → surface
 *
 * Model: T1 qwen3:4b (local, $0) — narration is simple text transformation
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BroadcastEvent {
  type: 'sprint_complete' | 'pipeline_run' | 'gate_update' | 'agent_action' | 'deployment';
  source: string;       // e.g. "sprint-runner", "scs001-pipeline"
  timestamp: string;    // ISO 8601
  data: Record<string, any>;
}

export interface Narration {
  event_type: string;
  text: string;         // ≤280 chars, plain language, factual
  timestamp: string;
  surface: 'telegram' | 'x' | 'dashboard';
  acp_filtered: boolean;
  delayed_until: string; // 60s buffer per AMD-17
}

// ── ACP Filter ────────────────────────────────────────────────────────────────

const STRIP_PATTERNS = [
  /\/Users\/[^\s]+/g,                    // file paths
  /\b[A-Z_]{2,}_[A-Z_]+\b/g,           // env var names (API_KEY, etc.)
  /0x[a-fA-F0-9]{10,}/g,                // wallet/tx hashes (keep short refs)
  /\b(sk-|pk-|key_|token_)[^\s]+\b/gi,  // API key prefixes
  /Error:.*$/gm,                         // error messages
  /at\s+\S+\s+\(.*:\d+:\d+\)/g,        // stack traces
];

const BRAND_FIXES: [RegExp, string][] = [
  [/\bkognai\b/gi, 'Kognai'],
  [/\binvoica\b/gi, 'Invoica'],
  [/\bachiri\b/gi, 'Achiri'],
];

export function acpFilter(text: string): string {
  let filtered = text;

  // Strip internal references
  for (const pattern of STRIP_PATTERNS) {
    filtered = filtered.replace(pattern, '[...]');
  }

  // Brand alignment
  for (const [pattern, replacement] of BRAND_FIXES) {
    filtered = filtered.replace(pattern, replacement);
  }

  // Collapse multiple [...] and clean up
  filtered = filtered.replace(/(\[\.\.\.\]\s*){2,}/g, '[...] ');
  filtered = filtered.trim();

  // Hard cap at 280 chars
  if (filtered.length > 280) {
    filtered = filtered.slice(0, 277) + '...';
  }

  return filtered;
}

// ── Event → Narration Templates ───────────────────────────────────────────────

export function narrate(event: BroadcastEvent): string {
  const { type, data } = event;

  switch (type) {
    case 'sprint_complete': {
      const id = data.sprint_id ?? 'unknown';
      const approved = data.approved ?? 0;
      const rejected = data.rejected ?? 0;
      const total = approved + rejected;
      return `Sprint ${id} ships. ${approved}/${total} tasks approved.`;
    }

    case 'pipeline_run': {
      const videos = data.videos_produced ?? 0;
      const topics = data.topics_found ?? 0;
      return `Pipeline produces ${videos} new videos from ${topics} topics.`;
    }

    case 'gate_update': {
      const gate = data.gate_name ?? 'unknown';
      const passed = data.passed ? 'PASSED' : `${data.progress ?? '?'}`;
      return `Gate ${gate}: ${passed}.`;
    }

    case 'agent_action': {
      const agent = data.agent_name ?? 'unknown';
      const action = data.action ?? 'acted';
      return `${agent} ${action}.`;
    }

    case 'deployment': {
      const target = data.target ?? 'production';
      const version = data.version ?? '';
      return `Deployed to ${target}${version ? ` (${version})` : ''}.`;
    }

    default:
      return `Event: ${type}.`;
  }
}

// ── Broadcast Pipeline ────────────────────────────────────────────────────────

const DELAY_MS = 60_000; // 60s buffer per AMD-17
const LOG_DIR = join(process.cwd(), 'logs', 'broadcast');

export function processBroadcastEvent(event: BroadcastEvent): Narration {
  // Step 1: Generate narration
  const rawText = narrate(event);

  // Step 2: ACP filter
  const filteredText = acpFilter(rawText);

  // Step 3: Apply 60s delay
  const now = new Date();
  const delayedUntil = new Date(now.getTime() + DELAY_MS);

  const narration: Narration = {
    event_type: event.type,
    text: filteredText,
    timestamp: now.toISOString(),
    surface: 'telegram',  // default surface
    acp_filtered: rawText !== filteredText,
    delayed_until: delayedUntil.toISOString(),
  };

  // Step 4: Log
  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = join(LOG_DIR, `${now.toISOString().slice(0, 10)}.jsonl`);
  appendFileSync(logFile, JSON.stringify(narration) + '\n');

  return narration;
}

// ── Kill Switch (Godman) ──────────────────────────────────────────────────────

let killSwitchActive = false;

export function activateKillSwitch(): void {
  killSwitchActive = true;
  console.error('[broadcast] KILL SWITCH ACTIVATED — all output halted');
}

export function deactivateKillSwitch(): void {
  killSwitchActive = false;
  console.error('[broadcast] Kill switch deactivated — output resumed');
}

export function isKillSwitchActive(): boolean {
  return killSwitchActive;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export default {
  narrate,
  acpFilter,
  processBroadcastEvent,
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive,
};
