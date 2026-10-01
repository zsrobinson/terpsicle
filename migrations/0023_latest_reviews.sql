-- Migration: 0023_latest_reviews
-- /reviews lists the newest reviews anywhere (owner, 2026-09-29: "recent
-- reviews", as PlanetTerp's front page has). Without this, `reviews/latest`
-- would read and sort every PlanetTerp review to find the newest few.
CREATE INDEX planetterp_reviews_by_created
  ON planetterp_reviews (created_at DESC, id DESC);
