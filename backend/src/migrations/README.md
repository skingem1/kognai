This directory contains SQL migrations for the Invoice table in Supabase.

## Migration: Add Chain Field

### Purpose
Enables multi-chain invoicing by adding a `chain` column to track which blockchain the invoice is denominated on (Base, Polygon, or Solana).

### How to Run
1. Open the Supabase SQL Editor
2. Paste the contents of `add_chain_to_invoice.sql`
3. Execute the migration

### Rollback

ALTER TABLE "Invoice" DROP COLUMN IF EXISTS chain;