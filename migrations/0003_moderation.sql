-- Migration: 0003_moderation
-- Moderation for Reviews and Chat (docs/MODERATION.md). Neither table stores
-- who wrote anything: only a reference to the item (kind + target_id), so
-- the owner's queue can't show an author even by accident.

-- Every decision, automatic or by the owner, newest last. The latest row for
-- a target is its current state.
CREATE TABLE moderation_decisions (
  id         TEXT PRIMARY KEY,                  -- 16 random bytes, base64url
  kind       TEXT NOT NULL CHECK (kind IN ('review', 'chat')),
  target_id  TEXT NOT NULL,                     -- the review or message id
  decision   TEXT NOT NULL CHECK (decision IN ('publish', 'hold', 'remove')),
  actor      TEXT NOT NULL CHECK (actor IN ('auto', 'admin')),
  reasons    TEXT NOT NULL,                     -- JSON ModerationReason[]
  models     TEXT NOT NULL,                     -- JSON {guard, policy}: model ids, or null when a stage didn't run
  scores     TEXT NOT NULL,                     -- JSON policy scores, {} when the policy model didn't run
  created_at TEXT NOT NULL                      -- ISO UTC
);

CREATE INDEX moderation_decisions_by_target
  ON moderation_decisions (kind, target_id, created_at);

-- Held items waiting for the owner, and what the owner decided (kept so a
-- decision can be undone). One row per target: moderating an edit again
-- puts the same row back to pending with the new text.
CREATE TABLE moderation_queue (
  id                TEXT PRIMARY KEY,           -- 16 random bytes, base64url
  kind              TEXT NOT NULL CHECK (kind IN ('review', 'chat')),
  target_id         TEXT NOT NULL,
  course            TEXT,                       -- e.g. CMSC351, for context
  text              TEXT NOT NULL,              -- what was held, as written
  reasons           TEXT NOT NULL,              -- JSON ModerationReason[]
  scores            TEXT NOT NULL,              -- JSON policy scores
  urgent            INTEGER NOT NULL DEFAULT 0 CHECK (urgent IN (0, 1)),
  status            TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'removed')),
  created_at        TEXT NOT NULL,
  resolved_at       TEXT,
  resolution_reason TEXT,                       -- AdminReason
  resolution_note   TEXT,                       -- up to 300 characters
  UNIQUE (kind, target_id)
);

-- The owner's list: urgent first, then oldest first.
CREATE INDEX moderation_queue_pending
  ON moderation_queue (status, urgent DESC, created_at);
