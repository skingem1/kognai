# Invoica API Contract

*Auto-generated 2026-03-05 from backend/src/routes/*

## Base URL
```
https://invoica.wp1.host/v1
```

## Authentication

| Method | Header | Required for |
|--------|--------|-------------|
| API Key | `X-API-Key: your-key` | Ledger endpoints |
| x402 Payment | `X-Payment: base64(EIP-3009 proof)` | AI inference |

## Ai inference

### `GET /v1/ai/inference`
Get x402 payment requirements for AI inference
**Auth:** None

### `POST /v1/ai/inference`
Call AI model (MiniMax or Claude) via x402 USDC payment
**Auth:** x402 Payment (X-Payment header, USDC on Base)

## Api keys

### `POST /v1/api-keys`
Create a new API key
**Auth:** None

### `GET /v1/api-keys`
List all API keys for the authenticated user
**Auth:** None

### `POST /v1/api-keys/:id/rotate`
Rotate (regenerate) an API key
**Auth:** None

### `POST /v1/api-keys/:id/revoke`
Revoke an API key
**Auth:** None

### `DELETE /v1/api-keys/:id`
DELETE /v1/api-keys/:id
**Auth:** None

## Health

### `GET /v1/health`
Health check — returns API status and uptime
**Auth:** None

## Invoices

### `GET /v1/invoices/number/:number`
Get invoice by invoice number
**Auth:** None

### `GET /v1/invoices/:id`
Get invoice by UUID
**Auth:** None

### `GET /v1/invoices`
GET /v1/invoices
**Auth:** None

### `POST /v1/invoices`
Create a new invoice
**Auth:** None

### `PATCH /v1/invoices/:id/status`
PATCH /v1/invoices/:id/status
**Auth:** None

## Ledger

### `POST /v1/ledger/send-verification`
Send email verification for ledger access
**Auth:** None

### `POST /v1/ledger/confirm-verification`
Confirm email verification code
**Auth:** None

### `GET /v1/ledger`
Get ledger transactions (requires API key)
**Auth:** API Key (X-API-Key header)

### `GET /v1/ledger/summary`
Get ledger summary statistics (requires API key)
**Auth:** API Key (X-API-Key header)

### `GET /v1/ledger/export.csv`
Export ledger as CSV (requires API key)
**Auth:** API Key (X-API-Key header)

## Settlements

### `GET /v1/settlements/:id`
Get settlement details by ID
**Auth:** None

### `GET /v1/settlements`
List all settlements (paid/completed invoices)
**Auth:** None

## Webhooks

### `POST /v1/webhooks`
Register a new webhook endpoint
**Auth:** None

### `GET /v1/webhooks`
List all registered webhooks
**Auth:** None

### `DELETE /v1/webhooks/:id`
Delete a webhook
**Auth:** None
