// What one JSON API route is: the `route({...})` helper each area's table
// (src/server/<area>/routes.ts) is written with, and what its handler gets.
// router.ts composes the tables and runs them.
import type { z } from "zod";
import { type FeatureLevel, FeatureVarsSchema } from "~/core/schema";
import type { AlertsContext, AlertsEnv } from "../alerts/service";
import type { IdentityRouteContext } from "../auth/api";
import type { AuthEnv } from "../auth/config";
import type { ChatApiEnv } from "../chat/api";
import type { AuthorActors, ModerationHandlers } from "../moderation/handlers";
import type { ModerationEnv } from "../moderation/service";
import type { NotificationsEnv } from "../notifications/api";
import type { PushEnv } from "../push/config";
import type { ReviewsEnv } from "../reviews/api";
import type { SummaryEnv } from "../summaries/service";
import type { TodoEnv } from "../todo/config";

export type ApiEnv = AlertsEnv &
  SummaryEnv &
  AuthEnv &
  ModerationEnv &
  ChatApiEnv &
  ReviewsEnv &
  TodoEnv &
  NotificationsEnv &
  PushEnv;

export type RouteContext = AlertsContext &
  IdentityRouteContext & {
    /** How the owner's moderation decisions reach Reviews and Chat. */
    moderationHandlers: ModerationHandlers;
    /** How the owner's "stop this author" reaches them. */
    authorActors: AuthorActors;
  };

export interface Route<S extends z.ZodType> {
  input: S;
  /** Requests per IP per hour; omitted for signed-in routes limited per user. */
  perIpPerHour?: number;
  /**
   * Requests per signed-in person per hour (V2.md §12), for `auth: "user" |
   * "admin"` routes. Checked after the session and before the body is read.
   */
  perUserPerHour?: number;
  /** The largest request body read, in bytes (DEFAULT_MAX_INPUT_BYTES). */
  maxBytes?: number;
  /**
   * The route's own answer while seat alerts are off, sent before rate
   * limiting: the app lists watches on every signed-in load, and an off
   * switch shouldn't cost a D1 write per page view.
   */
  whenOff?: unknown;
  /**
   * Who may call it (V2.md §12). "user" and "admin" need a same-origin
   * request and a session (401 without, 403 for a non-admin), and the
   * handler gets `ctx.session`. "optional" is for anyone, signed in or not:
   * it needs a same-origin request (it writes), and hands the handler the
   * session when there is one, counting `perUserPerHour` then. Omitted
   * means "none".
   */
  auth?: "none" | "optional" | "user" | "admin";
  /**
   * The least REVIEWS_ENABLED this route needs (V2 §7.4): "read" for
   * reading, deleting and reporting, "on" for writing. Below it the route
   * answers `unavailable`, before any rate limiting.
   */
  reviews?: Exclude<FeatureLevel, "off">;
  /** A plain value is sent as JSON; a Response (to set cookies) as is. */
  handle: (
    env: ApiEnv,
    input: z.infer<S>,
    ctx: RouteContext,
  ) => Promise<unknown>;
}

/**
 * At least one limit: an unlimited route is a mistake. A worker test
 * (limits.test.ts) holds per-user limits to signed-in routes, and per-IP
 * ones to routes anyone can call.
 */
type Limits = { perIpPerHour: number } | { perUserPerHour: number };

export const route = <S extends z.ZodType>(r: Route<S> & Limits): Route<S> => r;

const LEVELS: readonly FeatureLevel[] = ["off", "read", "on"];

/** Whether REVIEWS_ENABLED is at least `needed` (unset or unknown is "off"). */
export function reviewsAllow(env: ApiEnv, needed: FeatureLevel): boolean {
  const level = FeatureVarsSchema.parse(env).REVIEWS_ENABLED;
  return LEVELS.indexOf(level) >= LEVELS.indexOf(needed);
}
