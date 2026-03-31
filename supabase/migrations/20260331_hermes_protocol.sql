-- TICKET-032-A Task 2 — Hermes Protocol tables (20260331)
-- Specification-compliant schema with SERIAL PK + TEXT exchange_id
-- Companion to 20260330_hermes_tables.sql (UUID-based schema for hermes-channel.ts)

-- Note: sherlock_channel below uses SERIAL+TEXT for spec compliance.
-- hermes-channel.ts upserts with the uuid-primary-key schema (from 20260330 migration).
-- Both CREATE TABLE IF NOT EXISTS statements are idempotent.

CREATE TABLE IF NOT EXISTS sherlock_channel (
  id SERIAL PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  marker TEXT NOT NULL CHECK (marker IN ('STATUS_REQUEST','REVIEW_REQUEST','ESCALATION_NOTICE','ACK')),
  message TEXT,
  exchange_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acp_scores (
  agent_name TEXT NOT NULL,
  sprint_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  gate_passed BOOLEAN,
  notes TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agent_name, sprint_id)
);

CREATE INDEX IF NOT EXISTS idx_sherlock_channel_exchange ON sherlock_channel(exchange_id);
CREATE INDEX IF NOT EXISTS idx_sherlock_channel_timestamp ON sherlock_channel(timestamp);
