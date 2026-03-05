-- Migration: 003_settlements_payments.sql
-- Description: Create settlements and payments tables for payment processing
-- Created: 2024-01-15
-- Author: Backend Core Agent

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Table: settlements
-- =============================================================================
-- Stores settlement records for merchants, tracking period-based settlements
-- with total invoices, amounts, and USDC conversion
-- =============================================================================
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_invoices INTEGER NOT NULL DEFAULT 0 CHECK (total_invoices >= 0),
    total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'GBP')),
    usdc_amount NUMERIC NOT NULL DEFAULT 0 CHECK (usdc_amount >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient merchant lookups
CREATE INDEX IF NOT EXISTS idx_settlements_merchant_id ON settlements(merchant_id);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_settlements_period ON settlements(period_start, period_end);

-- =============================================================================
-- Table: payments
-- =============================================================================
-- Stores individual payment records linked to settlements
-- Tracks blockchain transactions and status
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient settlement lookups
CREATE INDEX IF NOT EXISTS idx_payments_settlement_id ON payments(settlement_id);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Index for transaction hash lookups
CREATE INDEX IF NOT EXISTS idx_payments_tx_hash ON payments(tx_hash) WHERE tx_hash IS NOT NULL;

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE settlements IS 'Stores settlement records for merchants with period-based invoicing';
COMMENT ON TABLE payments IS 'Stores individual payment records linked to settlements for blockchain transactions';

COMMENT ON COLUMN settlements.id IS 'Unique identifier for the settlement record';
COMMENT ON COLUMN settlements.merchant_id IS 'Reference to the merchant (auth.users)';
COMMENT ON COLUMN settlements.period_start IS 'Start date of the settlement period';
COMMENT ON COLUMN settlements.period_end IS 'End date of the settlement period';
COMMENT ON COLUMN settlements.total_invoices IS 'Number of invoices included in this settlement';
COMMENT ON COLUMN settlements.total_amount IS 'Total amount in original currency';
COMMENT ON COLUMN settlements.currency IS 'Currency code for the total amount';
COMMENT ON COLUMN settlements.usdc_amount IS 'Equivalent amount in USDC';
COMMENT ON COLUMN settlements.status IS 'Current status of the settlement';
COMMENT ON COLUMN settlements.created_at IS 'Timestamp when the settlement was created';

COMMENT ON COLUMN payments.id IS 'Unique identifier for the payment record';
COMMENT ON COLUMN payments.settlement_id IS 'Reference to the parent settlement';
COMMENT ON COLUMN payments.from_address IS 'Blockchain address initiating the payment';
COMMENT ON COLUMN payments.to_address IS 'Blockchain address receiving the payment';
COMMENT ON COLUMN payments.amount TEXT IS 'Payment amount as string to preserve precision';
COMMENT ON COLUMN payments.tx_hash IS 'Blockchain transaction hash';
COMMENT ON COLUMN payments.status IS 'Current status of the payment';
COMMENT ON COLUMN payments.error IS 'Error message if payment failed';
COMMENT ON COLUMN payments.created_at IS 'Timestamp when the payment was created';
COMMENT ON COLUMN payments.updated_at IS 'Timestamp when the payment was last updated';

-- =============================================================================
-- Function: update_updated_at_column
-- =============================================================================
-- Automatically updates the updated_at column on row updates
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on payments table
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
