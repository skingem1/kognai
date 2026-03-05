# Changelog

All notable changes to Invoica are documented here.

## [1.7.0] — 2026-03-05

- Agent autonomy framework — AUTONOMY-001, AUTONOMY-004 task decomposition
- Enhanced invoice router with v1 API routes and proper route ordering
- Sprint file tree injection with pre-flight file validation
- Orchestrator integration for multi-agent sprint execution
- Heartbeat health monitoring with critical status calculation
- Email support system with IMAP/SMTP monitoring for support@invoica.ai

## [1.6.0] — 2026-03-01

- Mission Control agent operations visibility platform
- Autonomous post-sprint pipeline — test→CTO review→Vercel deploy
- CMO weekly content plan generator with CEO approval gate
- Live docs auto-generation system for API reference and changelog
- Memory agent — institutional memory system for context preservation
- Sprint runner automation with GitHub milestone integration

## [1.5.0] — 2026-02-27

- X402 payment settlement system with batched queue (0.003 USDC per API call)
- Multi-chain architecture foundation for Base, Polygon, and Solana support
- Agent wallet spending integration — autonomous LLM cost settlement via USDC
- Invoice routing API with GET /invoices/number/:number endpoint
- API keys management dashboard with revoke functionality
- Telegram CEO bot with real execution tools (shell, file write, GitHub issues)

## [1.4.0] — 2026-02-20

- New Web3 Growth plan at $24/mo with 5,000 invoices and 25,000 API calls
- Web3 projects see tailored pricing during onboarding
- Registered companies see Free + Pro ($49) + Enterprise tiers
- Added Plans & Pricing documentation page

## [1.3.0] — 2026-02-16

- Added backend API routes for invoices, API keys, webhooks, and settlements
- Added Express app entry point with middleware stack
- Completed SDK test coverage for retry, debug, and client-config modules

## [1.2.0] — 2026-02-15

- Fixed SDK import chain — all modules now use v2 transport and error handling
- Added SDK tests for pagination, events, and timeout modules
- New documentation pages: error handling, environments, quickstart

## [1.1.0] — 2026-02-14

- SDK consolidation — barrel exports, interceptors, environment detection
- New tests for rate-limit, error-compat, and request-builder
- Added webhook events and quickstart documentation

## [1.0.0] — 2026-02-13

- Initial release of Invoica TypeScript SDK
- Core client with invoice, settlement, and API key management
- Webhook signature verification and rate limiting
