-- Migration: Add chain field to Invoice table
-- Sprint 10 (multi-chain architecture)
-- Safe to run multiple times (IF NOT EXISTS)

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS chain TEXT NOT NULL DEFAULT 'base';

-- Add check constraint for supported chains
ALTER TABLE "Invoice"
  DROP CONSTRAINT IF EXISTS invoice_chain_check;

ALTER TABLE "Invoice"
  ADD CONSTRAINT invoice_chain_check
  CHECK (chain IN ('base', 'polygon', 'solana'));

-- Add index for chain-based queries
CREATE INDEX IF NOT EXISTS idx_invoice_chain
  ON "Invoice" (chain);

-- Verify existing rows are defaulted correctly
UPDATE "Invoice" SET chain = 'base' WHERE chain IS NULL;