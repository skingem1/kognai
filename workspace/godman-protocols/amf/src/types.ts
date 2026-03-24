/**
 * AMF — Agent Message Format
 * Core type definitions (skeleton)
 * @version 0.1.0-skeleton
 */

export type AgentId = string;
export type Timestamp = string;
export type Signature = string;
export type MessageId = string;

/** All supported payload types */
export type PayloadType = 'task-request' | 'task-result' | 'event' | 'heartbeat' | 'error';

/** The outer AMF envelope wrapping all inter-agent messages */
export interface Envelope {
  /** Protocol version */
  amf: '0.1';
  /** Unique message ID (UUID v4) */
  id: MessageId;
  /** Sending agent identity */
  sender: AgentId;
  /** Receiving agent identity (null = broadcast) */
  recipient: AgentId | null;
  /** ISO 8601 */
  sentAt: Timestamp;
  /** Typed payload */
  payload: Payload;
  /** Sender's signature over the envelope (excluding this field) */
  signature: Signature;
}

/** Discriminated union of all payload shapes */
export type Payload =
  | TaskRequestPayload
  | TaskResultPayload
  | EventPayload
  | HeartbeatPayload
  | ErrorPayload;

export interface TaskRequestPayload {
  type: 'task-request';
  taskId: string;
  description: string;
  input: unknown;
  deadline?: Timestamp;
}

export interface TaskResultPayload {
  type: 'task-result';
  taskId: string;
  status: 'success' | 'failure' | 'partial';
  output: unknown;
  error?: string;
}

export interface EventPayload {
  type: 'event';
  topic: string;
  data: unknown;
}

export interface HeartbeatPayload {
  type: 'heartbeat';
  status: 'alive' | 'degraded' | 'shutting-down';
  load?: number;
}

export interface ErrorPayload {
  type: 'error';
  code: string;
  message: string;
  relatedMessageId?: MessageId;
}
