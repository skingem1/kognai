/**
 * AMF — Agent Message Format
 * Public API surface
 * @version 0.2.0
 */

// Types
export type {
  AgentId,
  Timestamp,
  Signature,
  MessageId,
  PayloadType,
  Envelope,
  Payload,
  TaskRequestPayload,
  TaskResultPayload,
  EventPayload,
  HeartbeatPayload,
  ErrorPayload,
} from './types.js';

// Core
export {
  createEnvelope,
  verifyEnvelope,
  taskRequest,
  taskResult,
  event,
  heartbeat,
  error,
} from './core.js';

/** Protocol version constant */
export const AMF_VERSION = '0.2' as const;
