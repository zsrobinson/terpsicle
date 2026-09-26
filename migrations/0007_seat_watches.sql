-- Migration: 0007_seat_watches
-- Seat alerts move to accounts (docs/V2.md §6.5): a signed-in person watches
-- a section, and the seats cron emails them when it reopens. The email-token
-- tables retire rather than migrate (nothing was public; STATUS.md).
-- docs/DATA.md §7.1 describes every column.

DROP TABLE alert_tokens;
DROP TABLE email_sends;
DROP TABLE alert_subscriptions;

CREATE TABLE seat_watches (
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id             TEXT NOT NULL,
  section_key         TEXT NOT NULL,          -- e.g. CMSC351-0101
  created_at          TEXT NOT NULL,          -- ISO UTC
  last_open           INTEGER,                -- open seats at the last check
  last_checked_at     TEXT,
  last_notified_at    TEXT,
  last_notified_open  INTEGER,
  PRIMARY KEY (user_id, term_id, section_key)
);

-- The seats cron reads a term's watches after each seats file.
CREATE INDEX seat_watches_by_section ON seat_watches (term_id, section_key);

-- Every seat-open notification: the unique dedupe key keeps a retried cron
-- from sending twice, and the per-person daily cap counts these rows.
-- (v2/push's notification_deliveries can take these over.)
CREATE TABLE seat_alert_sends (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id      TEXT NOT NULL,
  section_key  TEXT NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('email')),
  dedupe_key   TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_id  TEXT,                          -- Email Service message id
  sent_at      TEXT NOT NULL
);

CREATE INDEX seat_alert_sends_by_user ON seat_alert_sends (user_id, sent_at);
