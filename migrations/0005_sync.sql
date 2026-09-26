-- Plan sync (docs/V2.md §5.2, DATA.md §7.7): one JSON row per doc, saved
-- whole with a per-doc rev compare-and-swap. Not end-to-end encrypted.

-- A plan doc per plan, plus one settings doc per user. A deleted plan stays
-- as a tombstone (deleted = 1, body NULL) for 30 days, so other devices
-- learn it's gone, then the daily job prunes it.
CREATE TABLE sync_docs (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('plan', 'settings')),
  doc_id     TEXT NOT NULL,                     -- plan: its LocalId; settings: 'settings'
  term_id    TEXT,                              -- plans (a tombstone keeps its plan's); NULL for settings
  rev        INTEGER NOT NULL CHECK (rev >= 1), -- sync_heads.head at the save
  deleted    INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  body       TEXT,                              -- JSON (PlanDocSchema / SettingsDocSchema); NULL when deleted
  updated_at TEXT NOT NULL,                     -- server time of the save, ISO UTC
  PRIMARY KEY (user_id, kind, doc_id),
  CHECK ((deleted = 1) = (body IS NULL)),
  CHECK (kind = 'plan' OR deleted = 0)
);
-- The pull cursor: every doc of a user with rev > n, in rev order.
CREATE UNIQUE INDEX sync_docs_since ON sync_docs (user_id, rev);
-- The daily job's tombstone pruning.
CREATE INDEX sync_docs_tombstones ON sync_docs (updated_at) WHERE deleted = 1;

-- Each user's rev counter. Every save takes head + 1, so revs never repeat
-- and "rev > cursor" finds everything saved since.
CREATE TABLE sync_heads (
  user_id        TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  head           INTEGER NOT NULL DEFAULT 0,  -- the latest rev handed out
  pruned_through INTEGER NOT NULL DEFAULT 0   -- tombstones with rev <= this may be gone
);
