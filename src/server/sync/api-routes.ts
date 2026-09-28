// Plan sync's JSON routes (V2.md §5.3), composed into src/server/api/router.ts.
import {
  SYNC_MAX_PUSH_REQUEST_BYTES,
  SyncPullInputSchema,
  SyncPushInputSchema,
} from "~/core/schema";
import { route } from "../api/route";
import { pull, push } from "./api";

export const SYNC_ROUTES = {
  "sync/push": route({
    input: SyncPushInputSchema,
    perUserPerHour: 1_200,
    maxBytes: SYNC_MAX_PUSH_REQUEST_BYTES,
    auth: "user",
    handle: (env, input, ctx) => push(env, input, ctx),
  }),
  "sync/pull": route({
    input: SyncPullInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, input, ctx) => pull(env, input, ctx),
  }),
} as const;
