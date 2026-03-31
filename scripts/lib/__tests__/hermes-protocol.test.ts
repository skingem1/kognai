/**
 * Hermes Protocol — Unit Tests
 * TICKET-032-A · 2026-03-31
 *
 * Zero-dependency — uses node:assert/strict.
 * Run:  npx ts-node scripts/lib/__tests__/hermes-protocol.test.ts
 * Exit: 0 = all pass, non-zero = failures
 *
 * Coverage targets:
 *   ✅ openExchange() — creates exchange with correct initial state
 *   ✅ continueExchange() — enforces 3-message cap
 *   ✅ ACK terminates exchange at any sequence
 *   ✅ 3 messages without ACK → status = 'escalated'
 *   ✅ isTerminal() — false for 'open', true for all closed states
 *   ✅ parseHermesMarkers() — detects all four marker types
 *   ✅ buildMessage() — constructs correct message base
 */

import assert from 'node:assert/strict';
import {
  openExchange,
  continueExchange,
  isTerminal,
  parseHermesMarkers,
  buildMessage,
  type HermesMarker,
  type HermesMessage,
  type HermesExchange,
  type ParsedMarker,
} from '../hermes-protocol';

// ── Test harness ──────────────────────────────────────────────────────────────

const ISO_NOW = '2026-03-31T09:00:00.000Z';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ ${name}`);
    console.error(`       ${msg}`);
    failures.push(`${name}: ${msg}`);
    failed++;
  }
}

function makeBase(
  marker: HermesMarker,
  fromAgent = 'macgyver',
  toAgent   = 'sherlock',
  payload   = 'test payload',
  sprintId  = 'SPRINT-042',
): Omit<HermesMessage, 'exchange_id' | 'sequence'> {
  return { from_agent: fromAgent, to_agent: toAgent, marker, payload, sprint_id: sprintId, created_at: ISO_NOW };
}

// ── Test suite ────────────────────────────────────────────────────────────────

// ─── openExchange() ──────────────────────────────────────────────────────────
console.log('\n◉  openExchange()');

test('creates exchange with sequence=1 and status=open for STATUS_REQUEST', () => {
  const ex = openExchange(makeBase('STATUS_REQUEST'));
  assert.equal(ex.messages.length, 1, 'should have exactly 1 message');
  assert.equal(ex.messages[0].sequence, 1, 'first message sequence should be 1');
  assert.equal(ex.status, 'open');
  assert.ok(ex.exchange_id && ex.exchange_id.length > 0, 'exchange_id should be non-empty UUID');
  assert.equal(ex.closed_at, undefined, 'open exchange should not have closed_at');
});

test('creates exchange with sequence=1 and status=open for REVIEW_REQUEST', () => {
  const ex = openExchange(makeBase('REVIEW_REQUEST'));
  assert.equal(ex.status, 'open');
  assert.equal(ex.messages[0].marker, 'REVIEW_REQUEST');
  assert.equal(ex.messages[0].from_agent, 'macgyver');
});

test('creates exchange with sequence=1 and status=open for ESCALATION_NOTICE', () => {
  const ex = openExchange(makeBase('ESCALATION_NOTICE'));
  assert.equal(ex.status, 'open');
  assert.equal(ex.messages[0].sequence, 1);
});

test('opening with ACK immediately sets status=acked', () => {
  const ex = openExchange(makeBase('ACK'));
  assert.equal(ex.status, 'acked', 'ACK as first message should immediately close exchange');
  assert.ok(ex.closed_at, 'closed_at should be set when ACK opens exchange');
  assert.equal(ex.messages[0].sequence, 1);
});

test('exchange_id is different for each call (UUID uniqueness)', () => {
  const ex1 = openExchange(makeBase('STATUS_REQUEST'));
  const ex2 = openExchange(makeBase('STATUS_REQUEST'));
  assert.notEqual(ex1.exchange_id, ex2.exchange_id, 'each exchange should have a unique ID');
});

test('initiating_sprint is stored when provided', () => {
  const ex = openExchange(makeBase('REVIEW_REQUEST'), 'SPRINT-099');
  assert.equal(ex.initiating_sprint, 'SPRINT-099');
});

test('initiating_sprint is undefined when not provided', () => {
  const ex = openExchange(makeBase('REVIEW_REQUEST'));
  // No sprintId arg → undefined
  assert.equal(ex.initiating_sprint, undefined);
});

test('opened_at matches first message created_at', () => {
  const ex = openExchange(makeBase('STATUS_REQUEST'));
  assert.equal(ex.opened_at, ex.messages[0].created_at);
});

// ─── continueExchange() — 3-message cap ──────────────────────────────────────
console.log('\n◉  continueExchange() — 3-message cap');

test('second message has sequence=2, status remains open', () => {
  const ex1 = openExchange(makeBase('REVIEW_REQUEST'));
  const ex2 = continueExchange(ex1, makeBase('STATUS_REQUEST'));
  assert.equal(ex2.messages.length, 2);
  assert.equal(ex2.messages[1].sequence, 2);
  assert.equal(ex2.status, 'open', 'still open after 2nd message without ACK');
  assert.equal(ex2.closed_at, undefined);
});

test('3rd message without ACK → status=escalated (3-message cap enforced)', () => {
  const ex1 = openExchange(makeBase('REVIEW_REQUEST'));
  const ex2 = continueExchange(ex1, makeBase('STATUS_REQUEST'));
  const ex3 = continueExchange(ex2, makeBase('STATUS_REQUEST')); // seq=3, no ACK
  assert.equal(ex3.messages.length, 3, 'should have 3 messages');
  assert.equal(ex3.messages[2].sequence, 3, 'third message sequence should be 3');
  assert.equal(ex3.status, 'escalated', '3 messages without ACK → escalated');
  assert.ok(ex3.closed_at, 'closed_at must be set on escalation');
});

test('cannot add 4th message to escalated exchange (idempotent, cap enforced)', () => {
  const ex1 = openExchange(makeBase('REVIEW_REQUEST'));
  const ex2 = continueExchange(ex1, makeBase('STATUS_REQUEST'));
  const ex3 = continueExchange(ex2, makeBase('STATUS_REQUEST')); // escalated
  const ex4 = continueExchange(ex3, makeBase('ACK'));            // should be ignored
  assert.equal(ex4.messages.length, 3, '4th message must be silently rejected');
  assert.equal(ex4.status, 'escalated', 'status must remain escalated');
});

test('original exchange object is not mutated by continueExchange', () => {
  const ex1 = openExchange(makeBase('REVIEW_REQUEST'));
  continueExchange(ex1, makeBase('STATUS_REQUEST'));
  // ex1 should still have 1 message
  assert.equal(ex1.messages.length, 1, 'continueExchange should not mutate original');
  assert.equal(ex1.status, 'open');
});

test('exchange_id is preserved across continue calls', () => {
  const ex1 = openExchange(makeBase('REVIEW_REQUEST'));
  const ex2 = continueExchange(ex1, makeBase('STATUS_REQUEST'));
  const ex3 = continueExchange(ex2, makeBase('STATUS_REQUEST'));
  assert.equal(ex2.exchange_id, ex1.exchange_id, 'exchange_id must not change');
  assert.equal(ex3.exchange_id, ex1.exchange_id, 'exchange_id must not change');
  assert.equal(ex2.messages[1].exchange_id, ex1.exchange_id, 'message exchange_id must match');
});

// ─── ACK terminates early ─────────────────────────────────────────────────────
console.log('\n◉  ACK terminates early');

test('ACK at sequence=2 sets status=acked and closed_at', () => {
  const ex1 = openExchange(makeBase('REVIEW_REQUEST'));
  const ex2 = continueExchange(ex1, makeBase('ACK'));
  assert.equal(ex2.status, 'acked');
  assert.equal(ex2.messages.length, 2);
  assert.equal(ex2.messages[1].sequence, 2);
  assert.ok(ex2.closed_at, 'closed_at should be set when ACK received');
});

test('ACK at sequence=3 sets status=acked (not escalated)', () => {
  const ex1 = openExchange(makeBase('REVIEW_REQUEST'));
  const ex2 = continueExchange(ex1, makeBase('STATUS_REQUEST'));
  const ex3 = continueExchange(ex2, makeBase('ACK')); // ACK at seq 3 → acked, not escalated
  assert.equal(ex3.status, 'acked', 'ACK at seq 3 must be acked, not escalated');
  assert.equal(ex3.messages.length, 3);
  assert.equal(ex3.messages[2].marker, 'ACK');
});

test('cannot add message after ACK (idempotent)', () => {
  const ex1 = openExchange(makeBase('REVIEW_REQUEST'));
  const ex2 = continueExchange(ex1, makeBase('ACK'));        // acked
  const ex3 = continueExchange(ex2, makeBase('STATUS_REQUEST')); // must be ignored
  assert.equal(ex3.messages.length, 2, 'no message should be added after ACK');
  assert.equal(ex3.status, 'acked', 'status must stay acked');
});

// ─── isTerminal() ─────────────────────────────────────────────────────────────
console.log('\n◉  isTerminal()');

test('open exchange is NOT terminal', () => {
  const ex = openExchange(makeBase('REVIEW_REQUEST'));
  assert.equal(isTerminal(ex), false);
});

test('acked exchange IS terminal', () => {
  const ex = openExchange(makeBase('ACK'));
  assert.equal(isTerminal(ex), true);
});

test('escalated exchange IS terminal', () => {
  const ex1 = openExchange(makeBase('REVIEW_REQUEST'));
  const ex2 = continueExchange(ex1, makeBase('STATUS_REQUEST'));
  const ex3 = continueExchange(ex2, makeBase('STATUS_REQUEST')); // escalated
  assert.equal(isTerminal(ex3), true);
});

test('expired exchange IS terminal', () => {
  // Manually construct an expired exchange (not producible via state machine yet, but type is valid)
  const ex: HermesExchange = {
    exchange_id: 'fake-uuid',
    status:      'expired',
    messages:    [],
    opened_at:   ISO_NOW,
    closed_at:   ISO_NOW,
  };
  assert.equal(isTerminal(ex), true);
});

// ─── parseHermesMarkers() ─────────────────────────────────────────────────────
console.log('\n◉  parseHermesMarkers()');

test('detects [REVIEW_REQUEST] with payload', () => {
  const text = '[REVIEW_REQUEST] Reviewing sprint SPRINT-042 — TypeScript compliance.';
  const markers = parseHermesMarkers(text);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].marker, 'REVIEW_REQUEST');
  assert.match(markers[0].payload, /TypeScript/);
});

test('detects [ACK] with payload', () => {
  const text = '[ACK] Sprint SPRINT-042 APPROVED. Score 88/100. All criteria met.';
  const markers = parseHermesMarkers(text);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].marker, 'ACK');
});

test('detects [STATUS_REQUEST] with default routing to sherlock', () => {
  const text = '[STATUS_REQUEST] What is the status of TICKET-031?';
  const markers = parseHermesMarkers(text);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].marker, 'STATUS_REQUEST');
  assert.equal(markers[0].to_agent, 'sherlock', 'STATUS_REQUEST default target is sherlock');
});

test('detects [ESCALATION_NOTICE] with default routing to godman', () => {
  const text = '[ESCALATION_NOTICE] Hardcoded secret found in payments.ts:47.';
  const markers = parseHermesMarkers(text);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].marker, 'ESCALATION_NOTICE');
  assert.equal(markers[0].to_agent, 'godman', 'ESCALATION_NOTICE default target is godman');
});

test('explicit to= attribute overrides default routing', () => {
  const text = '[STATUS_REQUEST to="macgyver"] What is the current clip count?';
  const markers = parseHermesMarkers(text);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].to_agent, 'macgyver', 'explicit to= should override default');
});

test('returns empty array when no markers present', () => {
  const text = 'This is a normal review output. APPROVED. Score: 92. No issues found.';
  const markers = parseHermesMarkers(text);
  assert.equal(markers.length, 0);
});

test('returns empty array for empty string', () => {
  assert.equal(parseHermesMarkers('').length, 0);
});

test('case-insensitive marker detection', () => {
  const text = '[review_request] some payload here';
  const markers = parseHermesMarkers(text);
  assert.equal(markers.length, 1, 'should detect lowercase marker');
  assert.equal(markers[0].marker, 'REVIEW_REQUEST', 'marker should be normalized to uppercase');
});

// ─── buildMessage() ──────────────────────────────────────────────────────────
console.log('\n◉  buildMessage()');

test('builds message base from ParsedMarker', () => {
  const parsed: ParsedMarker = {
    marker:     'REVIEW_REQUEST',
    to_agent:   'sherlock',
    payload:    'Reviewing SPRINT-042.',
    raw_match:  '[REVIEW_REQUEST] Reviewing SPRINT-042.',
  };
  const msg = buildMessage(parsed, 'macgyver', 'SPRINT-042');
  assert.equal(msg.from_agent,  'macgyver');
  assert.equal(msg.to_agent,    'sherlock');
  assert.equal(msg.marker,      'REVIEW_REQUEST');
  assert.equal(msg.payload,     'Reviewing SPRINT-042.');
  assert.equal(msg.sprint_id,   'SPRINT-042');
  assert.ok(msg.created_at,     'created_at should be set');
  // exchange_id and sequence are NOT present (Omit)
  assert.equal(('exchange_id' in msg), false, 'exchange_id should not be in base message');
});

// ── Final summary ──────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
const total = passed + failed;
console.log(`Hermes Protocol Tests: ${total} total | ✅ ${passed} passed | ❌ ${failed} failed`);

if (failed > 0) {
  console.error('\nFailed tests:');
  failures.forEach((f, i) => console.error(`  ${i + 1}. ${f}`));
  process.exit(1);
} else {
  console.log('All tests passed. ✅\n');
  process.exit(0);
}
