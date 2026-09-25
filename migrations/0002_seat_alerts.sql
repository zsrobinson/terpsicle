-- Migration: 0002_seat_alerts
-- Seat-alert subscriptions, the only server-side user data (SPEC.md §1,
-- principle 6), plus the counters that rate-limit the API and cap review
-- summaries. docs/DATA.md §7 describes every column.

CREATE TABLE alert_subscriptions (
  id                 TEXT PRIMARY KEY,          -- 16 random bytes, base64url
  email              TEXT NOT NULL,             -- trimmed, lowercased
  term_id            TEXT NOT NULL,
  section_key        TEXT NOT NULL,             -- e.g. CMSC351-0101
  status             TEXT NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed')),
  created_at         TEXT NOT NULL,             -- ISO UTC
  confirmed_at       TEXT,
  unsubscribed_at    TEXT,
  last_open          INTEGER,                   -- open seats at the last check
  last_checked_at    TEXT,
  last_notified_at   TEXT,
  last_notified_open INTEGER,
  UNIQUE (email, term_id, section_key)
);

-- The seats cron reads active watchers per term.
CREATE INDEX alert_subscriptions_active
  ON alert_subscriptions (term_id, section_key)
  WHERE status = 'active';

-- Every token handed out, by SHA-256 only. Confirm tokens expire and are
-- single-use; manage tokens (unsubscribe links, the confirming browser) don't.
CREATE TABLE alert_tokens (
  token_hash      TEXT PRIMARY KEY,             -- hex SHA-256
  subscription_id TEXT NOT NULL REFERENCES alert_subscriptions (id) ON DELETE CASCADE,
  purpose         TEXT NOT NULL CHECK (purpose IN ('confirm', 'manage')),
  created_at      TEXT NOT NULL,
  expires_at      TEXT,
  used_at         TEXT
);

CREATE INDEX alert_tokens_by_subscription ON alert_tokens (subscription_id, purpose);

-- Every email we send: dedupe for cron retries, and per-address caps.
CREATE TABLE email_sends (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL,
  subscription_id TEXT REFERENCES alert_subscriptions (id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('confirm', 'already-watching', 'seat-open')),
  dedupe_key      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_id     TEXT,                         -- Email Service message id
  sent_at         TEXT NOT NULL
);

CREATE INDEX email_sends_by_email ON email_sends (email, kind, sent_at);

-- Fixed-window counters: API rate limits keyed by a keyed hash of the caller's
-- IP (never the IP itself), and the daily review-summary cap.
CREATE TABLE counters (
  name         TEXT NOT NULL,                   -- e.g. subscribe-ip:<hmac>, summaries
  window_start TEXT NOT NULL,                   -- ISO UTC start of the window
  count        INTEGER NOT NULL,
  PRIMARY KEY (name, window_start)
);
