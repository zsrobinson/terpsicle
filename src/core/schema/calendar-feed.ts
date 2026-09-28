import { z } from "zod";

// The calendar feed's routes (docs/V2.md §6.7), signed in only. Out of the
// barrel (./index.ts) like notifications: only /settings/notifications
// loads it.

/** `/cal/<token>.ics`: the token is 64 lowercase hex characters (an HMAC-SHA-256). */
export const CALENDAR_FEED_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** A feed link as the Worker hands it out: one of our origins, `/cal/<token>.ics`. */
export const CalendarFeedUrlSchema = z
  .url({ protocol: /^https?$/ })
  .refine((url) => /\/cal\/[0-9a-f]{64}\.ics$/.test(new URL(url).pathname), {
    message: "Not a calendar feed link",
  });

// ---------- POST /api/calendar/feed ----------

/** The person's link, made on the first ask. */
export const CalendarFeedInputSchema = z.strictObject({});

export const CalendarFeedResultSchema = z.strictObject({
  url: CalendarFeedUrlSchema,
  /** True when this call made the link (the first ask). */
  created: z.boolean(),
});
export type CalendarFeedResult = z.infer<typeof CalendarFeedResultSchema>;

// ---------- POST /api/calendar/feed/reset ----------

/** A new link; the old one stops working at once. */
export const CalendarFeedResetInputSchema = z.strictObject({});

export const CalendarFeedResetResultSchema = z.strictObject({
  url: CalendarFeedUrlSchema,
});
export type CalendarFeedResetResult = z.infer<
  typeof CalendarFeedResetResultSchema
>;
