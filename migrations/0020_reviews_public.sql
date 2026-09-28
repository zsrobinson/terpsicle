-- Migration: 0020_reviews_public
-- Reviews as a public website (docs/V2.md §7.6, owner 2026-09-28):
-- PlanetTerp's reviews are shown beside ours, each marked as theirs, and
-- the admin tracks which semesters' grade data has been asked for.

-- PlanetTerp's reviews, as the nightly job reads them from its API
-- (src/jobs/planetterp-reviews.ts). Only what a page shows: no author
-- (PlanetTerp publishes none), no professor name (the id says who).
-- PlanetTerp reviews have no id of their own, so ours hashes the slug,
-- the date and the words.
CREATE TABLE planetterp_reviews (
  id              TEXT PRIMARY KEY,          -- 16 hex of SHA-256(slug, created, text)
  instructor_id   TEXT NOT NULL,             -- PlanetTerp slug
  course          TEXT,                      -- as PlanetTerp has it, uppercased; null when not given
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  expected_grade  TEXT,                      -- A+ … F, W, P when it's a real grade, else null
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL              -- PlanetTerp's `created`, ISO 8601
);
CREATE INDEX planetterp_reviews_by_instructor
  ON planetterp_reviews (instructor_id, created_at DESC, id DESC);
CREATE INDEX planetterp_reviews_by_course
  ON planetterp_reviews (course, created_at DESC, id DESC);

-- One row per instructor: the hash of their reviews as last stored, so a
-- night only rewrites the instructors whose reviews changed.
CREATE TABLE planetterp_review_sets (
  instructor_id  TEXT PRIMARY KEY,
  hash           TEXT NOT NULL,
  count          INTEGER NOT NULL,
  updated_at     TEXT NOT NULL
);

-- Admin's Grade data page: when a semester's Public Information Act
-- request went out, and a note (a reference number, what came back).
CREATE TABLE grade_requests (
  term_id     TEXT PRIMARY KEY,            -- 202601
  sent_on     TEXT,                        -- YYYY-MM-DD; null until sent
  note        TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);
