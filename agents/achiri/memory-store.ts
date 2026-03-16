// Achiri Memory Store — Sprint 114 (daily counters added Sprint 122)
// Per-user conversation history as JSONL. Max 50 turns per user (oldest trimmed).
// Daily message counters stored in workspace/achiri/daily-counts.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ConversationTurn } from './index';

const MAX_HISTORY_TURNS = 50;
const DAILY_COUNTS_FILE = join('workspace', 'achiri', 'daily-counts.json');

// Format: { "2026-03-16": { "userId": 3 } }
type DailyCounts = Record<string, Record<string, number>>;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export class AchiriMemoryStore {
  private storePath: string;

  constructor(storePath: string = 'workspace/achiri/memory') {
    this.storePath = storePath;
    if (!existsSync(storePath)) mkdirSync(storePath, { recursive: true });
    // Ensure parent dir for daily-counts exists
    const countsDir = join('workspace', 'achiri');
    if (!existsSync(countsDir)) mkdirSync(countsDir, { recursive: true });
  }

  private filePath(userId: string): string {
    // Sanitize userId to safe filename
    return join(this.storePath, userId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.jsonl');
  }

  loadHistory(userId: string): ConversationTurn[] {
    const fp = this.filePath(userId);
    if (!existsSync(fp)) return [];
    const lines = readFileSync(fp, 'utf8').split('\n').filter(l => l.trim());
    return lines.map(l => JSON.parse(l) as ConversationTurn);
  }

  saveHistory(userId: string, history: ConversationTurn[]): void {
    const trimmed = history.slice(-MAX_HISTORY_TURNS);
    writeFileSync(this.filePath(userId), trimmed.map(t => JSON.stringify(t)).join('\n') + '\n', 'utf8');
  }

  appendTurn(userId: string, turn: ConversationTurn): void {
    const history = this.loadHistory(userId);
    history.push(turn);
    this.saveHistory(userId, history);
  }

  clearHistory(userId: string): void {
    const fp = this.filePath(userId);
    if (existsSync(fp)) unlinkSync(fp);
  }

  getStats(): { users: number; total_turns: number } {
    if (!existsSync(this.storePath)) return { users: 0, total_turns: 0 };
    const files = readdirSync(this.storePath).filter(f => f.endsWith('.jsonl'));
    let total_turns = 0;
    for (const f of files) {
      const lines = readFileSync(join(this.storePath, f), 'utf8').split('\n').filter(l => l.trim());
      total_turns += lines.length;
    }
    return { users: files.length, total_turns };
  }

  // --- Daily message counter (Sprint 122) ---

  private loadCounts(): DailyCounts {
    if (!existsSync(DAILY_COUNTS_FILE)) return {};
    try {
      return JSON.parse(readFileSync(DAILY_COUNTS_FILE, 'utf8')) as DailyCounts;
    } catch {
      return {};
    }
  }

  private saveCounts(counts: DailyCounts): void {
    writeFileSync(DAILY_COUNTS_FILE, JSON.stringify(counts, null, 2), 'utf8');
  }

  getDailyCount(userId: string): number {
    const counts = this.loadCounts();
    const day = todayKey();
    return counts[day]?.[userId] ?? 0;
  }

  incrementDailyCount(userId: string): number {
    const counts = this.loadCounts();
    const day = todayKey();
    if (!counts[day]) counts[day] = {};
    counts[day][userId] = (counts[day][userId] ?? 0) + 1;
    this.saveCounts(counts);
    return counts[day][userId];
  }
}
