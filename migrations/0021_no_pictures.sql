-- Migration: 0020_no_pictures
-- No profile pictures (the owner, 2026-09-28; docs/decisions.md). Terpsicle
-- stops storing Google's picture URL and its cached copy. This only nulls the
-- two columns: the build still serving while this deploys reads and writes
-- them, and dropping them under it would break sign-in. A later migration
-- drops them once that build is gone (src/server/auth/legacy-pictures.ts);
-- the daily job deletes the copies in R2.
UPDATE users SET picture_url = NULL, picture_key = NULL;
