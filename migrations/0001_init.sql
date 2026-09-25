-- Migration: 0001_init
-- D1 holds only seat-alert subscriptions (SPEC.md §3.12); their tables arrive
-- with M7. This migration exists so `wrangler d1 migrations apply` has a
-- baseline and every environment (production, previews, tests) is on it.
SELECT 1;
