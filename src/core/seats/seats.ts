import {
  type SeatCounts,
  type SeatTuple,
  type SectionKey,
  seatCountsFromTuple,
} from "../schema";

// Seat words and meter levels (SPEC §3.4): "12 of 36 open", "2 left",
// "Full · 9 waitlisted".

/** The seats file's map, `SeatsFile["seats"]`. A missing key means Testudo shows no counts. */
export type SeatsMap = Readonly<Record<SectionKey, SeatTuple>>;

export function seatCounts(
  seats: SeatsMap | null | undefined,
  key: SectionKey,
): SeatCounts | null {
  const tuple = seats?.[key];
  return tuple ? seatCountsFromTuple(tuple) : null;
}

/**
 * Low means "may fill before you register": 5 or fewer open seats, or 10% or
 * less of the section. The absolute floor decides small sections (a 20-seat
 * discussion with 5 left goes in one registration window); the share decides
 * big lectures, which lose dozens of seats an hour on registration days, so
 * 25 of 300 is already low. Either rule alone misses one of those cases.
 */
export const LOW_SEATS_MAX = 5;
export const LOW_SEATS_SHARE = 0.1;

export type SeatLevel = "unknown" | "open" | "low" | "full";

export function seatLevel(counts: SeatCounts | null): SeatLevel {
  if (counts === null) return "unknown";
  if (counts.open === 0) return "full";
  if (counts.open <= LOW_SEATS_MAX) return "low";
  if (counts.total > 0 && counts.open / counts.total <= LOW_SEATS_SHARE)
    return "low";
  return "open";
}

export type SeatStatus = {
  readonly level: SeatLevel;
  /** "12 of 36 open", "2 left", "Full · 9 waitlisted", "Full", "Seats unknown". */
  readonly words: string;
  /** Share of seats taken, 0–1, for the meter; null when unknown. */
  readonly filled: number | null;
};

export function seatStatus(counts: SeatCounts | null): SeatStatus {
  const level = seatLevel(counts);
  if (counts === null) return { level, words: "Seats unknown", filled: null };
  const filled =
    counts.total > 0
      ? Math.min(1, Math.max(0, (counts.total - counts.open) / counts.total))
      : 1;
  let words: string;
  if (level === "full")
    words =
      counts.waitlist > 0 ? `Full · ${counts.waitlist} waitlisted` : "Full";
  else if (level === "low") words = `${counts.open} left`;
  else words = `${counts.open} of ${counts.total} open`;
  return { level, words, filled };
}

/** Sections that get a seat-alert bell (SPEC §3.12): low or full. */
export function canWatchSeats(counts: SeatCounts | null): boolean {
  const level = seatLevel(counts);
  return level === "low" || level === "full";
}
