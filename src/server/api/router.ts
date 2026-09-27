// The JSON API: POST /api/<name>, JSON in and out, both sides validated with
// the schemas in ~/core/schema (the browser side is ~/server/fns/api).
// Plain Worker routes rather than createServerFn: they run in the worker test
// pool against real D1/R2 bindings, see the raw request (CF-Connecting-IP for
// rate limits), and keep Worker-only types out of the app's TS program.
import type { z } from "zod";
import {
  AccountDeleteInputSchema,
  ChatFollowInputSchema,
  ChatMembersInputSchema,
  ChatMuteInputSchema,
  ChatUnreadInputSchema,
  type FeatureLevel,
  FeatureVarsSchema,
  MeInputSchema,
  type ModerationKind,
  QueueListInputSchema,
  ReportCreateInputSchema,
  ResolveInputSchema,
  ReviewDeleteInputSchema,
  ReviewEditInputSchema,
  ReviewListInputSchema,
  ReviewSubmitInputSchema,
  ReviewSummaryInputSchema,
  ReviewsMineInputSchema,
  ReviewsRecentInputSchema,
  SeatWatchInputSchema,
  SeatWatchListInputSchema,
  type SeatWatchListResult,
  type SeatWatchResult,
  SignOutInputSchema,
  SYNC_MAX_PUSH_REQUEST_BYTES,
  SyncPullInputSchema,
  SyncPushInputSchema,
  TestSignInInputSchema,
  TODO_IMPORT_MAX_BYTES,
  TodoConnectInputSchema,
  TodoDisconnectInputSchema,
  TodoDoneInputSchema,
  TodoImportFileInputSchema,
  TodoListInputSchema,
  TodoRefreshInputSchema,
  UndoInputSchema,
} from "~/core/schema";
import {
  AdminHealthInputSchema,
  AdminSamplesInputSchema,
  DecisionListInputSchema,
} from "~/core/schema/admin";
import {
  FEEDBACK_MAX_REQUEST_BYTES,
  FeedbackDeleteInputSchema,
  FeedbackListInputSchema,
  FeedbackPinInputSchema,
  FeedbackPinsInputSchema,
  FeedbackSendInputSchema,
  FeedbackUndoInputSchema,
  FeedbackUpdateInputSchema,
} from "~/core/schema/feedback";
import {
  NotificationSettingsInputSchema,
  NotificationSettingsSetInputSchema,
  PushDevicesInputSchema,
  PushRemoveInputSchema,
  PushSubscribeInputSchema,
  PushTestInputSchema,
  PushUnsubscribeInputSchema,
} from "~/core/schema/notifications";
import { listDecisions } from "../admin/decisions";
import { adminHealth } from "../admin/health";
import { addSamples } from "../admin/samples";
import {
  type AlertsContext,
  type AlertsEnv,
  alertsEnabled,
  handleOneClick,
  list as listWatches,
  ONE_CLICK_ROUTE,
  unwatch,
  watch,
} from "../alerts/service";
import { APEX_HOST } from "../apex";
import {
  deleteAccount,
  type IdentityRouteContext,
  me,
  signOut,
  testSignIn,
} from "../auth/api";
import { type AuthEnv, isTestMode } from "../auth/config";
import { handleFlow, isFlowRoute } from "../auth/flow";
import { isSameOrigin } from "../auth/guard";
import { getSession } from "../auth/session";
import {
  type ChatApiEnv,
  follow,
  members,
  mute,
  unfollow,
  unread,
} from "../chat/api";
import { hit, secondsLeft } from "../counters";
import { keyedHash } from "../crypto";
import {
  adminDeleteFeedback,
  adminListFeedback,
  adminUpdateFeedback,
  listPins,
  pinFeedback,
  sendFeedback,
  undoFeedback,
} from "../feedback/api";
import {
  listQueue,
  resolveQueueItem,
  undoQueueItem,
} from "../moderation/admin";
import {
  type ModerationHandlers,
  moderationHandlers,
} from "../moderation/handlers";
import { createReport, reportTargets } from "../moderation/reports";
import type { ModerationEnv } from "../moderation/service";
import {
  getSettings as getNotificationSettings,
  type NotificationsEnv,
  devices as pushDevices,
  subscribe as pushSubscribe,
  unsubscribe as pushUnsubscribe,
  removeDevice as removePushDevice,
  setSettings as setNotificationSettings,
  testPush,
} from "../notifications/api";
import { EMAIL_OFF_ROUTE, handleEmailOff } from "../notifications/email-off";
import { type PushEnv, pushConfig } from "../push/config";
import {
  deleteReview,
  editReview,
  listReviews,
  myReviews,
  type ReviewsEnv,
  submitReview,
} from "../reviews/api";
import { listRecent } from "../reviews/public";
import { getReviewSummary, type SummaryEnv } from "../summaries/service";
import { pull, push } from "../sync/api";
import { type TodoEnv, todoAvailable } from "../todo/config";
import {
  connect as todoConnect,
  disconnect as todoDisconnect,
  done as todoDone,
  importFile as todoImportFile,
  list as todoList,
  refresh as todoRefresh,
} from "../todo/service";
import {
  apiError,
  clientIp,
  DEFAULT_MAX_INPUT_BYTES,
  json,
  readInput,
} from "./http";

