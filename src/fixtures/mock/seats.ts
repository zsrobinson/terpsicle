// Mock seat counts. Testudo's real Spring 2027 counts are all "open = total"
// (registration isn't open yet), so open seats are generated from each
// section's key, keeping the real totals and the real waitlist/holdfile shape.
// A handful of sections are pinned so the demo shows every seat state.
import type { SeatsFile, SeatTuple, TermId } from "~/core/schema";
import { archivedFixtureTermId, fixtureTermId } from "../builders";
import { randomInt, seededRandom } from "../random";
import { mockCatalog, testudoSeats } from "./catalog";

/** Testudo's "Open Seats as of 09/24/2026 at 10:30 PM" (Eastern), in UTC. */
export const MOCK_SEATS_AS_OF = "2026-09-25T02:30:00.000Z";
/** When the mock seats job "fetched" them. */
export const MOCK_SEATS_FETCHED_AT = "2026-09-25T07:35:00.000Z";

/**
 * Sections whose counts are fixed for the demo, `[open, total, waitlist, holdfile]`.
 * Everything else is generated.
 */
export const PINNED_SEATS: Readonly<Record<string, SeatTuple>> = {
  // Full, with a waitlist: the "Full · 14 waitlisted" state and a bell.
  "CMSC351-0101": [0, 120, 14, null],
  "CMSC351-0201": [11, 120, 0, null],
  // Low: "3 left", a few-seats warning in the demo plan.
  "CMSC351-0301": [3, 90, 0, null],
  "CMSC351-0401": [24, 90, 0, null],
  "CMSC131-0101": [0, 36, 9, null],
  "CMSC131-0102": [4, 36, 0, null],
  "STAT400-0101": [6, 60, 0, null],
  "STAT400-0201": [31, 60, 0, null],
  "STAT400-0301": [0, 60, 5, null],
  "ENGL393-0101": [2, 19, 0, null],
  "ENGL393-0205": [7, 19, 0, null],
  "ENGL393-0312": [9, 19, 0, null],
  "ENGL393-0404": [12, 19, 0, null],
  "ENGL393-FC01": [15, 19, 0, null],
  // Full with a holdfile and no waitlist count, as ARCH271 shows on Testudo.
  "AAAS100-0601": [0, 30, null, 4],
};

/** Totals for the hand-made courses (the prototype's numbers). */
const HAND_TOTALS: Readonly<Record<string, number>> = {
  ARTH200: 60,
  ECON200: 75,
  MATH240: 40,
  MUSC130: 200,
  PHIL140: 90,
  PSYC100: 250,
};

/**
 * Sections Testudo shows no counts for ("Seats unknown"): the ones with no
 * meetings at all, plus one ordinary section so the state is easy to find.
 */
export const UNKNOWN_SEATS: ReadonlySet<string> = new Set(["GEOL123-0104"]);

function generated(key: string, testudo: SeatTuple | undefined): SeatTuple {
  const rand = seededRandom(key);
  const total =
    testudo?.[1] ?? HAND_TOTALS[key.slice(0, key.indexOf("-"))] ?? 30;
  const waitlistShown = testudo ? testudo[2] !== null : true;
  const holdfile = testudo?.[3] ?? null;
  if (total === 0) return [0, 0, waitlistShown ? 0 : null, holdfile];
  const roll = rand();
  // About 15% full, 15% low (1–3 left), the rest comfortably open.
  const open =
    roll < 0.15
      ? 0
      : roll < 0.3
        ? Math.min(total, randomInt(rand, 1, 3))
        : randomInt(rand, Math.min(total, 4), total);
  const waitlist = waitlistShown
    ? open === 0
      ? randomInt(rand, 0, 15)
      : 0
    : null;
  return [open, total, waitlist, holdfile];
}

function seatsFor(termId: TermId, asOf: string | null): SeatsFile {
  const seats: Record<string, SeatTuple> = {};
  for (const chunk of mockCatalog[termId] ?? [])
    for (const course of chunk.courses)
      for (const section of course.sections) {
        const key = `${course.code}-${section.code}`;
        if (UNKNOWN_SEATS.has(key) || section.meetings.length === 0) continue;
        seats[key] =
          PINNED_SEATS[key] ?? generated(key, testudoSeats[termId]?.[key]);
      }
  return { schemaVersion: 1, termId, asOf, seats };
}

/** Seats for the active term, with Testudo's "as of" time. */
export const mockSeats: SeatsFile = seatsFor(fixtureTermId, MOCK_SEATS_AS_OF);

/** Frozen seats for the archived term (Testudo stopped listing it; no "as of" stamp). */
export const mockArchivedSeats: SeatsFile = seatsFor(
  archivedFixtureTermId,
  null,
);
