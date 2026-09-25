import { TONE_TEXT, type Tone } from "~/app/emphasis";
import type { ConnectionVerdict } from "~/core/schema";

// The one place a verdict's tone is decided (SPEC §3.3): neutral when
// there's enough time, amber when tight, red when there isn't enough. Route
// data that's missing is neutral too, never a warning. The color goes on the
// verdict's words only (docs/UX-REVIEW.md §2.5).

export const VERDICT_TONE = {
  ok: "muted",
  tight: "warn",
  insufficient: "error",
  unknown: "muted",
  "no-route": "muted",
} as const satisfies Record<ConnectionVerdict, Tone>;

/** Class names for a verdict's words. */
export function verdictText(verdict: ConnectionVerdict): string {
  return TONE_TEXT[VERDICT_TONE[verdict]];
}
