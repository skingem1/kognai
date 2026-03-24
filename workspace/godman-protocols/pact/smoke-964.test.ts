import { openFrame, closeFrame, abortFrame, addParticipant, addMandateToFrame, CoordinationError } from './src/coordinator.js';
import { MandateRegistry } from './src/registry.js';
import { createMandate, signMandate } from './src/core.js';

const SECRET = 'test-secret';

// Test CoordinationFrame
const f = openFrame('harvey', ['mandate-001']);
console.assert(f.status === 'open', 'FAIL: frame should be open');
console.assert(f.initiator === 'harvey', 'FAIL: initiator');
console.assert(f.participants.includes('harvey'), 'FAIL: initiator in participants');
console.log('1. openFrame: PASS');

const f2 = addParticipant(f, 'messi');
console.assert(f2.participants.length === 2, 'FAIL: 2 participants');
console.assert(addParticipant(f2, 'messi').participants.length === 2, 'FAIL: idempotent');
console.log('2. addParticipant: PASS');

const f3 = addMandateToFrame(f2, 'mandate-002');
console.assert(f3.mandateIds.length === 2, 'FAIL: 2 mandates');
console.log('3. addMandateToFrame: PASS');

const closed = closeFrame(f3);
console.assert(closed.status === 'closed', 'FAIL: closed');
console.assert(closed.closedAt !== null, 'FAIL: closedAt set');
console.log('4. closeFrame: PASS');

// Cannot close already closed
try {
  closeFrame(closed);
  console.log('5. double-close guard: FAIL (should have thrown)');
} catch (e) {
  console.assert((e as any).code === 'FRAME_NOT_OPEN', 'FAIL: error code');
  console.log('5. double-close guard: PASS');
}

const aborted = abortFrame(openFrame('harvey'));
console.assert(aborted.status === 'aborted', 'FAIL: aborted');
console.log('6. abortFrame: PASS');

// Test MandateRegistry
const reg = new MandateRegistry();
const m = signMandate(createMandate('harvey', 'messi', {
  description: 'test', actions: ['read'], resources: ['*'], maxPaymentUsdc: null
}), SECRET);
reg.store(m);
console.assert(reg.has(m.id), 'FAIL: has');
console.assert(reg.get(m.id)?.id === m.id, 'FAIL: get');
console.assert(reg.list({ grantor: 'harvey' }).length === 1, 'FAIL: list grantor');
console.assert(reg.list({ grantee: 'sherlock' }).length === 0, 'FAIL: list grantee empty');
console.log('7. MandateRegistry store/get/list: PASS');

console.assert(!reg.isRevoked(m.id), 'FAIL: not revoked');
reg.addRevocation({ mandateId: m.id, revokedBy: 'harvey', revokedAt: new Date().toISOString(), signature: 'sig' });
console.assert(reg.isRevoked(m.id), 'FAIL: revoked');
console.log('8. MandateRegistry revocation: PASS');

const snap = reg.snapshot();
const reg2 = new MandateRegistry();
reg2.loadSnapshot(snap.mandates, snap.revocations);
console.assert(reg2.size === 1, 'FAIL: snapshot restore');
console.log('9. MandateRegistry snapshot: PASS');

console.log('PACT-964 smoke: ALL PASS (9/9)');
