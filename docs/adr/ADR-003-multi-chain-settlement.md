# ADR-003: Multi-Chain Settlement Architecture

## Status
Accepted — 2026-03-03

## Context

Invoica began as a Base-only USDC invoicing platform. As the product matures, merchants increasingly request support for Polygon (lower fees) and Solana (non-EVM audience). Each chain has fundamentally different settlement mechanics:

- **EVM chains (Base, Polygon)**: USDC is an ERC-20 token. Transfers emit `Transfer(address,address,uint256)` events, queryable via `eth_getLogs`.
- **Solana**: USDC is an SPL token. No event logs — must poll `getSignaturesForAddress` then parse each transaction for SPL token instructions.

A single settlement model cannot serve both paradigms. We need a routing layer that abstracts chain differences from the rest of the application.

## Decision

Implement a three-layer settlement architecture:

### Layer 1 — Chain Registry (`lib/chain-registry.ts`)
Single source of truth for all supported chains. Each `ChainConfig` includes: `id`, `type` (evm|solana), `chainId`, `rpcUrl`, `usdcAddress`, `explorerUrl`, `usdcDecimals`.

### Layer 2 — Chain-Specific Detectors
- `EvmSettlementDetector`: Uses `eth_getLogs` with USDC Transfer topic. Supports `scanTransfersToAddress` and `verifyTransfer`.
- `SolanaSettlementDetector`: Uses raw JSON-RPC `getSignaturesForAddress` + `getTransaction`. No `@solana/web3.js` dependency — raw `fetch()` only. Supports `getRecentUsdcTransfers` and `verifyTransfer`.

Both detectors share the `SettlementMatch` interface: `{ invoiceId, txHash, amount, from, to, blockNumber, timestamp, chain }`.

### Layer 3 — Settlement Router (`services/settlement/settlement-router.ts`)
Thin dispatch layer. Calls `isEvmChain(chainId)` from the registry, routes to the appropriate detector. No business logic lives here.

checkSettlement(chainId, recipient, options) -> SettlementMatch[]
verifyPayment(chainId, txId, recipient, amount) -> boolean

### Chain Validator (`lib/chain-validator.ts`)
Express middleware helper. Validates chain IDs in route handlers against the registry. Replaces all hardcoded `SUPPORTED_CHAINS` arrays.

## Consequences

**Positive:**
- Adding a new chain requires only: one entry in `chain-registry.ts` + one new detector class. Zero changes to routes or business logic.
- Chain validation is centralised — no per-route `SUPPORTED_CHAINS` arrays.
- Solana detector uses no external SDK, reducing bundle size and dependency risk.

**Negative:**
- Solana polling is pull-based (no push/webhook). Settlement confirmation latency depends on polling frequency.
- EVM `eth_getLogs` scans require knowing the block range — callers must track the last-scanned block per merchant.

## Alternatives Considered

- **Single universal detector**: Rejected. EVM and Solana have incompatible RPC interfaces and data models. A unified interface would require too many conditionals.
- **@solana/web3.js for Solana**: Rejected. Adds ~2MB dependency for functionality achievable with 4 raw RPC calls. Raw fetch is sufficient for our use case.
- **Third-party settlement APIs (Alchemy, QuickNode webhooks)**: Deferred. Would reduce polling complexity but introduces external dependency and cost per transaction.

## References

- `backend/src/lib/chain-registry.ts`
- `backend/src/lib/chain-validator.ts`
- `backend/src/services/settlement/evm-detector.ts`
- `backend/src/services/settlement/solana-detector.ts`
- `backend/src/services/settlement/settlement-router.ts`
