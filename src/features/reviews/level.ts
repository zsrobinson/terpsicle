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
  const last = useAccount((s) => s.lastKnown);
  const level = useAccount((s) => s.flags.reviews);
  // The flags this browser last saw stand in while /api/me answers.
  return status === "loading" && last === null ? "loading" : level;
}

/**
 * Signed in, signed out, or not known yet: what /api/me said, else what
 * this browser last saw. Where it's "unknown", a part that depends on the
 * account draws a placeholder of its size, never the signed-out words
 * (owner, 2026-09-30: "a bit of a flash of un-signed in state").
 */
export function useAccountView(): "signed-in" | "signed-out" | "unknown" {
  const status = useAccount((s) => s.status);
  const last = useAccount((s) => s.lastKnown);
  if (status !== "loading") return status;
  return last ?? "unknown";
}

/** Who's reading: signed out, or signed in (writing and reporting need it). */
export function useSignedIn(): boolean | "loading" {
  const status = useAccount((s) => s.status);
  return status === "loading" ? "loading" : status === "signed-in";
}
