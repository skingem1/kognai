# PACT API Reference

Full reference for all exported functions and types in `@godman-protocols/pact` v0.2.

---

## Types (`src/types.ts`)

### `AgentId`
```typescript
type AgentId = string;
```
A unique agent identifier. Recommended formats: DID (`did:kognai:harvey`), x402 wallet address (`0x...`), or scoped handle (`@invoica_ai`).

### `Mandate`
```typescript
interface Mandate {
  version: '0.1';
  id: string;           // UUID v4
  grantor: AgentId;
  grantee: AgentId;
  scope: MandateScope;
  issuedAt: Timestamp;  // ISO 8601
  expiresAt: Timestamp | null;
  signature: Signature; // hex-encoded HMAC-SHA256
}
```

### `MandateScope`
```typescript
interface MandateScope {
  description: string;
  actions: string[];         // e.g. ['read', 'write', 'execute', 'pay']
  resources: string[];       // URI patterns, '*' = wildcard
  maxPaymentUsdc: number | null; // null = no payment allowed
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

---

## Core — `src/core.ts`

### `createMandate`
```typescript
function createMandate(
  grantor: AgentId,
  grantee: AgentId,
  scope: MandateScope,
  options?: {
    expiresAt?: Timestamp | null;
    id?: string;
    issuedAt?: Timestamp;
  }
): Mandate
```
Creates an **unsigned** mandate skeleton. The `signature` field is set to `''`. Call `signMandate` to attach a signature.

### `hashMandate`
```typescript
function hashMandate(mandate: Omit<Mandate, 'signature'>): string
```
Produces a deterministic SHA-256 hash over the mandate's signable fields. Scope `actions` and `resources` are sorted before hashing to ensure order-stability. Returns a 64-char hex string.

### `signMandate`
```typescript
function signMandate(mandate: Mandate, grantorSecret: string): Mandate
```
Returns a new `Mandate` with the `signature` field set to `HMAC-SHA256(grantorSecret, hashMandate(mandate))`. Does not mutate the input mandate.

**Production note:** Replace with Ed25519 or EIP-712 for asymmetric, verifiable signing.

### `revokeMandate`
```typescript
function revokeMandate(
  mandateId: string,
  revokedBy: AgentId,
  revokerSecret: string,
  reason?: string
): RevocationEntry
```
Creates a `RevocationEntry`. Append this to your revocation ledger (via `MandateRegistry.addRevocation`) to invalidate the mandate. The entry is signed with `HMAC-SHA256(revokerSecret, "${mandateId}:${revokedBy}:${revokedAt}")`.

---

## Verifier — `src/verifier.ts`

### `verifyMandate`
```typescript
type VerifyResult =
  | { valid: true }
  | { valid: false; reason: 'invalid_signature' | 'expired' | 'revoked' };

function verifyMandate(
  mandate: Mandate,
  grantorSecret: string,
  revocationLedger?: RevocationEntry[],
  asOf?: string
): VerifyResult
```
Verifies three conditions in order:
1. **Signature** — recomputes HMAC and compares. Returns `{ valid: false, reason: 'invalid_signature' }` on mismatch.
2. **Expiry** — checks `expiresAt` against `asOf` (default: `new Date()`). Returns `{ valid: false, reason: 'expired' }` if past.
3. **Revocation** — checks `revocationLedger` for the mandate's ID. Returns `{ valid: false, reason: 'revoked' }` if found.

Returns `{ valid: true }` if all three pass.

### `scopeCovers`
```typescript
function scopeCovers(
  mandate: Mandate,
  action: string,
  resource: string
): boolean
```
Returns `true` if the mandate's scope covers `action` on `resource`.

- **Actions:** `'*'` matches any action; otherwise exact string match.
- **Resources:** `'*'` matches any resource; prefix wildcards (`'workspace/*'`) are supported (trailing `*` stripped and `startsWith` applied); otherwise exact match.

### `paymentAllowed`
```typescript
function paymentAllowed(mandate: Mandate, amountUsdc: number): boolean
```
Returns `true` if `mandate.scope.maxPaymentUsdc !== null && amountUsdc <= maxPaymentUsdc`. Returns `false` if `maxPaymentUsdc` is `null` (no payments authorised).

---

## Coordinator — `src/coordinator.ts`

### `openFrame`
```typescript
function openFrame(
  initiator: AgentId,
  initialMandateIds?: string[],
  options?: { id?: string; openedAt?: Timestamp }
): CoordinationFrame
```
Creates a new `CoordinationFrame` with `status: 'open'`. The initiator is automatically added to `participants`. Frames are immutable value objects — all mutating functions return new frame objects.

### `closeFrame`
```typescript
function closeFrame(frame: CoordinationFrame, closedAt?: Timestamp): CoordinationFrame
```
Returns a new frame with `status: 'closed'` and `closedAt` set. Throws `CoordinationError` (`code: 'FRAME_NOT_OPEN'`) if the frame is not open.

### `abortFrame`
```typescript
function abortFrame(frame: CoordinationFrame, closedAt?: Timestamp): CoordinationFrame
```
Returns a new frame with `status: 'aborted'`. Use when a constitutional violation or unrecoverable error occurs. Throws `CoordinationError` if the frame is not open.

### `addParticipant`
```typescript
function addParticipant(frame: CoordinationFrame, participant: AgentId): CoordinationFrame
```
Returns a new frame with `participant` appended to `participants`. Idempotent — returns the same frame if the participant is already listed. Throws `CoordinationError` if the frame is not open.

### `addMandateToFrame`
```typescript
function addMandateToFrame(frame: CoordinationFrame, mandateId: string): CoordinationFrame
```
Returns a new frame with `mandateId` appended to `mandateIds`. Idempotent. Throws `CoordinationError` if the frame is not open.

### `CoordinationError`
```typescript
class CoordinationError extends Error {
  code: string;  // e.g. 'FRAME_NOT_OPEN'
}
```

---

## Registry — `src/registry.ts`

### `MandateRegistry`
```typescript
class MandateRegistry {
  store(mandate: Mandate): void
  get(mandateId: string): Mandate | undefined
  has(mandateId: string): boolean
  delete(mandateId: string): boolean
  list(filter?: { grantor?: string; grantee?: string }): Mandate[]

  addRevocation(entry: RevocationEntry): void
  isRevoked(mandateId: string): boolean
  get revocationLedger(): readonly RevocationEntry[]

  loadSnapshot(mandates: Mandate[], revocations: RevocationEntry[]): void
  snapshot(): { mandates: Mandate[]; revocations: RevocationEntry[] }
  get size(): number
}
```

**`store(mandate)`** — Stores a mandate. Overwrites if the same ID exists.

**`get(mandateId)`** — Returns the mandate or `undefined`.

**`list(filter?)`** — Returns all mandates, optionally filtered by `grantor` or `grantee`.

**`addRevocation(entry)`** — Appends to the internal revocation ledger. Pass `registry.revocationLedger` to `verifyMandate`.

**`isRevoked(mandateId)`** — Checks revocation ledger.

**`snapshot()`** / **`loadSnapshot()`** — Serialise and restore registry state for persistence.

### `defaultRegistry`
```typescript
const defaultRegistry: MandateRegistry;
```
Singleton instance for single-process use. Import and use directly if you don't need multiple isolated registries.

---

## Protocol Version

```typescript
import { PACT_VERSION } from '@godman-protocols/pact';
// PACT_VERSION === '0.2'
```
