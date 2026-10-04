-- Migration: 0024_latest_reviews
-- /reviews lists the newest reviews anywhere (owner, 2026-09-29: "recent
-- reviews", as PlanetTerp's front page has). Without this, `reviews/latest`
-- would read and sort every PlanetTerp review to find the newest few.
-- IF NOT EXISTS: the previews database applied this as 0023_latest_reviews
-- before main's 0023_chat_joins took that number, so it runs there twice.
CREATE INDEX IF NOT EXISTS planetterp_reviews_by_created
  ON planetterp_reviews (created_at DESC, id DESC);
