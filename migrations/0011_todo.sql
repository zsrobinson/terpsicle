-- Terpsicle Todo: deadlines from a student's ELMS calendar feed, and from
-- .ics files they drop (docs/V3.md §3.4, DATA.md §7.8).

-- A connected source per user. Only 'elms' is fetched; the key leaves room for
-- another source without a rebuild.
CREATE TABLE todo_feeds (
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source           TEXT NOT NULL CHECK (source IN ('elms')),
  url_enc          TEXT NOT NULL,              -- v1.<keyId>.<iv>.<ciphertext>; never logged, never returned
  status           TEXT NOT NULL CHECK (status IN ('active', 'paused', 'broken')),
  created_at       TEXT NOT NULL,
  next_fetch_at    TEXT NOT NULL,
  last_fetch_at    TEXT,
  last_success_at  TEXT,
  failure_count    INTEGER NOT NULL DEFAULT 0, -- consecutive
  last_error       TEXT,                       -- a code: 'timeout', 'http-404', 'not-a-calendar', …
  gone_strikes     INTEGER NOT NULL DEFAULT 0, -- 401/403/404/410 answers in a row, at least an hour apart; 3 → broken
  gone_at          TEXT,                       -- when the last strike counted
  etag             TEXT,
  last_modified    TEXT,
  content_hash     TEXT,                       -- 16 hex of SHA-256 of the body: unchanged feeds write nothing
  item_count       INTEGER NOT NULL DEFAULT 0,
  last_opened_at   TEXT NOT NULL,              -- the person last loaded /todo (for the cadence)
  PRIMARY KEY (user_id, source)
);
CREATE INDEX todo_feeds_due ON todo_feeds (status, next_fetch_at);

-- Items from the feed or a dropped file. Rewritten by each fetch.
CREATE TABLE todo_items (
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  uid           TEXT NOT NULL,                -- the ICS UID (≤ 200 chars)
  source        TEXT NOT NULL CHECK (source IN ('elms', 'file')),
  title         TEXT NOT NULL,                -- SUMMARY without the course bracket, ≤ 300 chars
  course_label  TEXT,                         -- the bracket's text: "CMSC216-0103: Introduction to Computer Systems"
  course_code   TEXT,                         -- the first code matched from course_label (V3 §3.6), or null
  section_code  TEXT,
  kind          TEXT NOT NULL CHECK (kind IN ('assignment', 'event')),
  exam          INTEGER NOT NULL DEFAULT 0 CHECK (exam IN (0, 1)),       -- the title reads like an exam or quiz
  gradescope    INTEGER NOT NULL DEFAULT 0 CHECK (gradescope IN (0, 1)), -- V3 §3.7
  due_at        TEXT,                         -- instant; null for an all-day item
  due_date      TEXT NOT NULL,                -- America/New_York date of due_at, or the all-day date
  link          TEXT,                         -- an ELMS URL from the item, or null
  first_seen_at TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, uid)
);
CREATE INDEX todo_items_by_date ON todo_items (user_id, due_date);
CREATE INDEX todo_items_due_day ON todo_items (due_date, user_id);

-- Done marks, kept apart from items so a refetch never clears them.
CREATE TABLE todo_done (
  user_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  uid      TEXT NOT NULL,
  done_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, uid)
);