export const API_PREFIX = "/api/";

export type ApiEnv = AlertsEnv &
  SummaryEnv &
  AuthEnv &
  ModerationEnv &
  ChatApiEnv &
  ReviewsEnv &
  TodoEnv &
  NotificationsEnv &
  PushEnv;

interface Route<S extends z.ZodType> {
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
  /** Seat-alert routes answer "unavailable" while the flag is off. */
  alerts: boolean;
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

export type RouteContext = AlertsContext &
  IdentityRouteContext & {
    /** How the owner's moderation decisions reach Reviews and Chat. */
    moderationHandlers: ModerationHandlers;
  };

export interface ApiOptions {
  /** Outbound fetch for Google and pictures; tests mock it. */
  fetch?: typeof fetch;
  /** Overrides moderationHandlers(env), for tests. */
  moderationHandlers?: ModerationHandlers;
}

/**
 * At least one limit: an unlimited route is a mistake. A worker test
 * (limits.test.ts) holds per-user limits to signed-in routes, and per-IP
 * ones to routes anyone can call.
 */
type Limits = { perIpPerHour: number } | { perUserPerHour: number };

const route = <S extends z.ZodType>(r: Route<S> & Limits): Route<S> => r;

export const ROUTES = {
  "review-summary": route({
    input: ReviewSummaryInputSchema,
    perIpPerHour: 300,
    alerts: false,
    handle: (env, input, ctx) =>
      getReviewSummary(env, input, { now: ctx.now, waitUntil: ctx.waitUntil }),
  }),
  // Seat watches (V2.md §6.5). The emails' one-click stop is routed below.
  "alerts/watch": route({
    input: SeatWatchInputSchema,
    perUserPerHour: 120,
    alerts: false,
    whenOff: { status: "unavailable" } satisfies SeatWatchResult,
    auth: "user",
    handle: (env, input, ctx) => watch(env, input, ctx),
  }),
  "alerts/unwatch": route({
    input: SeatWatchInputSchema,
    perUserPerHour: 120,
    // Stopping works even while alerts are off.
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => unwatch(env, input, ctx),
  }),
  "alerts/list": route({
    input: SeatWatchListInputSchema,
    perUserPerHour: 600,
    alerts: false,
    whenOff: { status: "unavailable" } satisfies SeatWatchListResult,
    auth: "user",
    handle: (env, input, ctx) => listWatches(env, input, ctx),
  }),
  // Identity (docs/AUTH.md). The sign-in navigations are GETs, routed below.
  me: route({
    input: MeInputSchema,
    perIpPerHour: 600,
    alerts: false,
    handle: (env, _input, ctx) =>
      me(env, ctx, {
        seatAlerts: alertsEnabled(env),
        todo: todoAvailable(env, isTestMode(env, new URL(ctx.request.url))),
        pushPublicKey: pushPublicKey(env, ctx.request),
      }),
  }),
  "auth/sign-out": route({
    input: SignOutInputSchema,
    perIpPerHour: 30,
    alerts: false,
    handle: (env, input, ctx) => signOut(env, input, ctx),
  }),
  "account/delete": route({
    input: AccountDeleteInputSchema,
    perIpPerHour: 30,
    perUserPerHour: 10,
    alerts: false,
    auth: "user",
    handle: (env, _input, ctx) => deleteAccount(env, ctx),
  }),
  "auth/test-sign-in": route({
    input: TestSignInInputSchema,
    perIpPerHour: 60,
    alerts: false,
    handle: (env, input, ctx) => testSignIn(env, input, ctx),
  }),
  // Plan sync (V2.md §5.3).
  "sync/push": route({
    input: SyncPushInputSchema,
    perUserPerHour: 1_200,
    maxBytes: SYNC_MAX_PUSH_REQUEST_BYTES,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => push(env, input, ctx),
  }),
  "sync/pull": route({
    input: SyncPullInputSchema,
    perUserPerHour: 600,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => pull(env, input, ctx),
  }),
  // Chat (V2.md §8.5). Messages go over the socket, /api/chat/socket.
  "chat/unread": route({
    input: ChatUnreadInputSchema,
    perUserPerHour: 1_200,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => unread(env, input, ctx),
  }),
  "chat/follow": route({
    input: ChatFollowInputSchema,
    perUserPerHour: 600,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => follow(env, input, ctx),
  }),
  "chat/unfollow": route({
    input: ChatFollowInputSchema,
    perUserPerHour: 600,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => unfollow(env, input, ctx),
  }),
  "chat/mute": route({
    input: ChatMuteInputSchema,
    perUserPerHour: 600,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => mute(env, input, ctx),
  }),
  "chat/members": route({
    input: ChatMembersInputSchema,
    perUserPerHour: 600,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => members(env, input, ctx),
  }),
  // Terpsicle Reviews (V2.md §7.4). Anonymous to readers: see reviews/api.ts.
  "reviews/list": route({
    input: ReviewListInputSchema,
    perIpPerHour: 1_200,
    alerts: false,
    reviews: "read",
    handle: (env, input) => listReviews(env, input),
  }),
  // Which courses and instructors were reviewed lately, for /reviews.
  "reviews/recent": route({
    input: ReviewsRecentInputSchema,
    perIpPerHour: 600,
    alerts: false,
    reviews: "read",
    handle: (env, input) => listRecent(env, input),
  }),
  "reviews/submit": route({
    input: ReviewSubmitInputSchema,
    // Each one costs two model calls; ten new reviews a week is the real limit.
    perUserPerHour: 20,
    alerts: false,
    auth: "user",
    reviews: "on",
    handle: (env, input, ctx) => submitReview(env, input, ctx),
  }),
  "reviews/edit": route({
    input: ReviewEditInputSchema,
    perUserPerHour: 30,
    alerts: false,
    auth: "user",
    reviews: "on",
    handle: (env, input, ctx) => editReview(env, input, ctx),
  }),
  "reviews/delete": route({
    input: ReviewDeleteInputSchema,
    perUserPerHour: 60,
    alerts: false,
    auth: "user",
    // Taking your own words down works even while writing is off.
    reviews: "read",
    handle: (env, input, ctx) => deleteReview(env, input, ctx),
  }),
  "reviews/mine": route({
    input: ReviewsMineInputSchema,
    perUserPerHour: 300,
    alerts: false,
    auth: "user",
    reviews: "read",
    handle: (env, _input, ctx) => myReviews(env, ctx),
  }),
  // Shared by Reviews and Chat (V2.md §9.3): each surface follows its own
  // switch, and reporting works while it's read-only.
  "reports/create": route({
    input: ReportCreateInputSchema,
    perUserPerHour: 30,
    alerts: false,
    auth: "user",
    handle: async (env, input, ctx) =>
      reportsOpen(env, input.surface)
        ? createReport(env, input, ctx, reportTargets(env))
        : apiError("unavailable"),
  }),
  // Terpsicle Todo (docs/V3.md §3.8). Each answers "unavailable" while
  // TODO_ENABLED is off or the feed key is missing (outside test mode).
  "todo/connect": route({
    input: TodoConnectInputSchema,
    perIpPerHour: 30,
    perUserPerHour: 10,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => todoConnect(env, input, ctx),
  }),
  "todo/disconnect": route({
    input: TodoDisconnectInputSchema,
    perUserPerHour: 30,
    alerts: false,
    auth: "user",
    handle: (env, _input, ctx) => todoDisconnect(env, ctx),
  }),
  "todo/list": route({
    input: TodoListInputSchema,
    perUserPerHour: 600,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => todoList(env, input, ctx),
  }),
  "todo/done": route({
    input: TodoDoneInputSchema,
    perUserPerHour: 1_200,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => todoDone(env, input, ctx),
  }),
  "todo/refresh": route({
    input: TodoRefreshInputSchema,
    perUserPerHour: 30,
    alerts: false,
    auth: "user",
    handle: (env, _input, ctx) => todoRefresh(env, ctx),
  }),
  "todo/import-file": route({
    input: TodoImportFileInputSchema,
    perUserPerHour: 20,
    maxBytes: TODO_IMPORT_MAX_BYTES,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => todoImportFile(env, input, ctx),
  }),
  // Notifications (V2.md §6.3).
  "push/subscribe": route({
    input: PushSubscribeInputSchema,
    perUserPerHour: 60,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => pushSubscribe(env, input, ctx),
  }),
  "push/unsubscribe": route({
    input: PushUnsubscribeInputSchema,
    perUserPerHour: 60,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => pushUnsubscribe(env, input, ctx),
  }),
  "push/devices": route({
    input: PushDevicesInputSchema,
    perUserPerHour: 300,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => pushDevices(env, input, ctx),
  }),
  "push/remove": route({
    input: PushRemoveInputSchema,
    perUserPerHour: 60,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => removePushDevice(env, input, ctx),
  }),
  // Each one reaches every device the person has; a handful is plenty.
  "push/test": route({
    input: PushTestInputSchema,
    perUserPerHour: 10,
    alerts: false,
    auth: "user",
    handle: (env, _input, ctx) => testPush(env, ctx),
  }),
  "notifications/settings": route({
    input: NotificationSettingsInputSchema,
    perUserPerHour: 300,
    alerts: false,
    auth: "user",
    handle: (env, _input, ctx) => getNotificationSettings(env, ctx),
  }),
  "notifications/settings/set": route({
    input: NotificationSettingsSetInputSchema,
    perUserPerHour: 120,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => setNotificationSettings(env, input, ctx),
  }),
  // Feedback (docs/FEEDBACK.md). Anyone can send it; who sent it is kept
  // only when they ask for a reply.
  "feedback/send": route({
    input: FeedbackSendInputSchema,
    perIpPerHour: 12,
    perUserPerHour: 20,
    maxBytes: FEEDBACK_MAX_REQUEST_BYTES,
    alerts: false,
    auth: "optional",
    handle: (env, input, ctx) => sendFeedback(env, input, ctx),
  }),
  "feedback/undo": route({
    input: FeedbackUndoInputSchema,
    perIpPerHour: 30,
    alerts: false,
    auth: "optional",
    handle: (env, input, ctx) => undoFeedback(env, input, ctx),
  }),
  "feedback/pin": route({
    input: FeedbackPinInputSchema,
    perIpPerHour: 600,
    maxBytes: FEEDBACK_MAX_REQUEST_BYTES,
    alerts: false,
    auth: "admin",
    handle: (env, input, ctx) => pinFeedback(env, input, ctx),
  }),
  "feedback/pins": route({
    input: FeedbackPinsInputSchema,
    perIpPerHour: 2_000,
    alerts: false,
    auth: "admin",
    handle: (env, input) => listPins(env, input),
  }),
  "admin/feedback/list": route({
    input: FeedbackListInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input) => adminListFeedback(env, input),
  }),
  "admin/feedback/update": route({
    input: FeedbackUpdateInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input, ctx) => adminUpdateFeedback(env, input, ctx),
  }),
  "admin/feedback/delete": route({
    input: FeedbackDeleteInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input, ctx) => adminDeleteFeedback(env, input, ctx),
  }),
  // Moderation's admin side (docs/MODERATION.md §6).
  "admin/moderation/queue": route({
    input: QueueListInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input) => listQueue(env.DB, input),
  }),
  "admin/moderation/resolve": route({
    input: ResolveInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input, ctx) =>
      resolveQueueItem(env.DB, input, {
        now: ctx.now,
        handlers: ctx.moderationHandlers,
      }),
  }),
  "admin/moderation/undo": route({
    input: UndoInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input, ctx) =>
      undoQueueItem(env.DB, input, {
        now: ctx.now,
        handlers: ctx.moderationHandlers,
      }),
  }),
  // The rest of the admin panel (V2 §10, src/server/admin).
  "admin/decisions": route({
    input: DecisionListInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input, ctx) => listDecisions(env.DB, input, ctx.now),
  }),
  "admin/health": route({
    input: AdminHealthInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, _input, ctx) => adminHealth(env, ctx.now),
  }),
  "admin/samples": route({
    input: AdminSamplesInputSchema,
    perIpPerHour: 60,
    alerts: false,
    auth: "admin",
    handle: (env, _input, ctx) => addSamples(env, ctx),
  }),
} as const;

