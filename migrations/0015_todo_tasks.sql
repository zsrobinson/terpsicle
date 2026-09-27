-- Your own tasks in Todo, typed in Terpsicle ("Add a task…", docs/V3.md
-- §3.10). They never go to ELMS. A table of their own rather than a third
-- `todo_items` source: each fetch rewrites `todo_items` by source, its
-- `due_date` can't be empty, and its source CHECK would need a rebuild.
-- Done marks stay in `todo_done`, under the task's uid.
CREATE TABLE todo_tasks (
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  uid         TEXT NOT NULL,   -- own-<random>, made by the app so Undo can put a task back
  title       TEXT NOT NULL,   -- plain text, ≤ 300 chars
  course_code TEXT,            -- the course it's for, or null
  due_at      TEXT,            -- the instant, when it has a time
  due_date    TEXT,            -- its America/New_York date; null is "No date"
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, uid),
  CHECK (due_at IS NULL OR due_date IS NOT NULL)
);
CREATE INDEX todo_tasks_by_date ON todo_tasks (user_id, due_date);
CREATE INDEX todo_tasks_due_day ON todo_tasks (due_date, user_id);
