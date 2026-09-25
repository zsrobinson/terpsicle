import {
  type ConnectionVerdict,
  FEET_PER_MINUTE_PER_MPH,
  PACE_MPH,
  TIGHT_SHARE,
  type TravelMode,
  type TravelSettings,
} from "../schema";

// The walking-time math (docs/DATA.md §6). The "How?" explanation shows
// exactly these steps, so keep them in sync with `travelMath`.

export function feetPerMinute(settings: TravelSettings): number {
  return PACE_MPH[settings.pace] * FEET_PER_MINUTE_PER_MPH;
}

/** ceil(feet / (mph × 88)) + extra minutes. */
export function walkMinutes(
  distanceFeet: number,
  settings: TravelSettings,
): number {
  return (
    Math.ceil(distanceFeet / feetPerMinute(settings)) + settings.extraMinutes
  );
}

export function travelMode(settings: TravelSettings): TravelMode {
  return settings.accessible ? "accessible" : "standard";
}

/**
 * insufficient: the walk takes longer than the gap; tight: it needs at least
 * 75% of the gap; ok otherwise; unknown when there's no distance.
 */
export function connectionVerdict(
  walk: number | null,
  gapMinutes: number,
): ConnectionVerdict {
  if (walk === null) return "unknown";
  if (walk > gapMinutes) return "insufficient";
  if (walk >= TIGHT_SHARE * gapMinutes) return "tight";
  return "ok";
}

/** "1,240 ft" under half a mile, "0.62 mi" from there on (the prototype's rule). */
export function formatFeet(feet: number): string {
  if (feet >= 2640) return `${(feet / 5280).toFixed(2)} mi`;
  return `${Math.round(feet).toLocaleString("en-US")} ft`;
}
