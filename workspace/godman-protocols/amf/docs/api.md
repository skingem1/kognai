# AMF API Reference

> **v0.2.0** · Full API surface for `@godman-protocols/amf`

---

## Types

### `AgentId`
```typescript
type AgentId = string;
```

### `Timestamp`
```typescript
type Timestamp = string;
```
ISO 8601 timestamp string.

### `Signature`
```typescript
type Signature = string;
```
Hex-encoded HMAC-SHA256 signature.

### `MessageId`
```typescript
type MessageId = string;
```

### `PayloadType`
```typescript
type PayloadType = 'task-request' | 'task-result' | 'event' | 'heartbeat' | 'error';
```

### `Envelope`
```typescript
interface Envelope {
  amf: '0.1';
  id: MessageId;
  sender: AgentId;
  recipient: AgentId | null;
  sentAt: Timestamp;
  payload: Payload;
  signature: Signature;
}
```
`recipient: null` means broadcast (delivered to all agents).

### `Payload`
```typescript
type Payload =
  | TaskRequestPayload
  | TaskResultPayload
  | EventPayload
  | HeartbeatPayload
  | ErrorPayload;
```
Discriminated union — use `payload.type` to narrow.

### `TaskRequestPayload`
```typescript
interface TaskRequestPayload {
  type: 'task-request';
  taskId: string;
  description: string;
  input: unknown;
  deadline?: Timestamp;
}
```

### `TaskResultPayload`
```typescript
interface TaskResultPayload {
  type: 'task-result';
  taskId: string;
  status: 'success' | 'failure' | 'partial';
  output: unknown;
  error?: string;
}
```

### `EventPayload`
```typescript
interface EventPayload {
  type: 'event';
  topic: string;
  data: unknown;
}
```

### `HeartbeatPayload`
```typescript
interface HeartbeatPayload {
  type: 'heartbeat';
  status: 'alive' | 'degraded' | 'shutting-down';
  load?: number;
}
```

### `ErrorPayload`
```typescript
interface ErrorPayload {
  type: 'error';
  code: string;
  message: string;
  relatedMessageId?: MessageId;
}
```

---

## Envelope Creation (`src/core.ts`)

### `createEnvelope(sender, recipient, payload, senderSecret, options?)`

Create and sign an AMF envelope.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sender` | `AgentId` | — | Sending agent identity |
| `recipient` | `AgentId \| null` | — | Recipient (`null` = broadcast) |
| `payload` | `Payload` | — | Typed message payload |
| `senderSecret` | `string` | — | Secret for HMAC-SHA256 signing |
| `options.id` | `string` | auto UUID | Override message ID |
| `options.sentAt` | `Timestamp` | now | Override timestamp |

**Returns:** `Envelope`

**Signing process:**
1. Canonical JSON of `{ id, sender, recipient, sentAt, payload }` → SHA-256 hash
2. HMAC-SHA256 of the hash with `senderSecret`

### `verifyEnvelope(envelope, senderSecret)`

Verify an envelope's signature.

| Param | Type | Description |
|-------|------|-------------|
| `envelope` | `Envelope` | The envelope to verify |
| `senderSecret` | `string` | The sender's secret |

**Returns:** `boolean`

---

## Payload Builders (`src/core.ts`)

### `taskRequest(taskId, description, input, deadline?)`

| Param | Type | Description |
|-------|------|-------------|
| `taskId` | `string` | Task identifier |
| `description` | `string` | Human-readable task description |
| `input` | `unknown` | Task input data |
| `deadline` | `Timestamp` | Optional deadline |

**Returns:** `TaskRequestPayload`

### `taskResult(taskId, status, output, error?)`

| Param | Type | Description |
|-------|------|-------------|
| `taskId` | `string` | Task identifier |
| `status` | `'success' \| 'failure' \| 'partial'` | Outcome |
| `output` | `unknown` | Task output data |
| `error` | `string` | Optional error message |

**Returns:** `TaskResultPayload`

### `event(topic, data)`

| Param | Type | Description |
|-------|------|-------------|
| `topic` | `string` | Event topic |
| `data` | `unknown` | Event data |

**Returns:** `EventPayload`

### `heartbeat(status, load?)`

| Param | Type | Description |
|-------|------|-------------|
| `status` | `'alive' \| 'degraded' \| 'shutting-down'` | Agent status |
| `load` | `number` | Optional load factor (0.0–1.0) |

**Returns:** `HeartbeatPayload`

### `error(code, message, relatedMessageId?)`

| Param | Type | Description |
|-------|------|-------------|
| `code` | `string` | Error code |
| `message` | `string` | Human-readable error message |
| `relatedMessageId` | `MessageId` | Optional related message |

**Returns:** `ErrorPayload`

---

## Constants

```typescript
const AMF_VERSION: '0.2';
```
