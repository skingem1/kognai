// Voxight ORACLE-6 Module 2 — Live Feed Stub
// Mock live feed interface for SCS-001 pipeline integration testing.
// Real Voxight Module 2 integration deferred to Phase 2.
// Sprint 490 — PHASE2A-PREP

import * as fs from 'fs';
import * as path from 'path';
import { VoxightSignal } from './voxight-client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LiveFeedEvent {
  event_id: string;
  event_type: 'trend_spike' | 'narrative_shift' | 'viral_content' | 'space_started' | 'thought_leader_post';
  signal: VoxightSignal;
  received_at: string;
  processed: boolean;
}

export interface LiveFeedConfig {
  poll_interval_ms: number;  // How often to check for new events (mock: immediate)
  max_buffer_size: number;   // Max events in memory buffer
  auto_forward_to_pipeline: boolean;
  mock_mode: boolean;        // true = use mock data, false = real Voxight API
}

type FeedHandler = (event: LiveFeedEvent) => void | Promise<void>;

// ── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_FEED_PATH = path.join(__dirname, '..', '..', 'workspace', 'intelligence', 'mock-feed-data.json');

function loadMockEvents(): LiveFeedEvent[] {
  try {
    if (fs.existsSync(MOCK_FEED_PATH)) {
      const data = JSON.parse(fs.readFileSync(MOCK_FEED_PATH, 'utf-8'));
      return data.events || [];
    }
  } catch { /* ignore */ }
  return generateDefaultMockEvents();
}

function generateDefaultMockEvents(): LiveFeedEvent[] {
  const now = new Date().toISOString();
  return [
    {
      event_id: 'mock-001',
      event_type: 'trend_spike',
      signal: {
        signal_id: 'mock-sig-001',
        query_type: 'TRENDS',
        topic: 'AI agents autonomous coding',
        summary: 'Spike in X posts about AI agents that write code autonomously — 340% increase in 6 hours',
        confidence: 85,
        sources: ['x.com/trending', 'x.com/spaces'],
        timestamp: now,
        scs_relevant: true
      },
      received_at: now,
      processed: false
    },
    {
      event_id: 'mock-002',
      event_type: 'viral_content',
      signal: {
        signal_id: 'mock-sig-002',
        query_type: 'TRENDS',
        topic: 'open source AI tools for creators',
        summary: 'Viral thread on free AI tools for content creators — 12K retweets in 3 hours',
        confidence: 78,
        sources: ['x.com/viral'],
        timestamp: now,
        scs_relevant: true
      },
      received_at: now,
      processed: false
    },
    {
      event_id: 'mock-003',
      event_type: 'thought_leader_post',
      signal: {
        signal_id: 'mock-sig-003',
        query_type: 'THOUGHT_LEADER',
        topic: 'TikTok algorithm changes 2026',
        summary: 'Prominent creator analyst reports TikTok favoring 15-30s clips with text hooks over 60s content',
        confidence: 72,
        sources: ['x.com/thought-leaders'],
        timestamp: now,
        scs_relevant: true
      },
      received_at: now,
      processed: false
    }
  ];
}

// ── Live Feed Client ─────────────────────────────────────────────────────────

export class VoxightLiveFeed {
  private config: LiveFeedConfig;
  private buffer: LiveFeedEvent[] = [];
  private handlers: FeedHandler[] = [];
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<LiveFeedConfig>) {
    this.config = {
      poll_interval_ms: 60000,
      max_buffer_size: 100,
      auto_forward_to_pipeline: false,
      mock_mode: true,  // Default to mock until Voxight Module 2 is live
      ...config
    };
  }

  /** Register a handler for incoming feed events */
  onEvent(handler: FeedHandler): void {
    this.handlers.push(handler);
  }

  /** Start the live feed (mock or real) */
  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.config.mock_mode) {
      // Load mock events immediately
      const events = loadMockEvents();
      for (const event of events) {
        this.pushEvent(event);
      }
      console.log(`[voxight-live] Mock mode: ${events.length} events loaded`);
    } else {
      // Real mode: poll Voxight API (Phase 2 implementation)
      console.log('[voxight-live] Real mode not yet implemented — use mock_mode: true');
    }
  }

  /** Stop the live feed */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Get unprocessed events from the buffer */
  getUnprocessed(): LiveFeedEvent[] {
    return this.buffer.filter(e => !e.processed);
  }

  /** Get all events matching a topic */
  getByTopic(topic: string): LiveFeedEvent[] {
    const lower = topic.toLowerCase();
    return this.buffer.filter(e =>
      e.signal.topic.toLowerCase().includes(lower) ||
      e.signal.summary.toLowerCase().includes(lower)
    );

  }

  /** Get SCS-relevant events only */
  getSCSRelevant(): LiveFeedEvent[] {
    return this.buffer.filter(e => e.signal.scs_relevant && !e.processed);
  }

  /** Mark an event as processed */
  markProcessed(eventId: string): void {
    const event = this.buffer.find(e => e.event_id === eventId);
    if (event) event.processed = true;
  }

  /** Get feed stats */
  stats(): { total: number; unprocessed: number; scs_relevant: number; running: boolean } {
    return {
      total: this.buffer.length,
      unprocessed: this.getUnprocessed().length,
      scs_relevant: this.getSCSRelevant().length,
      running: this.running
    };
  }

  private pushEvent(event: LiveFeedEvent): void {
    if (this.buffer.length >= this.config.max_buffer_size) {
      this.buffer.shift(); // Drop oldest
    }
    this.buffer.push(event);

    // Notify handlers
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[voxight-live] handler error: ${(err as Error).message}`);
      }
    }
  }
}

// ── Smoke test ───────────────────────────────────────────────────────────────

if (require.main === module) {
  console.log('\n=== Voxight ORACLE-6 Module 2 — Live Feed Stub ===\n');

  const feed = new VoxightLiveFeed({ mock_mode: true });

  feed.onEvent((event) => {
    console.log(`  Event: ${event.event_type} — ${event.signal.topic} (confidence: ${event.signal.confidence})`);
  });

  feed.start();

  const stats = feed.stats();
  console.log(`\nStats: ${stats.total} total, ${stats.unprocessed} unprocessed, ${stats.scs_relevant} SCS-relevant`);

  const scs = feed.getSCSRelevant();
  console.log(`\nSCS-relevant events:`);
  for (const e of scs) {
    console.log(`  [${e.event_id}] ${e.signal.topic}`);
    feed.markProcessed(e.event_id);
  }

  console.log(`\nAfter processing: ${feed.getUnprocessed().length} unprocessed`);
  console.log('\n✅ PASS — Voxight Live Feed stub operational\n');
}
