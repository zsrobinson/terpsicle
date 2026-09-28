// The calendar feed's routes (docs/V2.md §6.7), signed in only. Apart from
// ~/server/fns/api so only /settings/notifications carries these calls.
import {
  CalendarFeedInputSchema,
  CalendarFeedResetInputSchema,
  CalendarFeedResetResultSchema,
  CalendarFeedResultSchema,
} from "~/core/schema/calendar-feed";
import { type ApiOptions, call } from "./api";

export const calendarFeedApi = {
  /** The person's link, made on the first ask. */
  link: (options?: ApiOptions) =>
    call(
      "calendar/feed",
      CalendarFeedInputSchema,
      CalendarFeedResultSchema,
      {},
      options,
    ),
  /** A new link; the old one stops working. */
  reset: (options?: ApiOptions) =>
    call(
      "calendar/feed/reset",
      CalendarFeedResetInputSchema,
      CalendarFeedResetResultSchema,
      {},
      options,
    ),
};
