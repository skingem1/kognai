/**
 * @godman-protocols/sdk — Unified SDK for all 7 Godman Protocols
 * @version 0.2.0
 *
 * Import any protocol from a single package:
 *   import { createMandate, EventBus, evaluateAction } from '@godman-protocols/sdk';
 *
 * Or use namespaced imports:
 *   import { pact, signal, soul } from '@godman-protocols/sdk';
 */

// ── PACT — Protocol for Agent Coordination and Trust ──
export {
  createMandate,
  hashMandate,
  signMandate,
  revokeMandate,
  verifyMandate,
  scopeCovers,
  paymentAllowed,
  CoordinationError,
  openFrame,
  closeFrame,
  abortFrame,
  addParticipant,
  addMandateToFrame,
  MandateRegistry,
  defaultRegistry,
  PACT_VERSION,
} from '@godman-protocols/pact';

export type {
  Mandate,
  MandateScope,
  TrustAnchor,
  CoordinationFrame,
  RevocationEntry,
  VerifyResult,
} from '@godman-protocols/pact';

// ── LAX — Latency-Aware Execution ──
export {
  createBudget,
  createProbe,
  routeTask,
  registerSLA,
  checkSLACompliance,
  LAX_VERSION,
} from '@godman-protocols/lax';

export type {
  LatencyBudget,
  ExecutionSlot,
  SLAContract,
  RoutingDecision,
  LatencyProbe,
} from '@godman-protocols/lax';

// ── SCORE — Scoring and Reputation ──
export {
  createRubric,
  evaluate,
  calculateReputation,
  createAuditEntry,
  SCORE_VERSION,
} from '@godman-protocols/score';

export type {
  Criterion,
  Rubric,
  Evaluation,
  Reputation,
} from '@godman-protocols/score';

// ── SIGNAL — Event Bus and Pub/Sub ──
export {
  EventBus,
  defaultBus,
  createEvent,
  topicMatches,
  SIGNAL_VERSION,
} from '@godman-protocols/signal';

export type {
  Event,
  Subscription,
  TransportConfig,
  DeliveryReceipt,
} from '@godman-protocols/signal';

// ── SOUL — Constitutional Constraints and Safety ──
export {
  createConstitution,
  signConstitution,
  evaluateAction,
  checkKillSwitches,
  createAudit,
  SOUL_VERSION,
} from '@godman-protocols/soul';

export type {
  EnforcementLevel,
  ConstraintAction,
  Constraint,
  KillSwitch,
  Constitution,
  EvaluationResult,
} from '@godman-protocols/soul';

// ── AMF — Agent Message Format ──
export {
  createEnvelope,
  verifyEnvelope,
  taskRequest,
  taskResult,
  event,
  heartbeat,
  error,
  AMF_VERSION,
} from '@godman-protocols/amf';

export type {
  Envelope,
  Payload,
  TaskRequestPayload,
  TaskResultPayload,
  EventPayload,
  HeartbeatPayload,
  ErrorPayload,
} from '@godman-protocols/amf';

// ── DRS — Dynamic Resource Scheduling ──
export {
  ResourceScheduler,
  defaultScheduler,
  DRS_VERSION,
} from '@godman-protocols/drs';

export type {
  ResourcePool,
  AllocationRequest,
  Allocation,
  PreemptionEvent,
} from '@godman-protocols/drs';

// ── Namespaced re-exports ──
import * as pact from '@godman-protocols/pact';
import * as lax from '@godman-protocols/lax';
import * as score from '@godman-protocols/score';
import * as signal from '@godman-protocols/signal';
import * as soul from '@godman-protocols/soul';
import * as amf from '@godman-protocols/amf';
import * as drs from '@godman-protocols/drs';

export { pact, lax, score, signal, soul, amf, drs };

/** SDK version constant */
export const SDK_VERSION = '0.2.0' as const;
