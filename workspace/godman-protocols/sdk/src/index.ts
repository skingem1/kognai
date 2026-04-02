/**
 * @godman-protocols/sdk — Unified SDK for all 7 Godman Protocols
 * @version 0.3.0
 *
 * Namespaced imports:
 *   import { pact, lax, score, signal, soul, amf, drs } from '@godman-protocols/sdk';
 */

// ── PACT — Protocol for Agent Constitutional Trust ──
export * as pact from '@godman-protocols/pact';

// ── LAX — Linked Agent eXchange ──
export * as lax from '@godman-protocols/lax';

// ── SCORE — Sovereign Constitutional Output Rating Engine ──
export * as score from '@godman-protocols/score';

// ── SIGNAL — Sovereign Intelligence for Governing Neural Agent Learning ──
export * as signal from '@godman-protocols/signal';

// ── SOUL — Sovereign Open Universal Layer ──
export * as soul from '@godman-protocols/soul';

// ── AMF — Agent Memory Format ──
export * as amf from '@godman-protocols/amf';

// ── DRS — Deal Receipt Standard ──
export * as drs from '@godman-protocols/drs';

/** SDK version constant */
export const SDK_VERSION = '0.3.0' as const;
