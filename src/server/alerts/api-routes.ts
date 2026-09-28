// Seat watches' JSON routes (V2.md §6.5), composed into
// src/server/api/router.ts. The emails' one-click stop is routed there too.
import {
  SeatWatchInputSchema,
  SeatWatchListInputSchema,
  type SeatWatchListResult,
  type SeatWatchResult,
} from "~/core/schema";
import { route } from "../api/route";
import { list as listWatches, unwatch, watch } from "./service";

export const ALERTS_ROUTES = {
  "alerts/watch": route({
    input: SeatWatchInputSchema,
    perUserPerHour: 120,
    whenOff: { status: "unavailable" } satisfies SeatWatchResult,
    auth: "user",
    handle: (env, input, ctx) => watch(env, input, ctx),
  }),
  "alerts/unwatch": route({
    input: SeatWatchInputSchema,
    perUserPerHour: 120,
    // Stopping works even while alerts are off.
    auth: "user",
    handle: (env, input, ctx) => unwatch(env, input, ctx),
  }),
  "alerts/list": route({
    input: SeatWatchListInputSchema,
    perUserPerHour: 600,
    whenOff: { status: "unavailable" } satisfies SeatWatchListResult,
    auth: "user",
    handle: (env, input, ctx) => listWatches(env, input, ctx),
  }),
} as const;
