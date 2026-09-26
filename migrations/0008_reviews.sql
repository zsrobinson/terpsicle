-- Terpsicle Reviews (docs/V2.md §7.3, DATA.md §7.8). Reviews are anonymous to
-- readers: author_id is here so people can edit and delete their own reviews
-- and so limits work, and only src/server/reviews/store.ts ever reads it.

-- Who a review is about. The id is the PlanetTerp slug when the name join
-- knows the instructor (so summaries/<slug>.json and links keep working),
-- else a minted 't~' + 10 base32 characters (V2 §7.2).
CREATE TABLE instructors (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,               -- display name (Testudo's, else PlanetTerp's)
  planetterp_slug  TEXT UNIQUE,
  created_at       TEXT NOT NULL
);

-- Testudo name → instructor, per department; filled at first use (a review
-- submitted for that name). 'manual' is the owner's correction.
CREATE TABLE instructor_names (
  name_key       TEXT NOT NULL,                 -- instructorNameKey(testudoName)
  dept           TEXT NOT NULL,
  instructor_id  TEXT NOT NULL REFERENCES instructors (id),
  rule           TEXT NOT NULL CHECK (rule IN ('planetterp', 'minted', 'manual')),
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (name_key, dept)
);

CREATE TABLE reviews (
  id             TEXT PRIMARY KEY,              -- 16 random bytes, base64url; also the moderation ref
  author_id      TEXT REFERENCES users (id) ON DELETE SET NULL,  -- null once the account is purged
  instructor_id  TEXT NOT NULL REFERENCES instructors (id),
  reviewed_name  TEXT NOT NULL,                 -- the Testudo name on screen, so a wrong join can be moved
  course         TEXT NOT NULL,                 -- CMSC351
  term_id        TEXT,                          -- when they took it; optional
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  grade          TEXT,                          -- A+ … F, W, P, or null ("Rather not say")
  body           TEXT NOT NULL,                 -- 40–2,000 characters; '' once blanked
  text_hash      TEXT NOT NULL,                 -- SHA-256 of reviewTextKey(body): catches copies
  status         TEXT NOT NULL CHECK (status IN ('published', 'held', 'rejected', 'hidden', 'deleted')),
  reason         TEXT,                          -- moderation reason code, shown to the author in plain words
  pending_edit   TEXT,                          -- JSON PendingEdit: an edit of a published review, waiting or turned down
  report_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  published_at   TEXT,
  edited_at      TEXT,
  updated_at     TEXT NOT NULL
);
-- One live review per (author, instructor, course): a second becomes an edit.
CREATE UNIQUE INDEX reviews_one_per_course ON reviews (author_id, instructor_id, course)
  WHERE status IN ('published', 'held', 'hidden');
CREATE INDEX reviews_by_instructor ON reviews (instructor_id, status, published_at DESC);
CREATE INDEX reviews_by_course ON reviews (course, status, published_at DESC);
CREATE INDEX reviews_by_author ON reviews (author_id);
CREATE INDEX reviews_changed ON reviews (updated_at);
CREATE INDEX reviews_by_hash ON reviews (instructor_id, text_hash);
-- The burst check: new reviews of one instructor by creation time.
CREATE INDEX reviews_by_instructor_created ON reviews (instructor_id, created_at);
