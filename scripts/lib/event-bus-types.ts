// Event type namespaces as string literal unions
export type TaskEventType =
  | 'task.queued'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.rejected';

export type AgentEventType =
  | 'agent.available'
  | 'agent.busy'
  | 'agent.degraded';

export type DataEventType =
  | 'data.research.complete'
  | 'data.frame.extracted'
  | 'data.caption.generated';

export type InterruptEventType =
  | 'interrupt.plumber.alert'
  | 'interrupt.budget.warning'
  | 'interrupt.budget.freeze';

export type SystemEventType =
  | 'system.sprint.started'
  | 'system.sprint.completed'
  | 'system.heartbeat';

// Sprint 643: Achiri alpha monitoring events
export type AchiriEventType =
  | 'achiri.chat'
  | 'achiri.voice'
  | 'achiri.onboard';

export interface AchiriEventPayload {
  user_id: string;
  tier: string;
  model: string;
  provider: string;
  message_length: number;
  response_time_ms: number;
  turns_in_memory: number;
  [key: string]: unknown;
}

// Union of all event types
export type KognaiEventType =
  | TaskEventType
  | AgentEventType
  | DataEventType
  | InterruptEventType
  | SystemEventType
  | AchiriEventType;

// Payload interfaces — index signature required for Record<string,unknown> compatibility
export interface TaskEventPayload {
  task_id: string;
  title: string;
  status: string;
  costUsdc?: number;
  reason?: string;
  [key: string]: unknown;
}

export interface BudgetEventPayload {
  burnPct: number;
  spentUsdc: number;
  budgetUsdc: number;
  [key: string]: unknown;
}

export interface SprintEventPayload {
  sprint: string;
  taskCount: number;
  completedCount: number;
  [key: string]: unknown;
}

// Base event interface
export interface BaseEvent {
  event_type: KognaiEventType;
  agent_id: string;
  sprint: string;
  timestamp: string;
  payload: Record<string, unknown>;
  inserted_at?: string; // added by Supabase on insert
}

// Discriminated union event types
export interface TaskEvent extends BaseEvent {
  event_type: TaskEventType;
  payload: TaskEventPayload;
}

export interface AgentEvent extends BaseEvent {
  event_type: AgentEventType;
  payload: Record<string, unknown>;
}

export interface DataEvent extends BaseEvent {
  event_type: DataEventType;
  payload: Record<string, unknown>;
}

export interface InterruptEvent extends BaseEvent {
  event_type: InterruptEventType;
  payload: BudgetEventPayload | Record<string, unknown>;
}

export interface SystemEvent extends BaseEvent {
  event_type: SystemEventType;
  payload: SprintEventPayload | Record<string, unknown>;
}

// Sprint 643: Achiri event
export interface AchiriEvent extends BaseEvent {
  event_type: AchiriEventType;
  payload: AchiriEventPayload;
}

// Discriminated union of all event types
export type KognaiEvent =
  | TaskEvent
  | AgentEvent
  | DataEvent
  | InterruptEvent
  | SystemEvent
  | AchiriEvent;

// Type guard functions
export function isTaskEvent(e: KognaiEvent): e is TaskEvent {
  return (
    e.event_type === 'task.queued' ||
    e.event_type === 'task.started' ||
    e.event_type === 'task.completed' ||
    e.event_type === 'task.failed' ||
    e.event_type === 'task.rejected'
  );
}

export function isInterruptEvent(e: KognaiEvent): e is InterruptEvent {
  return (
    e.event_type === 'interrupt.plumber.alert' ||
    e.event_type === 'interrupt.budget.warning' ||
    e.event_type === 'interrupt.budget.freeze'
  );
}

export function isSystemEvent(e: KognaiEvent): e is SystemEvent {
  return (
    e.event_type === 'system.sprint.started' ||
    e.event_type === 'system.sprint.completed' ||
    e.event_type === 'system.heartbeat'
  );
}