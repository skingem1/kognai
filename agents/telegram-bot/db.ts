// Telegram subscriber database — JSON file store (Phase 1)
// Upgrades to Postgres/Supabase in Phase 2 when user count justifies it.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH  = join(DATA_DIR, 'telegram-subscribers.json');

export type SubscriptionTier = 'free' | 'growth' | 'premium';

export interface SubscriberRecord {
  chatId:           number;
  username?:        string;
  firstName:        string;
  tier:             SubscriptionTier;
  registeredAt:     string;  // ISO
  lastSeen:         string;  // ISO
  stripeCustomerId?: string;
  active:           boolean;
  postsPerDay:      number;  // user-configured posting frequency (default 3)
}

interface DB {
  subscribers: Record<string, SubscriberRecord>;  // keyed by chatId string
}

function load(): DB {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_PATH)) {
    const empty: DB = { subscribers: {} };
    writeFileSync(DB_PATH, JSON.stringify(empty, null, 2), 'utf-8');
    return empty;
  }
  return JSON.parse(readFileSync(DB_PATH, 'utf-8')) as DB;
}

function save(db: DB): void {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

export class TelegramDB {
  static get(chatId: number): SubscriberRecord | null {
    const db = load();
    return db.subscribers[String(chatId)] ?? null;
  }

  static upsert(chatId: number, updates: Partial<SubscriberRecord> & { firstName: string }): SubscriberRecord {
    const db  = load();
    const key = String(chatId);
    const now = new Date().toISOString();

    const existing = db.subscribers[key];
    const defaults: SubscriberRecord = {
      chatId,
      firstName:    updates.firstName,
      tier:         'free',
      registeredAt: now,
      postsPerDay:  3,
      active:       true,
      lastSeen:     now,
    };
    const record: SubscriberRecord = { ...defaults, ...existing, ...updates, lastSeen: now };

    db.subscribers[key] = record;
    save(db);
    return record;
  }

  static list(): SubscriberRecord[] {
    const db = load();
    return Object.values(db.subscribers);
  }

  static count(): number {
    return TelegramDB.list().length;
  }

  static activeCount(): number {
    return TelegramDB.list().filter(s => s.active).length;
  }

  static setPostsPerDay(chatId: number, count: number): void {
    const record = TelegramDB.get(chatId);
    if (!record) return;
    TelegramDB.upsert(chatId, { ...record, postsPerDay: count });
  }
}
