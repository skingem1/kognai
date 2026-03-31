-- TICKET-032-A: Hermes Supervisor Protocol
-- Sprint A — Core Protocol tables
-- Apply: paste into Supabase SQL editor or run with psql

-- ─── sherlock_channel: Supabase event bus for Hermes four-marker protocol ───
CREATE TABLE IF NOT EXISTS sherlock_channel (
  id           SERIAL PRIMARY KEY,
  from_agent   TEXT NOT NULL,
  to_agent     TEXT NOT NULL,
  marker       TEXT NOT NULL CHECK (
    marker IN ('[STATUS_REQUEST]', '[REVIEW_REQUEST]', '[ESCALATION_NOTICE]', '[ACK]')
  ),
  message      TEXT,
  exchange_id  TEXT,          -- UUID grouping up to 3 messages per exchange
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sc_exchange  ON sherlock_channel(exchange_id);
CREATE INDEX IF NOT EXISTS idx_sc_ts        ON sherlock_channel(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sc_marker    ON sherlock_channel(marker);
CREATE INDEX IF NOT EXISTS idx_sc_to_agent  ON sherlock_channel(to_agent, timestamp DESC);

-- ─── acp_scores: Off-chain ACP score ledger (Phase 3 moves on-chain) ───
CREATE TABLE IF NOT EXISTS acp_scores (
  id          SERIAL PRIMARY KEY,
  agent_name  TEXT        NOT NULL,
  sprint_id   TEXT,
  score       INTEGER     NOT NULL CHECK (score >= 0 AND score <= 100),
  gate_passed BOOLEAN,
  notes       TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acp_agent     ON acp_scores(agent_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_acp_sprint    ON acp_scores(sprint_id);
CREATE INDEX IF NOT EXISTS idx_acp_score     ON acp_scores(score);

-- ─── Seed: 18 active agents at baseline score 50 ───
-- Run once; idempotent check via NOT EXISTS
INSERT INTO acp_scores (agent_name, sprint_id, score, gate_passed, notes)
SELECT agent_name, 'BASELINE-001', 50, true, 'Sprint A baseline seed — TICKET-032-A'
FROM (VALUES
  ('ceo'),
  ('cto'),
  ('cmo'),
  ('cfo'),
  ('supervisor'),
  ('devops'),
  ('bizdev'),
  ('market-intelligence'),
  ('security'),
  ('conflict-analyzer'),
  ('pipeline-health-monitor'),
  ('execution-verifier'),
  ('execution-watchdog'),
  ('sprint-retrospective'),
  ('test-failure-predictor'),
  ('spielberg'),
  ('kerat-publisher'),
  ('x-admin')
) AS agents(agent_name)
WHERE NOT EXISTS (
  SELECT 1 FROM acp_scores WHERE sprint_id = 'BASELINE-001' AND agent_name = agents.agent_name
);
