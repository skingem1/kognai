#!/bin/bash
clear
printf '%s\n' '╔══════════════════════════════════════════════════════╗
║  Godman Protocols v0.2.0 — Full Stack Demo           ║
║  7 protocols. 1 workflow. Real multi-agent system.   ║
╚══════════════════════════════════════════════════════╝
'
sleep 1.50
printf '%s\n' '
# SOUL — Constitutional engine
const constitution = soul.createConstitution('\''operator'\'', [
  { name: '\''Allow delegation'\'', action: '\''allow'\'', scope: '\''delegate:*'\'' }
], [...killSwitches]);
console.log(soul.evaluateAction(constitution, '\''ceo'\'', '\''delegate:task'\''));
'
sleep 0.80
printf '%s\n' '{ allowed: true, matchedRule: '\''Allow delegation'\'', scope: '\''delegate:*'\'' }
'
sleep 1.20
printf '%s\n' '
# PACT — Mandate lifecycle
const mandate = pact.createMandate('\''ceo'\'', '\''coder'\'', {
  description: '\''Write Sprint 1011 code'\'',
  permissions: ['\''write:workspace/*'\''],
  ttlMs: 3600000
});
console.log('\''Mandate:'\'', mandate.id.slice(0,12)+'\''...'\'', '\''| valid:'\'', pact.verifyMandate(mandate).valid);
'
sleep 0.80
printf '%s\n' 'Mandate: mnd-a3f8bc12... | valid: true
'
sleep 1.20
printf '%s\n' '
# AMF — Agent Message Format
const msg = amf.createEnvelope({
  from: '\''ceo'\'', to: '\''coder'\'', type: '\''task'\'',
  payload: { task: '\''implement-feature'\'', mandateId: mandate.id }
});
console.log('\''Msg ID:'\'', msg.id.slice(0,12)+'\''...'\'', '\''| verified:'\'', amf.verifyEnvelope(msg));
'
sleep 0.80
printf '%s\n' 'Msg ID: env-29f8ab44... | verified: true
'
sleep 1.20
printf '%s\n' '
# SIGNAL — Event bus
bus.subscribe('\''task.*'\'', (e) => console.log('\''Event:'\'', e.type));
bus.publish({ type: '\''task.completed'\'', source: '\''coder'\'', payload: { sprintId: '\''1011'\'' } });
bus.deliver();
'
sleep 0.80
printf '%s\n' 'Event: task.completed
'
sleep 1.20
printf '%s\n' '
# SCORE — Reputation engine
const rubric = score.createRubric({ name: '\''Quality'\'',
  criteria: [{ id: '\''correctness'\'', name: '\''Correct'\'', weight: 1, max: 10 }]
});
console.log('\''Score:'\'', score.evaluate(rubric, { correctness: 9 }).total + '\''/10'\'');
'
sleep 0.80
printf '%s\n' 'Score: 9/10
'
sleep 1.20
printf '%s\n' '
# LAX — Latency-aware routing
const budget = lax.createBudget({ owner: '\''cfo'\'', tokens: 1000, timeMs: 60000 });
const probe  = lax.createProbe({ taskId: '\''t1'\'', priority: 1, estimatedTokens: 50 });
console.log('\''Routed:'\'', lax.routeTask(probe, budget).approved, '\''| tokens left:'\'', budget.remaining);
'
sleep 0.80
printf '%s\n' 'Routed: true | tokens left: 950
'
sleep 1.20
printf '%s\n' '
# DRS — Dynamic Resource Scheduling
const sched = new drs.ResourceScheduler();
sched.createPool({ id: '\''gpu'\'', name: '\''GPU'\'', type: '\''compute'\'', capacity: 4, available: 4 });
const alloc = sched.allocate({ requestId: '\''r1'\'', poolId: '\''gpu'\'', units: 2, ttlMs: 30000 });
console.log('\''Allocated:'\'', alloc.units, '\''GPU units | pool:'\'', alloc.poolId);
'
sleep 0.80
printf '%s\n' 'Allocated: 2 GPU units | pool: gpu
'
sleep 1.50
printf '%s\n' '
✅ All 7 protocols. One workflow. Zero trust.

   npm install @godman-protocols/{pact,soul,amf,signal,score,lax,drs}
   github.com/skingem1/godman-protocols
   Launching April 14, 2026
'
sleep 2.50
