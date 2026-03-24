/**
 * AMF — Agent Message Format
 * Public API surface (skeleton)
 * @version 0.1.0-skeleton
 */

export type {
  AgentId, Timestamp, Signature, MessageId, PayloadType,
  Envelope, Payload, TaskRequestPayload, TaskResultPayload,
  EventPayload, HeartbeatPayload, ErrorPayload,
} from './types.js';

export const AMF_VERSION = '0.1' as const;

export function createEnvelope(
  _sender: string,
  _recipient: string | null,
  _payload: import('./types.js').Payload,
): import('./types.js').Envelope {
  throw new Error('AMF createEnvelope: not implemented — skeleton phase');
}

export function verifyEnvelope(_envelope: import('./types.js').Envelope): boolean {
  throw new Error('AMF verifyEnvelope: not implemented — skeleton phase');
}
