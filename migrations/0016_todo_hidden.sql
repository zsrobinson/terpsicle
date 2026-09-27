-- Courses a person hid in Todo ("Hide CMSC216", docs/V3.md §3.11): clubs,
-- office hours or anything else on the feed they don't want. Kept next to
-- done marks, so it follows the account; a hidden course's items never show
-- in the list, the week's progress or "Due tomorrow".
CREATE TABLE todo_hidden (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_key TEXT NOT NULL,   -- a course code, or the ELMS course name when there's no code
  hidden_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, course_key)
);