/** The VAPID public key the app subscribes with, while push works here. */
function pushPublicKey(env: ApiEnv, request: Request): string | null {
  const config = pushConfig(env, isTestMode(env, new URL(request.url)));
  return config.enabled ? config.publicKey : null;
}

/** A person's counter for one route (`counters.name`, pruned like the rest). */
export function userLimitKey(userId: string, route: string): string {
  return `user:${userId}:${route}`;
}

const LEVELS: readonly FeatureLevel[] = ["off", "read", "on"];

/** Whether REVIEWS_ENABLED is at least `needed` (unset or unknown is "off"). */
function reviewsAllow(env: ApiEnv, needed: FeatureLevel): boolean {
  const level = FeatureVarsSchema.parse(env).REVIEWS_ENABLED;
  return LEVELS.indexOf(level) >= LEVELS.indexOf(needed);
}

/** Whether a surface takes reports now: its switch is at least "read". */
function reportsOpen(env: ApiEnv, surface: ModerationKind): boolean {
  return surface === "review"
    ? reviewsAllow(env, "read")
    : FeatureVarsSchema.parse(env).CHAT_ENABLED !== "off";
}

/**
 * Where links in emails point. Only our own hosts: a forged Host header must
 * never put someone else's domain into an email link.
 */
export function linkOrigin(url: URL): string {
  const host = url.hostname;
  const ours =
    host === APEX_HOST ||
    host.endsWith("-terpsicle.zsrobinson.workers.dev") ||
    host === "localhost" ||
    host === "127.0.0.1";
  return ours ? url.origin : `https://${APEX_HOST}`;
}

