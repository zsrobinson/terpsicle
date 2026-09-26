-- Migration: 0004_moderation
-- The shared moderation service for Reviews and Chat (docs/V2.md §9.4,
-- docs/MODERATION.md). Nothing here names an author: items are a surface and
-- a ref. User ids (reports.reporter_id) are plain TEXT without foreign keys,
-- so this and 0003_identity can land in either order.

-- Every automated and human decision, text-free. Kept a year.
CREATE TABLE moderation_decisions (
  id           TEXT PRIMARY KEY,                -- 16 random bytes, base64url
  surface      TEXT NOT NULL CHECK (surface IN ('review', 'chat')),
  ref          TEXT NOT NULL,                   -- review id, or '<term>:<course>:<messageId>'
  stage        TEXT NOT NULL CHECK (stage IN ('rules', 'model', 'human', 'reports')),
  verdict      TEXT NOT NULL CHECK (verdict IN ('allow', 'hold', 'reject', 'remove', 'restore', 'hide')),
  labels       TEXT NOT NULL DEFAULT '[]',      -- JSON ModerationReason[]: code, source, action, span
  guard        TEXT,                            -- JSON: Llama Guard's answer {safe, categories}
  policy       TEXT,                            -- JSON: the instruct model's scores, 0–1 per label
  models       TEXT,                            -- JSON: model ids used {guard, policy}
  latency_ms   INTEGER,
  decided_by   TEXT NOT NULL CHECK (decided_by IN ('system', 'admin')),
  reason       TEXT,                            -- the owner's reason (AdminReason)
  created_at   TEXT NOT NULL
);
CREATE INDEX moderation_decisions_by_ref ON moderation_decisions (surface, ref, created_at);
CREATE INDEX moderation_decisions_recent ON moderation_decisions (created_at);

-- The human queue. The snapshot is what the admin sees; blanked 30 days after
-- close. 'retry' (beyond V2 §9.4): held only because a model failed or the
-- daily cap was spent. The every-5-minutes cron screens it again, and only if
-- that keeps failing does it become 'open' for the owner.
CREATE TABLE moderation_queue (
  id          TEXT PRIMARY KEY,                 -- 16 random bytes, base64url
  surface     TEXT NOT NULL CHECK (surface IN ('review', 'chat')),
  ref         TEXT NOT NULL,
  snapshot    TEXT,                             -- JSON: text, context, scores, retries; reviews: no author, ever
  labels      TEXT NOT NULL DEFAULT '[]',
  urgent      INTEGER NOT NULL DEFAULT 0 CHECK (urgent IN (0, 1)),
  status      TEXT NOT NULL CHECK (status IN ('retry', 'open', 'closed')),
  created_at  TEXT NOT NULL,
  closed_at   TEXT
);
CREATE UNIQUE INDEX moderation_queue_open ON moderation_queue (surface, ref)
  WHERE status IN ('retry', 'open');
CREATE INDEX moderation_queue_by_age ON moderation_queue (status, urgent DESC, created_at);

-- Reader reports (V2 §9.3). reports/create lands with Reviews (V2 §15).
CREATE TABLE reports (
  surface      TEXT NOT NULL CHECK (surface IN ('review', 'chat')),
  ref          TEXT NOT NULL,
  reporter_id  TEXT NOT NULL,
  reason       TEXT NOT NULL,
  note         TEXT,                            -- ≤ 300 characters
  created_at   TEXT NOT NULL,
  PRIMARY KEY (surface, ref, reporter_id)
);
