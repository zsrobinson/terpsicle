-- Terpsicle Chat's indexes in D1 (docs/V2.md §8.5, DATA.md §7.8). Messages
-- live in each course's CourseChat Durable Object (its own SQLite); these
-- tables are what the Worker needs without waking an object: who's in a
-- course, what you follow and mute, and unread counts for the chat list.

-- Sections in each user's chat plan, per term (V2 §8.2). Derived from the
-- stored sync docs and rewritten by sync/push; never edited directly.
CREATE TABLE chat_members (
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id       TEXT NOT NULL,
  course_code   TEXT NOT NULL,
  section_code  TEXT NOT NULL DEFAULT '',     -- '' for a saved-for-later course
  PRIMARY KEY (user_id, term_id, course_code)
);
CREATE INDEX chat_members_by_course ON chat_members (term_id, course_code, section_code);

-- Course rooms opened from outside your plan ("Open CMSC351 chat").
CREATE TABLE chat_follows (
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id      TEXT NOT NULL,
  course_code  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, term_id, course_code)
);

-- One row per room with at least one visible message (V2 §8.3). Written by
-- the object. `kind` and `sections` (the room's section codes, JSON) let the
-- unread query pick your professor and section rooms without the catalog.
CREATE TABLE chat_rooms (
  term_id          TEXT NOT NULL,
  course_code      TEXT NOT NULL,
  room_id          TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('course', 'professor', 'section')),
  sections         TEXT NOT NULL DEFAULT '[]',
  last_seq         INTEGER NOT NULL,          -- the room's latest visible message
  last_message_at  TEXT NOT NULL,
  PRIMARY KEY (term_id, course_code, room_id)
);

-- How far each person has read, per room: a message seq in that room.
CREATE TABLE chat_read_markers (
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id      TEXT NOT NULL,
  course_code  TEXT NOT NULL,
  room_id      TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  PRIMARY KEY (user_id, term_id, course_code, room_id)
);

CREATE TABLE chat_room_prefs (
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  term_id      TEXT NOT NULL,
  course_code  TEXT NOT NULL,
  room_id      TEXT NOT NULL,
  muted        INTEGER NOT NULL DEFAULT 0 CHECK (muted IN (0, 1)),
  PRIMARY KEY (user_id, term_id, course_code, room_id)
);

-- Where a user has posted, so account deletion can reach every object.
CREATE TABLE chat_author_courses (
  user_id      TEXT NOT NULL,                  -- no FK: the purge reads it after deleting the user
  term_id      TEXT NOT NULL,
  course_code  TEXT NOT NULL,
  PRIMARY KEY (user_id, term_id, course_code)
);
