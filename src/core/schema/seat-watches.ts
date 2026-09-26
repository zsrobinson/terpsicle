import { z } from "zod";
import {
  DirectoryIdSchema,
  IsoDateTimeSchema,
  SectionKeySchema,
  TermIdSchema,
} from "./primitives";

// Seat watches (SPEC §3.12, V2.md §6.5): a signed-in person watches a
// section, and the seats cron emails them when a seat opens. The API is
// `auth: "user"`; the D1 rows are `seat_watches` and `seat_alert_sends`
// (DATA.md §7.1).

/** How many sections one person can watch at once, across terms. */
export const SEAT_WATCH_MAX_PER_USER = 30;

/** One watch, as the app sees it. */
export const SeatWatchSchema = z.object({
  termId: TermIdSchema,
  sectionKey: SectionKeySchema,
  createdAt: IsoDateTimeSchema,
  /** The last seat-open alert sent for it, if any. */
  lastNotifiedAt: IsoDateTimeSchema.nullable(),
});
export type SeatWatch = z.infer<typeof SeatWatchSchema>;

// ---------- POST /api/alerts/watch, /api/alerts/unwatch ----------

export const SeatWatchInputSchema = z.strictObject({
  termId: TermIdSchema,
  sectionKey: SectionKeySchema,
});
export type SeatWatchInput = z.infer<typeof SeatWatchInputSchema>;

export const SeatWatchResultSchema = z.discriminatedUnion("status", [
  /** On (idempotent: watching it already answers the same). */
  z.object({ status: z.literal("watching"), watch: SeatWatchSchema }),
  /** Not a section in that term, or the term is archived. */
  z.object({ status: z.literal("unknown-section") }),
  /** Already watching SEAT_WATCH_MAX_PER_USER sections. */
  z.object({ status: z.literal("too-many"), max: z.number().int().min(1) }),
  /** Seat alerts are off (flag) or email isn't set up here. */
  z.object({ status: z.literal("unavailable") }),
]);
export type SeatWatchResult = z.infer<typeof SeatWatchResultSchema>;

/** Idempotent: stopping a watch that isn't on answers the same. */
export const SeatUnwatchResultSchema = z.object({
  status: z.literal("stopped"),
});
export type SeatUnwatchResult = z.infer<typeof SeatUnwatchResultSchema>;

// ---------- POST /api/alerts/list ----------

export const SeatWatchListInputSchema = z.strictObject({
  /** Only this term's watches; every term's when omitted. */
  termId: TermIdSchema.optional(),
});
export type SeatWatchListInput = z.infer<typeof SeatWatchListInputSchema>;

/**
 * "unavailable" is an answer, not an error: the app asks on every signed-in
 * load, and a 503 would log a console error each time while the flag is off.
 */
export const SeatWatchListResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    /** Newest first. */
    watches: z.array(SeatWatchSchema).max(SEAT_WATCH_MAX_PER_USER),
  }),
  z.object({ status: z.literal("unavailable") }),
]);
export type SeatWatchListResult = z.infer<typeof SeatWatchListResultSchema>;

// ---------- D1 rows (validate on read) ----------

const nullableTime = IsoDateTimeSchema.nullable();
const nullableCount = z.number().int().min(0).nullable();

/** A row of `seat_watches`. */
export const SeatWatchRowSchema = z.object({
  user_id: DirectoryIdSchema,
  term_id: TermIdSchema,
  section_key: SectionKeySchema,
  created_at: IsoDateTimeSchema,
  last_open: nullableCount,
  last_checked_at: nullableTime,
  last_notified_at: nullableTime,
  last_notified_open: nullableCount,
});
export type SeatWatchRow = z.infer<typeof SeatWatchRowSchema>;

export function seatWatchFromRow(row: SeatWatchRow): SeatWatch {
  return {
    termId: row.term_id,
    sectionKey: row.section_key,
    createdAt: row.created_at,
    lastNotifiedAt: row.last_notified_at,
  };
}
