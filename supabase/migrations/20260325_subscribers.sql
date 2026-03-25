-- Sprint 1238 / LEMON-SCAFFOLD-01
-- Subscribers table for LemonSqueezy subscriptions

CREATE TABLE IF NOT EXISTS subscribers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lemon_subscription_id text        UNIQUE NOT NULL,
  user_email            text        NOT NULL,
  plan                  text        NOT NULL,
  status                text        NOT NULL,   -- active | cancelled | expired | paused
  activated_at          timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscribers_email_idx  ON subscribers (user_email);
CREATE INDEX IF NOT EXISTS subscribers_status_idx ON subscribers (status);
