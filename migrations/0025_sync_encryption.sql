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
-- cleared rather than sealed in place, and every device uploads its plans,
-- settings and four-year plans again through first sign-in's merge.
DELETE FROM sync_docs;

-- Each account's head moves on one and every rev up to it counts as pruned,
-- so a pull from any cursor handed out before now answers `reset`
-- (`pullDocs`: 0 < since < pruned_through), however far new revs go. Revs
-- don't start over: had they, a device whose cursor another device's
-- uploads had already passed would get an ordinary page and skip them.
UPDATE sync_heads SET head = head + 1, pruned_through = head + 1;

-- `chat_members` stays. It's derived from the plans cleared above, but each
-- device's upload rewrites the same rows for its terms, and rows that come
-- out the same keep their `joined_at`; emptying it would announce everyone
-- as joining every room again.

-- Own tasks live only on the server, so they go, with their done marks.
-- (Sealing them in place instead would be one pass over the rows still in
-- plain text with `sealTaskTitle`, src/server/todo/store.ts, in place of
-- these two statements.)
DELETE FROM todo_done
WHERE EXISTS (
  SELECT 1 FROM todo_tasks t
  WHERE t.user_id = todo_done.user_id AND t.uid = todo_done.uid
);
DELETE FROM todo_tasks;
