/**
 * SOUL smoke test — constitution, evaluation, kill switches, audit
 * Run: npx tsx smoke.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  createConstitution,
  signConstitution,
  evaluateAction,
  checkKillSwitches,
  createAudit,
  SOUL_VERSION,
} from './src/index.js';
import type { Constitution } from './src/types.js';

let passed = 0;
const SECRET = 'operator-secret-key';

// --- Version ---
assert.equal(SOUL_VERSION, '0.2');
passed++;
console.log('✓ SOUL_VERSION is 0.2');

// --- createConstitution ---
const raw = createConstitution(
  'operator-tarek',
  [
    { name: 'Allow SCS reads', description: 'Agents may read SCS workspace', action: 'allow', enforcementLevel: 'hard', scope: 'read:workspace/scs001/*', bootstrapped: true },
    { name: 'Allow SCS writes', description: 'Agents may write SCS workspace', action: 'allow', enforcementLevel: 'hard', scope: 'write:workspace/scs001/*', bootstrapped: true },
    { name: 'Deny secrets', description: 'No agent may read .env files', action: 'deny', enforcementLevel: 'hard', scope: 'read:*.env*', bootstrapped: true },
    { name: 'Allow billing', description: 'Billing actions allowed', action: 'allow', enforcementLevel: 'soft', scope: 'billing:*', bootstrapped: false },
  ],
  [
    { name: 'Low views', triggerCondition: 'views_per_30_posts < 500', action: 'halt' },
    { name: 'Memory overload', triggerCondition: 'memory_gb > 22', action: 'pause' },
  ]
);
assert.equal(raw.operatorId, 'operator-tarek');
assert.equal(raw.constraints.length, 4);
assert.equal(raw.killSwitches.length, 2);
assert.ok(raw.constraints[0].id); // auto-generated
assert.equal(raw.killSwitches[0].nonNegotiable, true);
assert.equal(raw.signature, '');
passed++;
console.log('✓ createConstitution: basic creation');

// --- signConstitution ---
const constitution = signConstitution(raw as Constitution, SECRET);
assert.ok(constitution.signature.length > 0);
passed++;
console.log('✓ signConstitution: operator signs');

// --- evaluateAction: allow ---
const r1 = evaluateAction(constitution, 'did:kognai:messi', 'read:workspace/scs001/pipeline.json');
assert.equal(r1.allowed, true);
assert.ok(r1.reason.includes('Allow SCS reads'));
passed++;
console.log('✓ evaluateAction: allows matching scope');

// --- evaluateAction: deny overrides allow ---
const r2 = evaluateAction(constitution, 'did:kognai:messi', 'read:*.env.local');
assert.equal(r2.allowed, false);
assert.ok(r2.reason.includes('Deny secrets'));
passed++;
console.log('✓ evaluateAction: deny overrides allow');

// --- evaluateAction: default deny ---
const r3 = evaluateAction(constitution, 'did:kognai:messi', 'delete:database');
assert.equal(r3.allowed, false);
assert.ok(r3.reason.includes('denied by default'));
passed++;
console.log('✓ evaluateAction: default deny (no matching constraint)');

// --- evaluateAction: soft enforcement ---
const r4 = evaluateAction(constitution, 'did:kognai:satoshi', 'billing:charge');
assert.equal(r4.allowed, true);
assert.equal(r4.enforcementLevel, 'soft');
passed++;
console.log('✓ evaluateAction: soft enforcement level preserved');

// --- checkKillSwitches: no trigger ---
const ks1 = checkKillSwitches(constitution, { views_per_30_posts: 1000, memory_gb: 18 });
assert.equal(ks1, null);
passed++;
console.log('✓ checkKillSwitches: no trigger when metrics OK');

// --- checkKillSwitches: low views trigger ---
const ks2 = checkKillSwitches(constitution, { views_per_30_posts: 200, memory_gb: 18 });
assert.ok(ks2 !== null);
assert.equal(ks2!.name, 'Low views');
assert.equal(ks2!.action, 'halt');
assert.equal(ks2!.nonNegotiable, true);
passed++;
console.log('✓ checkKillSwitches: triggers on low views');

// --- checkKillSwitches: memory overload ---
const ks3 = checkKillSwitches(constitution, { views_per_30_posts: 1000, memory_gb: 25 });
assert.ok(ks3 !== null);
assert.equal(ks3!.name, 'Memory overload');
assert.equal(ks3!.action, 'pause');
passed++;
console.log('✓ checkKillSwitches: triggers on memory overload');

// --- createAudit ---
const audit = createAudit('did:kognai:messi', 'read:workspace/scs001/pipeline.json', r1);
assert.ok(audit.id);
assert.equal(audit.agentId, 'did:kognai:messi');
assert.equal(audit.evaluation.allowed, true);
passed++;
console.log('✓ createAudit: audit trail entry');

console.log(`\n✅ All ${passed} SOUL smoke tests passed`);
