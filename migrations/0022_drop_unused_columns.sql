-- Migration: 0022_drop_unused_columns
-- Drops four columns nothing has read or written since their PRs deployed.
-- Those PRs left them in place so the build still serving during each deploy
-- kept working; both are live now, so no deployed build touches them.
--
-- - `todo_items.exam` and `todo_items.gradescope`: no exam marking and no
--   Gradescope detection (v3/todo-calendar; docs/decisions.md). Always 0.
-- - `users.picture_url` and `users.picture_key`: no profile pictures
--   (0021_no_pictures nulled them; docs/decisions.md). Always null.
--
-- SQLite's DROP COLUMN refuses a column that's indexed, keyed, unique, in a
-- foreign key, a view, a trigger or another column's CHECK. None of these
-- is: `exam` and `gradescope` carry only their own CHECK (IN (0, 1)), which
-- goes with them, and no index, view or trigger names any of the four.
ALTER TABLE todo_items DROP COLUMN exam;
ALTER TABLE todo_items DROP COLUMN gradescope;
ALTER TABLE users DROP COLUMN picture_url;
ALTER TABLE users DROP COLUMN picture_key;
