-- Migration: 0006_notifications
-- Notifications (docs/V2.md §6.3, V3.md §4): each person's settings, web
-- push subscriptions (one per device), chat mentions and replies for read
-- state and the digest, and every push and email we send. DATA.md §7.11
-- describes every column. The number was reserved for this in V2.md §13,
-- so it lands after the later ones (wrangler applies migrations by name).

-- NotificationSettingsSchema JSON; no row means the defaults.
CREATE TABLE notification_settings (
  user_id     TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  settings    TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE push_subscriptions (
  id                TEXT PRIMARY KEY,         -- 16 random bytes, base64url
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint          TEXT NOT NULL UNIQUE,     -- one per device
  p256dh            TEXT NOT NULL,            -- base64url
  auth              TEXT NOT NULL,            -- base64url
  user_agent_label  TEXT,                     -- "iPhone · Safari", for the settings list
  created_at        TEXT NOT NULL,
  last_success_at   TEXT,
  failure_count     INTEGER NOT NULL DEFAULT 0  -- consecutive; 10 → deleted
);
CREATE INDEX push_subscriptions_by_user ON push_subscriptions (user_id);

-- Chat mentions and replies, for read state and the email digest
-- (v2/chat-notify fills it). Pruned after 30 days.
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('chat-mention', 'chat-reply')),
  term_id     TEXT NOT NULL,
  course_code TEXT NOT NULL,
  room_id     TEXT NOT NULL,
  seq         INTEGER NOT NULL,               -- the message's seq in its room
  message_id  TEXT NOT NULL,
  actor_id    TEXT NOT NULL,                  -- who mentioned or replied
  created_at  TEXT NOT NULL,
  read_at     TEXT,
  emailed_at  TEXT
);
CREATE INDEX notifications_unread ON notifications (user_id, read_at, created_at);
CREATE INDEX notifications_by_room ON notifications (user_id, term_id, course_code, room_id, seq);

-- Every push and email we send, for dedupe and caps. The unique dedupe key
-- keeps a retried job from sending twice. user_id has no foreign key: the
-- account purge sets it to null and the rows stay for the counts.
CREATE TABLE notification_deliveries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT,
  type         TEXT NOT NULL CHECK (type IN ('seat-open', 'chat-mention', 'chat-reply', 'chat-digest', 'admin-urgent', 'todo-due')),
  channel      TEXT NOT NULL CHECK (channel IN ('push', 'email')),
  dedupe_key   TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider_id  TEXT,                          -- Email Service message id, or the push services' statuses
  sent_at      TEXT NOT NULL
);
CREATE INDEX notification_deliveries_by_user ON notification_deliveries (user_id, type, sent_at);
