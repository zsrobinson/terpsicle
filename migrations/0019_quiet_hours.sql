-- Migration: 0019_quiet_hours
-- Quiet hours (docs/V2.md §6.7): a push that would land between 11pm and
-- 8am New York waits. Its inbox rows are written at once, as always, and
-- marked here; at 8am the every-5-minutes cron sends one push per group
-- that waited and clears the mark (a group read in the meantime sends
-- nothing). Nothing else changes, so a column rather than a rebuild.
ALTER TABLE notifications ADD COLUMN push_held_at TEXT;

-- The cron's look for waiting groups: tiny, and empty most of the day.
CREATE INDEX notifications_held ON notifications (push_held_at)
  WHERE push_held_at IS NOT NULL;
