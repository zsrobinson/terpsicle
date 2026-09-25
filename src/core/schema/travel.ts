import { z } from "zod";
import { TravelModeSchema } from "./geo";
import {
  BuildingCodeSchema,
  type Day,
  DaySchema,
  MinutesSchema,
  SectionKeySchema,
} from "./primitives";

// Travel settings and connections (SPEC §3.7). The math is in docs/DATA.md §6.

export const PaceSchema = z.enum(["slower", "typical", "faster"]);
export type Pace = z.infer<typeof PaceSchema>;

export const PACE_MPH = {
  slower: 2.5,
  typical: 3.0,
  faster: 3.5,
} as const satisfies Record<Pace, number>;

/** 1 mph = 5280 ft / 60 min. */
export const FEET_PER_MINUTE_PER_MPH = 88;

/** A connection is "tight" when the walk needs at least this share of the gap. */
export const TIGHT_SHARE = 0.75;

export const ExtraMinutesSchema = z.union([
  z.literal(0),
  z.literal(2),
  z.literal(5),
]);
export type ExtraMinutes = z.infer<typeof ExtraMinutesSchema>;

export const TravelSettingsSchema = z.object({
  pace: PaceSchema,
  /** "Accessible routes". Picks the accessible distance matrix and geometry. */
  accessible: z.boolean(),
  /** Added to every trip. */
  extraMinutes: ExtraMinutesSchema,
});
export type TravelSettings = z.infer<typeof TravelSettingsSchema>;

export const DEFAULT_TRAVEL_SETTINGS: TravelSettings = {
  pace: "typical",
  accessible: false,
  extraMinutes: 0,
};

export const ConnectionVerdictSchema = z.enum([
  "ok",
  "tight",
  "insufficient",
  /** No distance for this building pair yet (routes still filling in). Shown neutral. */
  "unknown",
]);
export type ConnectionVerdict = z.infer<typeof ConnectionVerdictSchema>;

export const ConnectionEndSchema = z.object({
  sectionKey: SectionKeySchema,
  /** Index into the section's `meetings`. */
  meetingIndex: z.number().int().min(0),
  building: BuildingCodeSchema,
  room: z.string().min(1).nullable(),
  /** `from`: when that class ends. `to`: when the next one starts. */
  time: MinutesSchema,
});
export type ConnectionEnd = z.infer<typeof ConnectionEndSchema>;

/**
 * Two consecutive timed, in-person meetings on one day in different buildings.
 * Blocks never take part (they have no place).
 */
export const ConnectionSchema = z.object({
  /** `connectionId(day, from, to)`; stable while the plan's sections stay the same. */
  id: z.string().min(1),
  day: DaySchema,
  from: ConnectionEndSchema,
  to: ConnectionEndSchema,
  gapMinutes: z.number().int().min(0),
  /** null when verdict is "unknown". */
  distanceFeet: z.number().int().min(0).nullable(),
  /** ceil(distanceFeet / (mph × 88)) + extraMinutes; null when verdict is "unknown". */
  walkMinutes: z.number().int().min(0).nullable(),
  verdict: ConnectionVerdictSchema,
  mode: TravelModeSchema,
});
export type Connection = z.infer<typeof ConnectionSchema>;

export function connectionId(
  day: Day,
  from: Pick<ConnectionEnd, "sectionKey" | "meetingIndex">,
  to: Pick<ConnectionEnd, "sectionKey" | "meetingIndex">,
): string {
  return `${day}:${from.sectionKey}#${from.meetingIndex}>${to.sectionKey}#${to.meetingIndex}`;
}