export async function handleApi(
  request: Request,
  env: ApiEnv,
  ctx: Pick<ExecutionContext, "waitUntil">,
  now: Date = new Date(),
  options: ApiOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const name = url.pathname.slice(API_PREFIX.length);
  // The sign-in navigations: GETs that redirect, not JSON POSTs.
  if (isFlowRoute(name))
    return handleFlow(request, env, {
      now,
      waitUntil: (p) => ctx.waitUntil(p),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  const r: Route<z.ZodType> | undefined = Object.hasOwn(ROUTES, name)
    ? ROUTES[name as keyof typeof ROUTES]
    : undefined;
  // A mail provider's one-click unsubscribe: a form POST, not JSON.
  if (name === ONE_CLICK_ROUTE)
    return handleOneClick(request, env, {
      now,
      origin: linkOrigin(url),
      waitUntil: (p) => ctx.waitUntil(p),
      ipHash: () => keyedHash(env.DATA, clientIp(request)),
    });
  if (name === EMAIL_OFF_ROUTE)
    return handleEmailOff(request, env, {
      now,
      origin: linkOrigin(url),
      ipHash: () => keyedHash(env.DATA, clientIp(request)),
    });
  if (!r) return apiError("not-found");
  if (request.method !== "POST") return apiError("method-not-allowed");
  // JSON only: a cross-site form can't send this type without a CORS
  // preflight, which we never grant.
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return apiError("invalid-input");
  }
  if (r.whenOff !== undefined && !alertsEnabled(env)) return json(r.whenOff);
  if (r.alerts && !alertsEnabled(env)) return apiError("unavailable");
  if (r.reviews && !reviewsAllow(env, r.reviews))
    return apiError("unavailable");

  const window = { seconds: 3_600 };
  const limited = () => {
    const retryAfterSeconds = secondsLeft(window, now);
    return apiError("rate-limited", retryAfterSeconds);
  };
  if (r.perIpPerHour !== undefined) {
    const ipHash = await keyedHash(env.DATA, clientIp(request));
    if ((await hit(env.DB, `${name}:${ipHash}`, window, now)) > r.perIpPerHour)
      return limited();
  }

  let session: RouteContext["session"] = null;
  if (r.auth === "user" || r.auth === "admin") {
    if (!isSameOrigin(request)) return apiError("forbidden");
    session = await getSession(request, env, now, { refresh: true });
    if (!session) return apiError("unauthorized");
  } else if (r.auth === "optional") {
    if (!isSameOrigin(request)) return apiError("forbidden");
    session = await getSession(request, env, now, { refresh: true });
  }
  // From here on a refreshed session's new cookie goes out with every
  // answer, errors included: the old token stops working a minute later.
  const reply = (response: Response): Response => {
    if (session?.setCookie)
      response.headers.append("Set-Cookie", session.setCookie);
    return response;
  };
  if (session) {
    if (r.auth === "admin" && !session.user.isAdmin)
      return reply(apiError("forbidden"));
    if (
      r.perUserPerHour !== undefined &&
      (await hit(env.DB, userLimitKey(session.user.id, name), window, now)) >
        r.perUserPerHour
    )
      return reply(limited());
  }

  const input = await readInput(
    request,
    r.input,
    r.maxBytes ?? DEFAULT_MAX_INPUT_BYTES,
  );
  if (input === null) return reply(apiError("invalid-input"));

  const result = await r.handle(env, input, {
    now,
    origin: linkOrigin(url),
    waitUntil: (p) => ctx.waitUntil(p),
    request,
    session,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    moderationHandlers: options.moderationHandlers ?? moderationHandlers(env),
  });
  return reply(result instanceof Response ? result : json(result));
}
