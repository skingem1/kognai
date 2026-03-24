/**
 * AMF smoke test — envelope, sign, verify, payload helpers
 * Run: npx tsx smoke.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  createEnvelope,
  verifyEnvelope,
  taskRequest,
  taskResult,
  event,
  heartbeat,
  error,
  AMF_VERSION,
} from './src/index.js';

let passed = 0;
const SECRET = 'test-sender-secret';

// --- Version ---
assert.equal(AMF_VERSION, '0.2');
passed++;
console.log('✓ AMF_VERSION is 0.2');

// --- Payload builders ---
const tr = taskRequest('task-1', 'Build feature X', { code: true });
assert.equal(tr.type, 'task-request');
assert.equal(tr.taskId, 'task-1');
passed++;
console.log('✓ taskRequest: basic');

const res = taskResult('task-1', 'success', { files: ['a.ts'] });
assert.equal(res.type, 'task-result');
assert.equal(res.status, 'success');
passed++;
console.log('✓ taskResult: basic');

const ev = event('pipeline.completed', { pipelineId: 'p-1' });
assert.equal(ev.type, 'event');
assert.equal(ev.topic, 'pipeline.completed');
passed++;
console.log('✓ event: basic');

const hb = heartbeat('alive', 0.3);
assert.equal(hb.type, 'heartbeat');
assert.equal(hb.status, 'alive');
assert.equal(hb.load, 0.3);
passed++;
console.log('✓ heartbeat: basic');

const err = error('TIMEOUT', 'Task timed out', 'msg-123');
assert.equal(err.type, 'error');
assert.equal(err.code, 'TIMEOUT');
assert.equal(err.relatedMessageId, 'msg-123');
passed++;
console.log('✓ error: basic');

// --- createEnvelope + verifyEnvelope ---
const envelope = createEnvelope('did:kognai:messi', 'did:kognai:harvey', tr, SECRET);
assert.equal(envelope.amf, '0.1');
assert.equal(envelope.sender, 'did:kognai:messi');
assert.equal(envelope.recipient, 'did:kognai:harvey');
assert.equal(envelope.payload.type, 'task-request');
assert.ok(envelope.signature.length > 0);
assert.ok(envelope.id);
passed++;
console.log('✓ createEnvelope: signed envelope');

const valid = verifyEnvelope(envelope, SECRET);
assert.equal(valid, true);
passed++;
console.log('✓ verifyEnvelope: valid signature');

const tampered = { ...envelope, sender: 'did:kognai:evil' };
const invalid = verifyEnvelope(tampered, SECRET);
assert.equal(invalid, false);
passed++;
console.log('✓ verifyEnvelope: rejects tampered envelope');

const wrongSecret = verifyEnvelope(envelope, 'wrong-secret');
assert.equal(wrongSecret, false);
passed++;
console.log('✓ verifyEnvelope: rejects wrong secret');

// --- Broadcast (null recipient) ---
const broadcast = createEnvelope('did:kognai:messi', null, hb, SECRET);
assert.equal(broadcast.recipient, null);
assert.ok(verifyEnvelope(broadcast, SECRET));
passed++;
console.log('✓ createEnvelope: broadcast (null recipient)');

console.log(`\n✅ All ${passed} AMF smoke tests passed`);
