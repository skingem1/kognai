/**
 * PACT — Protocol for Agent Coordination and Trust
 * MandateRegistry: in-memory store for mandates and revocations.
 * Suitable for single-process use; replace with persistent store for production.
 * @version 0.2.0
 */

import type { Mandate, RevocationEntry } from './types.js';

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

export class MandateRegistry {
  private readonly mandates = new Map<string, Mandate>();
  private readonly revocations: RevocationEntry[] = [];

  // -- Mandates -----------------------------------------------------------

  /** Store a signed mandate. Overwrites if the same ID exists. */
  store(mandate: Mandate): void {
    this.mandates.set(mandate.id, mandate);
  }

  /** Retrieve a mandate by ID. Returns undefined if not found. */
  get(mandateId: string): Mandate | undefined {
    return this.mandates.get(mandateId);
  }

  /** Check if a mandate exists. */
  has(mandateId: string): boolean {
    return this.mandates.has(mandateId);
  }

  /** Remove a mandate from the registry (does not revoke — use addRevocation). */
  delete(mandateId: string): boolean {
    return this.mandates.delete(mandateId);
  }

  /** All mandates, optionally filtered by grantor or grantee. */
  list(filter?: { grantor?: string; grantee?: string }): Mandate[] {
    const all = [...this.mandates.values()];
    if (!filter) return all;
    return all.filter((m) => {
      if (filter.grantor && m.grantor !== filter.grantor) return false;
      if (filter.grantee && m.grantee !== filter.grantee) return false;
      return true;
    });
  }

  // -- Revocations --------------------------------------------------------

  /** Append a revocation entry to the ledger. */
  addRevocation(entry: RevocationEntry): void {
    this.revocations.push(entry);
  }

  /** Check if a mandate ID appears in the revocation ledger. */
  isRevoked(mandateId: string): boolean {
    return this.revocations.some((e) => e.mandateId === mandateId);
  }

  /** All revocation entries (read-only snapshot). */
  get revocationLedger(): readonly RevocationEntry[] {
    return this.revocations;
  }

  // -- Convenience --------------------------------------------------------

  /** Bulk-store mandates (e.g. from a persisted snapshot). */
  loadSnapshot(mandates: Mandate[], revocations: RevocationEntry[]): void {
    for (const m of mandates) this.mandates.set(m.id, m);
    this.revocations.push(...revocations);
  }

  /** Export a serialisable snapshot for persistence. */
  snapshot(): { mandates: Mandate[]; revocations: RevocationEntry[] } {
    return {
      mandates: [...this.mandates.values()],
      revocations: [...this.revocations],
    };
  }

  /** Number of stored mandates. */
  get size(): number {
    return this.mandates.size;
  }
}

/** Singleton registry for single-process usage. */
export const defaultRegistry = new MandateRegistry();
