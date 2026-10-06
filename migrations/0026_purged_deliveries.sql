-- Migration: 0026_purged_deliveries
-- The account purge used to keep a deleted person's notification_deliveries
-- rows with user_id set to null, but every dedupe key spells out the
-- directory ID (`seat-open:<id>:…`, `todo-due:<id>:…`), so those rows still
-- named them until the 90-day prune. The purge now deletes the rows
-- (src/server/auth/purge.ts); this deletes the ones it left before. Every
-- send records its person, so a null user_id only ever meant a purged
-- account.
DELETE FROM notification_deliveries WHERE user_id IS NULL;
