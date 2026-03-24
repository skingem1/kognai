# PACT API Reference

> **v0.2.0** · Full API surface for `@godman-protocols/pact`

---

## Types

### `AgentId`
```typescript
type AgentId = string;
```
A unique agent identifier — DID, x402 wallet address, or scoped handle.

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

### `MandateScope`
```typescript
interface MandateScope {
  description: string;
  actions: string[];
  resources: string[];
  maxPaymentUsdc: number | null;
}
```
Defines what a grantee may do: permitted actions, resources (glob patterns), and max payment in USDC.

### `Mandate`
```typescript
interface Mandate {
  version: string;
  id: string;
  grantor: AgentId;
  grantee: AgentId;
  scope: MandateScope;
  issuedAt: Timestamp;
  expiresAt: Timestamp | null;
  signature: Signature;
}
```

### `RevocationEntry`
```typescript
interface RevocationEntry {
  mandateId: string;
  revokedBy: AgentId;
  revokedAt: Timestamp;
  reason?: string;
  signature: Signature;
}
```

### `TrustAnchor`
```typescript
interface TrustAnchor {
  type: 'did' | 'x402' | 'org-key';
  value: string;
  label?: string;
}
```

### `CoordinationFrame`
```typescript
interface CoordinationFrame {
  id: string;
  initiator: AgentId;
  participants: AgentId[];
  mandateIds: string[];
  status: 'open' | 'closed' | 'aborted';
  openedAt: Timestamp;
  closedAt: Timestamp | null;
}
```

### `VerifyResult`
```typescript
type VerifyResult =
  | { valid: true }
  | { valid: false; reason: string };
```

---

## Core Mandate Lifecycle (`src/core.ts`)

### `createMandate(grantor, grantee, scope, options?)`

Create an unsigned mandate skeleton.

| Param | Type | Description |
|-------|------|-------------|
| `grantor` | `AgentId` | Agent granting authority |
| `grantee` | `AgentId` | Agent receiving authority |
| `scope` | `MandateScope` | What the grantee may do |
| `options.expiresAt` | `Timestamp \| null` | Expiry (default: `null`) |
| `options.id` | `string` | Override auto-generated UUID |
| `options.issuedAt` | `Timestamp` | Override auto-generated timestamp |

**Returns:** `Mandate` (unsigned — `signature` is empty string)

### `hashMandate(mandate)`

SHA-256 hash over signable fields. Signature excluded. Arrays sorted for determinism.

**Returns:** `string` (hex-encoded SHA-256)

### `signMandate(mandate, grantorSecret)`

HMAC-SHA256 sign. Returns new Mandate with signature populated.

**Returns:** `Mandate`

### `revokeMandate(mandateId, revokedBy, revokerSecret, reason?)`

Create a `RevocationEntry`. Append to revocation ledger.

**Returns:** `RevocationEntry`

---

## Verification (`src/verifier.ts`)

### `verifyMandate(mandate, grantorSecret, revocationLedger?, asOf?)`

Verify signature (HMAC-SHA256), expiry, and revocation status.

| Param | Type | Default |
|-------|------|---------|
| `mandate` | `Mandate` | — |
| `grantorSecret` | `string` | — |
| `revocationLedger` | `RevocationEntry[]` | `[]` |
| `asOf` | `string` | now |

**Returns:** `VerifyResult`

### `scopeCovers(mandate, action, resource)`

Check if scope permits action on resource. Supports `*` wildcard and glob-prefix matching.

**Returns:** `boolean`

### `paymentAllowed(mandate, amountUsdc)`

Returns `true` if payment within `maxPaymentUsdc`. `false` if `maxPaymentUsdc` is `null`.

**Returns:** `boolean`

---

## Coordination Frames (`src/coordinator.ts`)

### `openFrame(initiator, initialMandateIds?, options?)`

Open a new frame. Initiator auto-added as first participant.

**Returns:** `CoordinationFrame` (status: `'open'`)

### `closeFrame(frame, closedAt?)`

Close successfully. Throws `CoordinationError` if not open.

### `abortFrame(frame, closedAt?)`

Abort (error/violation). Throws `CoordinationError` if not open.

### `addParticipant(frame, participant)`

Add participant (idempotent).

### `addMandateToFrame(frame, mandateId)`

Add mandate to frame (idempotent).

### `CoordinationError`
```typescript
class CoordinationError extends Error {
  readonly code: string; // e.g. 'FRAME_NOT_OPEN'
}
```

---

## Registry (`src/registry.ts`)

### `class MandateRegistry`

In-memory mandate + revocation store.

| Method | Description |
|--------|-------------|
| `store(mandate)` | Store mandate. Throws if ID exists. |
| `get(id)` | Get by ID or `undefined`. |
| `list()` | All stored mandates. |
| `addRevocation(entry)` | Add revocation entry. |
| `isRevoked(mandateId)` | Check revocation status. |
| `snapshot()` | Read-only `{ mandates, revocations }`. |

**Property:** `revocationLedger: RevocationEntry[]` (read-only copy)

### `defaultRegistry`

Singleton `MandateRegistry` for single-process use.

---

## Constants

```typescript
const PACT_VERSION: '0.2';
```
