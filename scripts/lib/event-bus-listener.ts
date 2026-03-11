import * as https from 'https';
import { KognaiEvent, KognaiEventType } from './event-bus-types';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const POLL_INTERVAL_MS = 30000;
const RING_BUFFER_SIZE = 500;

interface Subscription {
  id: string;
  filter: { event_types?: KognaiEventType[]; agent_id?: string; sprint?: string };
  handler: (event: KognaiEvent) => void;
  interval: NodeJS.Timeout;
}

const ringBuffer: KognaiEvent[] = [];
const seenEvents = new Set<string>();
const subscriptions = new Map<string, Subscription>();
let subscriptionCounter = 0;

function addToRingBuffer(event: KognaiEvent): void {
  ringBuffer.unshift(event);
  if (ringBuffer.length > RING_BUFFER_SIZE) {
    ringBuffer.pop();
  }
}

function getEventKey(event: KognaiEvent): string {
  return `${event.inserted_at}:${event.event_type}`;
}

function fetchEvents(): Promise<KognaiEvent[]> {
  return new Promise((resolve) => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      resolve([]);
      return;
    }

    const url = new URL(
      `/rest/v1/kognai_events?order=inserted_at.desc&limit=20`,
      SUPABASE_URL
    );

    const options = {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    https
      .get(url.toString(), options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const events = JSON.parse(data) as KognaiEvent[];
            resolve(Array.isArray(events) ? events : []);
          } catch {
            resolve([]);
          }
        });
      })
      .on('error', () => {
        resolve([]);
      });
  });
}

function matchesFilter(
  event: KognaiEvent,
  filter: { event_types?: KognaiEventType[]; agent_id?: string; sprint?: string }
): boolean {
  if (filter.event_types && !filter.event_types.includes(event.event_type)) {
    return false;
  }
  if (filter.agent_id && event.agent_id !== filter.agent_id) {
    return false;
  }
  if (filter.sprint && event.sprint !== filter.sprint) {
    return false;
  }
  return true;
}

async function pollAndDeliver(subscription: Subscription): Promise<void> {
  try {
    const events = await fetchEvents();
    for (const event of events) {
      const key = getEventKey(event);
      if (!seenEvents.has(key)) {
        seenEvents.add(key);
        addToRingBuffer(event);
        if (matchesFilter(event, subscription.filter)) {
          subscription.handler(event);
        }
      }
    }
  } catch {
    // Silently ignore polling errors, retry on next tick
  }
}

export function subscribeToEvents(
  filter: { event_types?: KognaiEventType[]; agent_id?: string; sprint?: string },
  handler: (event: KognaiEvent) => void
): () => void {
  const id = `sub-${++subscriptionCounter}`;
  const interval = setInterval(() => {
    pollAndDeliver({ id, filter, handler, interval });
  }, POLL_INTERVAL_MS);

  const subscription: Subscription = { id, filter, handler, interval };
  subscriptions.set(id, subscription);

  // Immediate poll on subscribe
  pollAndDeliver(subscription);

  return () => {
    clearInterval(interval);
    subscriptions.delete(id);
  };
}

export function getEventLog(): readonly KognaiEvent[] {
  return Object.freeze([...ringBuffer]);
}

export function getActiveSubscriptionCount(): number {
  return subscriptions.size;
}