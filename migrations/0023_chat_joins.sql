-- When each person's rooms began (the owner, 2026-09-29): a room's timeline
-- shows joins, grouped ("Alex, Sam and 3 others joined"). Written when a
-- sync push adds a course to someone's main plan or changes its section;
-- rows that stay keep theirs. Rows from before this have none, and show no
-- join.
ALTER TABLE chat_members ADD COLUMN joined_at TEXT;
