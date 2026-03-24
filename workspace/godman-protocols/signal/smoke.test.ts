/**
 * SIGNAL smoke test — event bus, pub/sub, glob matching, dedup, receipts
 * Run: npx tsx smoke.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  EventBus,
  createEvent,
  topicMatches,
  SIGNAL_VERSION,
} from './src/index.js';
import type { Event } from './src/types.js';

let passed = 0;
const SECRET = 'test-signing-secret';

// --- Version ---
assert.equal(SIGNAL_VERSION, '0.2');
passed++;
console.log('✓ SIGNAL_VERSION is 0.2');

// --- topicMatches ---
assert.ok(topicMatches('task.completed', 'task.completed'));
assert.ok(!topicMatches('task.completed', 'task.failed'));
assert.ok(topicMatches('task.*', 'task.completed'));
assert.ok(topicMatches('task.*', 'task.failed'));
assert.ok(!topicMatches('task.*', 'task.sub.deep'));
assert.ok(topicMatches('**', 'task.completed'));
assert.ok(topicMatches('**', 'a.b.c.d'));
assert.ok(topicMatches('task.**', 'task.sub.deep'));
assert.ok(topicMatches('task.**', 'task'));
passed++;
console.log('✓ topicMatches: exact, wildcard, glob');

// --- createEvent ---
const ev = createEvent('did:kognai:messi', 'task.completed', { result: 'ok' }, SECRET);
assert.ok(ev.id);
assert.equal(ev.topic, 'task.completed');
assert.equal(ev.publisher, 'did:kognai:messi');
assert.ok(ev.signature.length > 0);
assert.equal(ev.idempotencyKey, ev.id); // default
passed++;
console.log('✓ createEvent: basic event creation');

const customEv = createEvent('agent-1', 'test', {}, SECRET, { idempotencyKey: 'custom-key' });
assert.equal(customEv.idempotencyKey, 'custom-key');
passed++;
console.log('✓ createEvent: custom idempotency key');

// --- EventBus: basic pub/sub ---
const bus = new EventBus();
const received: Event[] = [];
const sub = bus.subscribe('did:kognai:sherlock', 'task.*', (event) => {
  received.push(event);
});
assert.ok(sub.id);
assert.equal(sub.subscriberAgent, 'did:kognai:sherlock');
assert.equal(sub.topicFilter, 'task.*');
assert.equal(bus.subscriptionCount, 1);
passed++;
console.log('✓ subscribe: basic');

const event1 = createEvent('did:kognai:messi', 'task.completed', { id: 1 }, SECRET);
const receipts1 = await bus.publish(event1);
assert.equal(receipts1.length, 1);
assert.equal(receipts1[0].status, 'processed');
assert.equal(received.length, 1);
assert.equal(received[0].id, event1.id);
passed++;
console.log('✓ publish: delivers to matching subscriber');

// Non-matching topic
const event2 = createEvent('did:kognai:messi', 'mandate.revoked', { id: 2 }, SECRET);
const receipts2 = await bus.publish(event2);
assert.equal(receipts2.length, 0); // no match
assert.equal(received.length, 1); // unchanged
passed++;
console.log('✓ publish: skips non-matching topics');

// --- Idempotency ---
const dupeReceipts = await bus.publish(event1); // same idempotency key
assert.equal(dupeReceipts.length, 1);
assert.equal(dupeReceipts[0].status, 'duplicate-skipped');
assert.equal(received.length, 1); // not delivered again
passed++;
console.log('✓ publish: deduplicates by idempotency key');

// --- Unsubscribe ---
bus.unsubscribe(sub.id);
assert.equal(bus.subscriptionCount, 0);
const event3 = createEvent('did:kognai:messi', 'task.started', { id: 3 }, SECRET);
const receipts3 = await bus.publish(event3);
assert.equal(receipts3.length, 0);
assert.equal(received.length, 1); // unchanged
passed++;
console.log('✓ unsubscribe: stops delivery');

// --- Multiple subscribers ---
const bus2 = new EventBus();
const r1: Event[] = [];
const r2: Event[] = [];
bus2.subscribe('agent-a', 'task.*', (e) => r1.push(e));
bus2.subscribe('agent-b', '**', (e) => r2.push(e));
const ev4 = createEvent('publisher', 'task.done', {}, SECRET);
const receipts4 = await bus2.publish(ev4);
assert.equal(receipts4.length, 2);
assert.equal(r1.length, 1);
assert.equal(r2.length, 1);
passed++;
console.log('✓ publish: delivers to multiple subscribers');

// --- Failed handler ---
const bus3 = new EventBus();
bus3.subscribe('agent-c', 'error.*', () => { throw new Error('boom'); });
const ev5 = createEvent('publisher', 'error.test', {}, SECRET);
const receipts5 = await bus3.publish(ev5);
assert.equal(receipts5.length, 1);
assert.equal(receipts5[0].status, 'failed');
passed++;
console.log('✓ publish: handles failed delivery gracefully');

// --- Receipts ---
const allReceipts = bus.getReceipts();
assert.ok(allReceipts.length >= 2); // at least original + dupe
passed++;
console.log('✓ getReceipts: returns delivery history');

console.log(`\n✅ All ${passed} SIGNAL smoke tests passed`);
