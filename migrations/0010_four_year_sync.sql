-- Terpsicle Plan's four-year docs join plan sync as a third kind (docs/V3.md
-- §2.4, DATA.md §7.7). SQLite can't alter a CHECK, so sync_docs is rebuilt:
-- create the new table, copy every row, drop the old one, rename, and
-- recreate its indexes. Nothing references sync_docs, so the rebuild stays
-- local to it. Numbered before 0011_todo on purpose (V3 §8); D1 applies
-- whichever migrations a database hasn't seen, by name.
PRAGMA defer_foreign_keys = on;

CREATE TABLE sync_docs_new (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('plan', 'settings', 'four-year')),
  doc_id     TEXT NOT NULL,                     -- plan / four-year: its LocalId; settings: 'settings'
  term_id    TEXT,                              -- plans (a tombstone keeps its plan's); NULL for settings and four-year
  rev        INTEGER NOT NULL CHECK (rev >= 1), -- sync_heads.head at the save
  deleted    INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  body       TEXT,                              -- JSON (PlanDocSchema / SettingsDocSchema / the four-year doc); NULL when deleted
  updated_at TEXT NOT NULL,                     -- server time of the save, ISO UTC
  PRIMARY KEY (user_id, kind, doc_id),
  CHECK ((deleted = 1) = (body IS NULL)),
  CHECK (kind IN ('plan', 'four-year') OR deleted = 0)
);

INSERT INTO sync_docs_new
  (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
SELECT user_id, kind, doc_id, term_id, rev, deleted, body, updated_at
FROM sync_docs;

DROP TABLE sync_docs;
ALTER TABLE sync_docs_new RENAME TO sync_docs;

-- As in 0005_sync.sql: the pull cursor, and the daily job's tombstone pruning.
CREATE UNIQUE INDEX sync_docs_since ON sync_docs (user_id, rev);
CREATE INDEX sync_docs_tombstones ON sync_docs (updated_at) WHERE deleted = 1;
