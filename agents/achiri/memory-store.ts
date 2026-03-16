// Achiri Memory Store — Sprint 114
// Per-user conversation history as JSONL. Max 50 turns per user (oldest trimmed).

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ConversationTurn } from './index';

const MAX_HISTORY_TURNS = 50;

export class AchiriMemoryStore {
  private storePath: string;

  constructor(storePath: string = 'workspace/achiri/memory') {
    this.storePath = storePath;
    if (!existsSync(storePath)) mkdirSync(storePath, { recursive: true });
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
}
