/**
 * AMF — Agent Message Format
 * Core: envelope creation, signing, verification, payload helpers
 * @version 0.2.0
 */

import { createHash, createHmac, randomUUID } from 'node:crypto';
import type {
  AgentId,
  Envelope,
  ErrorPayload,
  EventPayload,
  HeartbeatPayload,
  Payload,
  TaskRequestPayload,
  TaskResultPayload,
  Timestamp,
} from './types.js';

// ---------------------------------------------------------------------------
// Envelope creation + signing
// ---------------------------------------------------------------------------

/**
 * Create and sign an AMF envelope.
 */
export function createEnvelope(
  sender: AgentId,
  recipient: AgentId | null,
  payload: Payload,
  senderSecret: string,
  options: { id?: string; sentAt?: Timestamp } = {}
): Envelope {
  const id = options.id ?? randomUUID();
  const sentAt = options.sentAt ?? new Date().toISOString();

  const sigInput = hashEnvelopeFields(id, sender, recipient, sentAt, payload);
  const signature = createHmac('sha256', senderSecret)
    .update(sigInput, 'hex')
    .digest('hex');

  return { amf: '0.1', id, sender, recipient, sentAt, payload, signature };
}

/**
 * Verify an envelope's signature.
 */
export function verifyEnvelope(envelope: Envelope, senderSecret: string): boolean {
  const sigInput = hashEnvelopeFields(
    envelope.id, envelope.sender, envelope.recipient,
    envelope.sentAt, envelope.payload
  );
  const expected = createHmac('sha256', senderSecret)
    .update(sigInput, 'hex')
    .digest('hex');
  return envelope.signature === expected;
}

function hashEnvelopeFields(
  id: string, sender: string, recipient: string | null,
  sentAt: string, payload: Payload
): string {
  const canonical = JSON.stringify({ id, sender, recipient, sentAt, payload });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

export function taskRequest(
  taskId: string,
  description: string,
  input: unknown,
  deadline?: Timestamp
): TaskRequestPayload {
  return { type: 'task-request', taskId, description, input, deadline };
}

export function taskResult(
  taskId: string,
  status: 'success' | 'failure' | 'partial',
  output: unknown,
  error?: string
): TaskResultPayload {
  return { type: 'task-result', taskId, status, output, error };
}

export function event(topic: string, data: unknown): EventPayload {
  return { type: 'event', topic, data };
}

export function heartbeat(
  status: 'alive' | 'degraded' | 'shutting-down',
  load?: number
): HeartbeatPayload {
  return { type: 'heartbeat', status, load };
}

export function error(
  code: string,
  message: string,
  relatedMessageId?: string
): ErrorPayload {
  return { type: 'error', code, message, relatedMessageId };
}
