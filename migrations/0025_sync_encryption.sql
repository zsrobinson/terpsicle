-- Synced data encrypted on the server with a key per account (docs/DATA.md
-- §7.7, docs/decisions.md "Synced data is encrypted on the server, with a key
-- per account"). Not end-to-end: the Worker opens what it stores, which is
-- how Chat and the calendar feed read your plans.

-- Each account's data key: 32 random bytes made on its first sync, sealed
-- (src/server/security/seal.ts) under the Worker secret USER_DATA_KEY and
-- bound to the account. Deleting the account deletes this row first.
CREATE TABLE user_keys (
  user_id       TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  wrapped_key   TEXT NOT NULL,  -- v1.<master key id>.<iv>.<ciphertext>, base64url
  master_key_id TEXT NOT NULL   -- USER_DATA_KEY_ID when it was wrapped; the daily job rewraps the rest after a rotation
);

-- From here on `sync_docs.body` and `todo_tasks.title` are sealed with that
-- key. There are no real users yet, so what's stored in plain text is
-- cleared rather than sealed in place: each device's next pull answers
-- `reset` (its cursor is now ahead of the empty account) and it uploads its
-- plans, settings and four-year plans again through first sign-in's merge.
-- Own tasks live only on the server, so they go, with their done marks.
DELETE FROM sync_docs;
DELETE FROM sync_heads;
DELETE FROM todo_done
WHERE EXISTS (
  SELECT 1 FROM todo_tasks t
  WHERE t.user_id = todo_done.user_id AND t.uid = todo_done.uid
);
DELETE FROM todo_tasks;
