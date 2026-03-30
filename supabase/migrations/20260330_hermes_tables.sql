-- TICKET-032-A — Sherlock v2 Hermes Protocol tables
-- Sprint date: 2026-03-30

-- ── sherlock_channel ─────────────────────────────────────────────────────────
-- Stores every Hermes Protocol message. Each row is one message in an exchange.
-- exchange_id groups messages into a conversation (max 3 per exchange).
-- status: open = active, acked = closed via ACK, escalated = exceeded 3-msg limit,
--         expired = exchange_id older than 24h without ACK.

CREATE TABLE IF NOT EXISTS sherlock_channel (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id  uuid        NOT NULL,
  sequence     int         NOT NULL CHECK (sequence BETWEEN 1 AND 3),
  from_agent   text        NOT NULL,
  to_agent     text        NOT NULL,
  marker       text        NOT NULL CHECK (marker IN (
                             'STATUS_REQUEST',
                             'REVIEW_REQUEST',
                             'ESCALATION_NOTICE',
                             'ACK'
                           )),
  payload      text        NOT NULL DEFAULT '',
  sprint_id    text,                         -- originating sprint, if known
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN (
                             'open', 'acked', 'escalated', 'expired'
                           )),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sherlock_channel_exchange_idx  ON sherlock_channel (exchange_id);
CREATE INDEX IF NOT EXISTS sherlock_channel_agent_idx     ON sherlock_channel (from_agent);
CREATE INDEX IF NOT EXISTS sherlock_channel_marker_idx    ON sherlock_channel (marker);
CREATE INDEX IF NOT EXISTS sherlock_channel_status_idx    ON sherlock_channel (status);
CREATE INDEX IF NOT EXISTS sherlock_channel_created_idx   ON sherlock_channel (created_at DESC);

-- ── acp_scores ───────────────────────────────────────────────────────────────
-- Supabase mirror of acp/trust-scores.json.
-- Synced after every sprint via post-sprint-governance.ts.
-- Enables distributed read access without filesystem dependency.

CREATE TABLE IF NOT EXISTS acp_scores (
  agent_id              text        PRIMARY KEY,
  safety                int         NOT NULL DEFAULT 70,
  accuracy              int         NOT NULL DEFAULT 70,
  brand_alignment       int         NOT NULL DEFAULT 70,
  cultural_sensitivity  int         NOT NULL DEFAULT 70,
  legal_compliance      int         NOT NULL DEFAULT 70,
  psychological_resilience int      NOT NULL DEFAULT 70,
  composite             int         NOT NULL DEFAULT 70,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acp_scores_composite_idx ON acp_scores (composite DESC);
