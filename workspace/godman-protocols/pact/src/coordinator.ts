/**
 * PACT — Protocol for Agent Coordination and Trust
 * CoordinationFrame lifecycle: open, close, abort, addParticipant
 * @version 0.2.0
 */

import { randomUUID } from 'node:crypto';
import type { AgentId, CoordinationFrame, Timestamp } from './types.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CoordinationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CoordinationError';
  }
}

// ---------------------------------------------------------------------------
// Frame lifecycle
// ---------------------------------------------------------------------------

/**
 * Open a new CoordinationFrame.
 * The initiator is automatically added as the first participant.
 */
export function openFrame(
  initiator: AgentId,
  initialMandateIds: string[] = [],
  options: { id?: string; openedAt?: Timestamp } = {}
): CoordinationFrame {
  return {
    id: options.id ?? randomUUID(),
    initiator,
    participants: [initiator],
    mandateIds: [...initialMandateIds],
    status: 'open',
    openedAt: options.openedAt ?? new Date().toISOString(),
    closedAt: null,
  };
}

/**
 * Close a frame successfully.
 * Returns a new frame object — frames are immutable after creation.
 */
export function closeFrame(
  frame: CoordinationFrame,
  closedAt?: Timestamp
): CoordinationFrame {
  if (frame.status !== 'open') {
    throw new CoordinationError(
      'FRAME_NOT_OPEN',
      `Cannot close frame ${frame.id} — status is '${frame.status}'`
    );
  }
  return {
    ...frame,
    status: 'closed',
    closedAt: closedAt ?? new Date().toISOString(),
  };
}

/**
 * Abort a frame due to error or constitutional violation.
 */
export function abortFrame(
  frame: CoordinationFrame,
  closedAt?: Timestamp
): CoordinationFrame {
  if (frame.status !== 'open') {
    throw new CoordinationError(
      'FRAME_NOT_OPEN',
      `Cannot abort frame ${frame.id} — status is '${frame.status}'`
    );
  }
  return {
    ...frame,
    status: 'aborted',
    closedAt: closedAt ?? new Date().toISOString(),
  };
}

/**
 * Add a participant to an open frame.
 * Idempotent — adding an existing participant is a no-op.
 */
export function addParticipant(
  frame: CoordinationFrame,
  participant: AgentId
): CoordinationFrame {
  if (frame.status !== 'open') {
    throw new CoordinationError(
      'FRAME_NOT_OPEN',
      `Cannot add participant to frame ${frame.id} — status is '${frame.status}'`
    );
  }
  if (frame.participants.includes(participant)) return frame;
  return {
    ...frame,
    participants: [...frame.participants, participant],
  };
}

/**
 * Add a mandate to the frame's active mandate set.
 * Idempotent — adding an existing mandate ID is a no-op.
 */
export function addMandateToFrame(
  frame: CoordinationFrame,
  mandateId: string
): CoordinationFrame {
  if (frame.status !== 'open') {
    throw new CoordinationError(
      'FRAME_NOT_OPEN',
      `Cannot modify mandates of frame ${frame.id} — status is '${frame.status}'`
    );
  }
  if (frame.mandateIds.includes(mandateId)) return frame;
  return {
    ...frame,
    mandateIds: [...frame.mandateIds, mandateId],
  };
}
