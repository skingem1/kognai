/**
 * SDK Smoke Test — verify all 7 protocols accessible from unified import
 */

import {
  // PACT
  createMandate, hashMandate, signMandate, verifyMandate,
  openFrame, closeFrame, MandateRegistry, PACT_VERSION,
  // LAX
  createBudget, createProbe, routeTask, registerSLA, checkSLACompliance, LAX_VERSION,
  // SCORE
  createRubric, evaluate, calculateReputation, createAuditEntry, SCORE_VERSION,
  // SIGNAL
  EventBus, createEvent, topicMatches, SIGNAL_VERSION,
  // SOUL
  createConstitution, signConstitution, evaluateAction, checkKillSwitches, createAudit, SOUL_VERSION,
  // AMF
  createEnvelope, verifyEnvelope, taskRequest, heartbeat, AMF_VERSION,
  // DRS
  ResourceScheduler, DRS_VERSION,
  // Namespaced
  pact, lax, score, signal, soul, amf, drs,
  // SDK
  SDK_VERSION,
} from './src/index.js';

let pass = 0;
let fail = 0;

function assert(label: string, condition: boolean) {
  if (condition) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}

console.log('SDK Smoke Test\n');

// Version constants
assert('SDK_VERSION is 0.2.0', SDK_VERSION === '0.2.0');
assert('PACT_VERSION exists', typeof PACT_VERSION === 'string');
assert('LAX_VERSION exists', typeof LAX_VERSION === 'string');
assert('SCORE_VERSION exists', typeof SCORE_VERSION === 'string');
assert('SIGNAL_VERSION exists', typeof SIGNAL_VERSION === 'string');
assert('SOUL_VERSION exists', typeof SOUL_VERSION === 'string');
assert('AMF_VERSION exists', typeof AMF_VERSION === 'string');
assert('DRS_VERSION exists', typeof DRS_VERSION === 'string');

// PACT functions
assert('createMandate is function', typeof createMandate === 'function');
assert('hashMandate is function', typeof hashMandate === 'function');
assert('signMandate is function', typeof signMandate === 'function');
assert('verifyMandate is function', typeof verifyMandate === 'function');
assert('openFrame is function', typeof openFrame === 'function');
assert('MandateRegistry is function', typeof MandateRegistry === 'function');

// LAX functions
assert('createBudget is function', typeof createBudget === 'function');
assert('routeTask is function', typeof routeTask === 'function');
assert('registerSLA is function', typeof registerSLA === 'function');

// SCORE functions
assert('createRubric is function', typeof createRubric === 'function');
assert('evaluate is function', typeof evaluate === 'function');
assert('calculateReputation is function', typeof calculateReputation === 'function');

// SIGNAL functions
assert('EventBus is function', typeof EventBus === 'function');
assert('createEvent is function', typeof createEvent === 'function');

// SOUL functions
assert('createConstitution is function', typeof createConstitution === 'function');
assert('evaluateAction is function', typeof evaluateAction === 'function');
assert('checkKillSwitches is function', typeof checkKillSwitches === 'function');

// AMF functions
assert('createEnvelope is function', typeof createEnvelope === 'function');
assert('verifyEnvelope is function', typeof verifyEnvelope === 'function');
assert('taskRequest is function', typeof taskRequest === 'function');

// DRS
assert('ResourceScheduler is function', typeof ResourceScheduler === 'function');

// Namespaced
assert('pact namespace has createMandate', typeof pact.createMandate === 'function');
assert('lax namespace has createBudget', typeof lax.createBudget === 'function');
assert('score namespace has evaluate', typeof score.evaluate === 'function');
assert('signal namespace has EventBus', typeof signal.EventBus === 'function');
assert('soul namespace has evaluateAction', typeof soul.evaluateAction === 'function');
assert('amf namespace has createEnvelope', typeof amf.createEnvelope === 'function');
assert('drs namespace has ResourceScheduler', typeof drs.ResourceScheduler === 'function');

console.log(`\n${pass}/${pass + fail} PASS${fail > 0 ? ` (${fail} FAILED)` : ''}`);
process.exit(fail > 0 ? 1 : 0);
