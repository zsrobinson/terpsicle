-- Feedback: "Report a bug" and "Suggest a feature" from the feedback sheet,
-- and the owner's pinned notes on a deployment (docs/FEEDBACK.md).
-- Screenshots live in USER_CONTENT under feedback/<yyyy-mm>/<id>…, served
-- only to the admin at /admin/feedback/shot/<id>[/element].

-- Similar open items the model grouped, with its one-line summary.
CREATE TABLE feedback_groups (
  id          TEXT PRIMARY KEY,                -- 22-char random id
  summary     TEXT NOT NULL,                   -- LLM text: shown with the sparkles
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE feedback (
  id                TEXT PRIMARY KEY,          -- 22-char random id
  kind              TEXT NOT NULL CHECK (kind IN ('bug', 'idea', 'review')),
  product           TEXT NOT NULL CHECK (product IN ('schedule', 'reviews', 'chat', 'plan', 'todo', 'site', 'settings', 'admin')),
  path              TEXT NOT NULL,             -- scrubbed like analytics; a pinned note keeps its search params
  text              TEXT NOT NULL,
  expected          TEXT,                      -- "What did you expect?", bugs only
  screenshot_key    TEXT,                      -- USER_CONTENT key, or null (none, or expired)
  element_shot_key  TEXT,                      -- a pinned note's cropped element
  context           TEXT,                      -- JSON (FeedbackContextSchema); null when "Include what I was doing" was off
  element           TEXT,                      -- JSON (FeedbackElementSchema), pinned notes only
  host              TEXT NOT NULL,             -- terpsicle.com, or pr-<n>-terpsicle.zsrobinson.workers.dev
  user_id           TEXT REFERENCES users (id) ON DELETE SET NULL, -- only when they asked for a reply (or the admin's own note)
  status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'planned', 'fixed', 'wont-fix', 'spam')),
  group_id          TEXT REFERENCES feedback_groups (id) ON DELETE SET NULL,
  note              TEXT,                      -- the owner's own note
  undo_hash         TEXT,                      -- hex SHA-256 of the sender's undo token; cleared after 10 minutes
  replied_at        TEXT,                      -- when the "Fixed" email went out; it goes once
  deleted_at        TEXT,                      -- the admin deleted it; gone for good 10 seconds on
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  closed_at         TEXT                       -- set by fixed, wont-fix and spam; cleared on reopening
);
CREATE INDEX feedback_by_status ON feedback (status, created_at);
CREATE INDEX feedback_by_product ON feedback (product, created_at);
CREATE INDEX feedback_by_kind ON feedback (kind, created_at);
CREATE INDEX feedback_by_created ON feedback (created_at);
CREATE INDEX feedback_by_user ON feedback (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX feedback_by_group ON feedback (group_id) WHERE group_id IS NOT NULL;
