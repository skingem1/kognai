# ADR-003: Multi-Chain Settlement Architecture

**Date**: 2026-03-02  
**Status**: Accepted  
**Deciders**: CEO, CTO  

## Context
Invoica must support Base, Polygon, and Solana by March 28 to meet merchant demand. Stripe x402 only supports Base (EVM), making Solana support a competitive moat. Each chain has different settlement patterns requiring unified detection.

## Decision
Implement a **settlement-router pattern** with chain-specific detectors sharing a common interface. EVM chains (Base, Polygon) share implementation via `EvmSettlementDetector`; Solana uses `SolanaSettlementDetector`. Raw JSON-RPC is used instead of abstraction libraries to minimize bundle size and avoid ESM compatibility issues.

### Why Raw JSON-RPC?

| Library | Size | Issues | Decision |
|---------|------|--------|----------|
| viem | ~200KB | Overkill for simple RPC calls | Rejected |
| @solana/web3.js | ~400KB | ESM-only, breaks ts-node | Rejected |
| Raw JSON-RPC | ~0KB | More verbose, full control | Accepted |

## Chain Config
