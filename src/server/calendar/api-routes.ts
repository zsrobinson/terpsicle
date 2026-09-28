// The calendar feed link's JSON routes (V2.md §6.7), composed into
// src/server/api/router.ts. The feed itself is a GET at /cal/<token>.ics,
// with no cookie (./feed.ts).
import {
  CalendarFeedInputSchema,
  CalendarFeedResetInputSchema,
} from "~/core/schema/calendar-feed";
import { route } from "../api/route";
import { feedLink, resetFeedLink } from "./feed";

export const CALENDAR_ROUTES = {
  "calendar/feed": route({
    input: CalendarFeedInputSchema,
    perUserPerHour: 120,
    auth: "user",
    handle: (env, _input, ctx) => feedLink(env, ctx),
  }),
  "calendar/feed/reset": route({
    input: CalendarFeedResetInputSchema,
    perUserPerHour: 20,
    auth: "user",
    handle: (env, _input, ctx) => resetFeedLink(env, ctx),
  }),
} as const;
