/**
 * SCORE smoke test — rubric, evaluation, reputation, audit
 * Run: npx tsx smoke.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  createRubric,
  evaluate,
  calculateReputation,
  createAuditEntry,
  SCORE_VERSION,
} from './src/index.js';

let passed = 0;
const SECRET = 'test-signing-secret';

// --- Version ---
assert.equal(SCORE_VERSION, '0.2');
passed++;
console.log('✓ SCORE_VERSION is 0.2');

// --- createRubric ---
const rubric = createRubric('Code Quality', [
  { name: 'Correctness', description: 'Does it work?', weight: 0.4 },
  { name: 'Readability', description: 'Is it readable?', weight: 0.3 },
  { name: 'Performance', description: 'Is it fast?', weight: 0.3 },
]);
assert.equal(rubric.name, 'Code Quality');
assert.equal(rubric.criteria.length, 3);
assert.ok(rubric.criteria[0].id); // auto-generated
passed++;
console.log('✓ createRubric: basic creation');

try {
  createRubric('Bad', [
    { name: 'A', description: 'a', weight: 0.5 },
    { name: 'B', description: 'b', weight: 0.3 },
  ]); // sum = 0.8
  assert.fail('should throw');
} catch (e: any) {
  assert.ok(e.message.includes('sum to 1.0'));
}
passed++;
console.log('✓ createRubric: rejects bad weights');

try {
  createRubric('Empty', []);
  assert.fail('should throw');
} catch (e: any) {
  assert.ok(e.message.includes('at least one'));
}
passed++;
console.log('✓ createRubric: rejects empty criteria');

// --- evaluate ---
const scores: Record<string, number> = {};
scores[rubric.criteria[0].id] = 0.9; // Correctness
scores[rubric.criteria[1].id] = 0.8; // Readability
scores[rubric.criteria[2].id] = 0.7; // Performance

const ev = evaluate(rubric, 'did:kognai:messi', 'task-123', scores, 'did:kognai:sherlock', SECRET);
assert.equal(ev.agentId, 'did:kognai:messi');
assert.equal(ev.rubricId, rubric.id);
// Composite: 0.9*0.4 + 0.8*0.3 + 0.7*0.3 = 0.36 + 0.24 + 0.21 = 0.81
assert.ok(Math.abs(ev.compositeScore - 0.81) < 0.001);
assert.ok(ev.signature.length > 0);
passed++;
console.log('✓ evaluate: weighted composite calculation');

try {
  const partial: Record<string, number> = {};
  partial[rubric.criteria[0].id] = 0.9;
  // Missing other criteria
  evaluate(rubric, 'agent-1', 'out-1', partial, 'human', SECRET);
  assert.fail('should throw');
} catch (e: any) {
  assert.ok(e.message.includes('Missing score'));
}
passed++;
console.log('✓ evaluate: rejects missing criterion scores');

try {
  const bad: Record<string, number> = {};
  bad[rubric.criteria[0].id] = 1.5; // out of range
  bad[rubric.criteria[1].id] = 0.8;
  bad[rubric.criteria[2].id] = 0.7;
  evaluate(rubric, 'agent-1', 'out-1', bad, 'human', SECRET);
  assert.fail('should throw');
} catch (e: any) {
  assert.ok(e.message.includes('0.0–1.0'));
}
passed++;
console.log('✓ evaluate: rejects out-of-range scores');

// --- calculateReputation ---
const ev2Scores: Record<string, number> = {};
ev2Scores[rubric.criteria[0].id] = 0.6;
ev2Scores[rubric.criteria[1].id] = 0.5;
ev2Scores[rubric.criteria[2].id] = 0.4;
const ev2 = evaluate(rubric, 'did:kognai:messi', 'task-456', ev2Scores, 'human', SECRET);

const rep = calculateReputation('did:kognai:messi', [ev, ev2]);
assert.equal(rep.agentId, 'did:kognai:messi');
assert.equal(rep.evaluationCount, 2);
// Both evaluations are very recent, so decay ~= 1.0, average ~= (0.81 + 0.51) / 2 = 0.66
assert.ok(rep.score > 0.6 && rep.score < 0.7, `Expected ~0.66, got ${rep.score}`);
passed++;
console.log('✓ calculateReputation: time-decayed average');

const emptyRep = calculateReputation('did:kognai:unknown', [ev]);
assert.equal(emptyRep.evaluationCount, 0);
assert.equal(emptyRep.score, 0);
passed++;
console.log('✓ calculateReputation: empty for unknown agent');

// --- createAuditEntry ---
const audit = createAuditEntry(ev, SECRET);
assert.equal(audit.evaluationId, ev.id);
assert.equal(audit.agentId, 'did:kognai:messi');
assert.ok(Math.abs(audit.compositeScore - 0.81) < 0.001);
assert.ok(audit.signature.length > 0);
passed++;
console.log('✓ createAuditEntry: signed audit trail');

console.log(`\n✅ All ${passed} SCORE smoke tests passed`);
