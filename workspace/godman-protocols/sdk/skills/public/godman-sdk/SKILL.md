---
name: godman-sdk
description: "Import all 7 Godman Protocols from a single package. The SDK re-exports PACT, LAX, SCORE, AMF, DRS, SOUL, and SIGNAL for convenient unified access."
tags: ["sdk", "unified", "godman-protocols", "all-protocols"]
version: "0.2.0"
---

# @godman-protocols/sdk — Unified SDK

Use this skill as your entry point for any Godman Protocol feature. Import everything from one package instead of installing 7 separate packages.

## Installation

```bash
npm install @godman-protocols/sdk
```

## Key Operations

```typescript
import {
  // PACT — trust + mandates
  createMandate, signMandate, verifyMandate,
  // SIGNAL — event bus
  EventBus,
  // SOUL — safety constraints
  ConstitutionEngine, evaluateAction,
  // SCORE — quality evaluation
  createRubric, evaluateOutput,
  // LAX — latency budgets
  createLatencyBudget, selectRoute,
  // AMF — message format
  createEnvelope, parseEnvelope,
  // DRS — resource scheduling
  ResourceScheduler,
} from '@godman-protocols/sdk';

// Or use namespaced imports
import { pact, signal, soul, score, lax, amf, drs } from '@godman-protocols/sdk';
```

## When to Use
- New projects that need multiple protocols — install SDK instead of N packages
- DeerFlow skills that combine trust + messaging + safety in one import
- Prototyping agent workflows without package-by-package setup

## Notes
- SDK version tracks the lowest protocol version — all 7 must be at same semver
- Install order on publish: protocols first, SDK last (SDK depends on all 7)
