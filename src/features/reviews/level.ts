import type { FeatureLevel } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";

// REVIEWS_ENABLED as the page sees it (V2 §7.4), from POST /api/me:
// - "off": PlanetTerp's numbers, grades and link only, as before Reviews;
// - "read": our reviews too, but no writing (deleting and reporting still work);
// - "on": everything.
// "loading" until /api/me answers, so nothing flashes in and out.

export type ReviewsLevel = FeatureLevel | "loading";

export function useReviewsLevel(): ReviewsLevel {
  const status = useAccount((s) => s.status);
  const level = useAccount((s) => s.flags.reviews);
  return status === "loading" ? "loading" : level;
}

/** Who's reading: signed out, or signed in (writing and reporting need it). */
export function useSignedIn(): boolean | "loading" {
  const status = useAccount((s) => s.status);
  return status === "loading" ? "loading" : status === "signed-in";
}
