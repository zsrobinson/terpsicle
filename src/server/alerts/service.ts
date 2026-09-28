// Seat watches (SPEC §3.12, V2.md §6.5, DATA.md §7.1): the signed-in
// `alerts/watch|unwatch|list` routes, the one-click stop link in alert
// emails, and ending watches once their term is over. The router checks the
// session and the per-person limits; these functions assume both passed.
import {
  parseSectionKey,
  SEAT_WATCH_MAX_PER_USER,
  type SeatUnwatchResult,
  type SeatWatchInput,
  type SeatWatchListInput,
  type SeatWatchListResult,
  type SeatWatchResult,
  seatWatchFromRow,
  TERMS_KEY,
  TermsFileSchema,
} from "~/core/schema";
import { captureServerEvent } from "../analytics";
import type { Session } from "../auth/session";
import { hit } from "../counters";
import { keyedHash, sameHex } from "../crypto";
import {
  currentOpenSeats,
  findSection,
  readPublished,
  type WatchedSection,
} from "../published";
import type { SectionRef } from "./email";
import {
  countWatches,
  deleteTermWatches,
  deleteWatch,
  getWatch,
  insertWatch,
  listWatches,
  watchedTerms,
} from "./store";

export interface AlertsEnv {
  DB: D1Database;
  DATA: R2Bucket;
  /** Absent on previews: they must never email anyone. */
  EMAIL?: SendEmail;
  SEAT_ALERTS_ENABLED?: string;
  /** Prepended to every alert subject, e.g. "[Test] " for a trial run. Unset in production. */
  EMAIL_SUBJECT_PREFIX?: string;
  POSTHOG_TOKEN?: string;
}

export interface AlertsContext {
  now: Date;
  /** Where links in emails point: the app that made the request. */
  origin: string;
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Limits (DATA.md §7.1). Watches per person: SEAT_WATCH_MAX_PER_USER. */
export const ALERT_LIMITS = {
  /** Seat-open alerts per person per day. */
  alertsPerUserPerDay: 20,
  /** Minimum gap between seat-open alerts for one watch. */
  alertCooldownMs: 30 * 60_000,
  /** One-click stops per IP per hour (mail providers call these). */
  oneClickPerIpPerHour: 60,
} as const;

export function alertsEnabled(
  env: AlertsEnv,
): env is AlertsEnv & { EMAIL: SendEmail } {
  return env.SEAT_ALERTS_ENABLED === "true" && env.EMAIL !== undefined;
}

export function sectionRef(found: WatchedSection): SectionRef {
  return {
    termId: found.term.id,
    termName: found.term.name,
    courseCode: found.course.code,
    sectionCode: found.section.code,
    title: found.course.title,
  };
}

type UserContext = AlertsContext & { session: Session | null };

/** The router only calls these with a session (`auth: "user"`). */
function userId(ctx: UserContext): string {
  if (!ctx.session) throw new Error("seat watches need a session");
  return ctx.session.user.id;
}

export async function watch(
  env: AlertsEnv,
  input: SeatWatchInput,
  ctx: UserContext,
): Promise<SeatWatchResult> {
  if (!alertsEnabled(env)) return { status: "unavailable" };
  const user = userId(ctx);
  const existing = await getWatch(env.DB, user, input.termId, input.sectionKey);
  if (existing)
    return { status: "watching", watch: seatWatchFromRow(existing) };

  const found = await findSection(env.DATA, input.termId, input.sectionKey);
  if (found?.term.status !== "active") return { status: "unknown-section" };
  if ((await countWatches(env.DB, user)) >= SEAT_WATCH_MAX_PER_USER)
    return { status: "too-many", max: SEAT_WATCH_MAX_PER_USER };

  // Start from today's count, so only a reopening after now sends an email.
  const open = await currentOpenSeats(env.DATA, input.termId, input.sectionKey);
  const inserted = await insertWatch(env.DB, {
    user_id: user,
    term_id: input.termId,
    section_key: input.sectionKey,
    created_at: ctx.now.toISOString(),
    last_open: open,
  });
  const row = await getWatch(env.DB, user, input.termId, input.sectionKey);
  if (!row) throw new Error("seat watch insert failed");
  if (inserted)
    ctx.waitUntil?.(
      captureServerEvent(env, "alert_watched", { termId: input.termId }),
    );
  return { status: "watching", watch: seatWatchFromRow(row) };
}

export async function unwatch(
  env: AlertsEnv,
  input: SeatWatchInput,
  ctx: UserContext,
): Promise<SeatUnwatchResult> {
  const user = userId(ctx);
  if (await getWatch(env.DB, user, input.termId, input.sectionKey)) {
    await deleteWatch(env.DB, user, input.termId, input.sectionKey);
    ctx.waitUntil?.(
      captureServerEvent(env, "alert_unwatched", {
        termId: input.termId,
        via: "app",
      }),
    );
  }
  return { status: "stopped" };
}

export async function list(
  env: AlertsEnv,
  input: SeatWatchListInput,
  ctx: UserContext,
): Promise<SeatWatchListResult> {
  if (!alertsEnabled(env)) return { status: "unavailable" };
  const rows = await listWatches(env.DB, userId(ctx), input.termId);
  return {
    status: "ok",
    watches: rows.slice(0, SEAT_WATCH_MAX_PER_USER).map(seatWatchFromRow),
  };
}

// ---------- the one-click stop link (RFC 8058) ----------

/** The path mail providers POST to, outside the JSON route table. */
export const ONE_CLICK_ROUTE = "alerts/one-click";

const oneClickSubject = (user: string, termId: string, sectionKey: string) =>
  `seat-watch-stop:${user}:${termId}:${sectionKey}`;

/**
 * A link that stops one watch, signed with the Worker's own HMAC key
 * (`keyedHash`, kept in R2), so it can't be forged for someone else's.
 */
export async function oneClickStopUrl(
  bucket: R2Bucket,
  origin: string,
  watch: { userId: string; termId: string; sectionKey: string },
): Promise<string> {
  const key = await keyedHash(
    bucket,
    oneClickSubject(watch.userId, watch.termId, watch.sectionKey),
  );
  const params = new URLSearchParams({
    u: watch.userId,
    t: watch.termId,
    s: watch.sectionKey,
    k: key,
  });
  return `${origin}/api/${ONE_CLICK_ROUTE}?${params}`;
}

/**
 * `POST /api/alerts/one-click?u&t&s&k`: a mail provider's one-click
 * unsubscribe (body `List-Unsubscribe=One-Click`) stops that one watch. A
 * GET (a person, or a link scanner) changes nothing and goes to the watch
 * list in Settings, where stopping has Undo.
 */
export async function handleOneClick(
  request: Request,
  env: AlertsEnv,
  ctx: AlertsContext & { ipHash: () => Promise<string> },
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET")
    return Response.redirect(`${ctx.origin}/settings#watching`, 303);
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  const count = await hit(
    env.DB,
    `${ONE_CLICK_ROUTE}:${await ctx.ipHash()}`,
    { seconds: 3_600 },
    ctx.now,
  );
  if (count > ALERT_LIMITS.oneClickPerIpPerHour)
    return new Response("Too many requests", { status: 429 });
  const user = url.searchParams.get("u") ?? "";
  const termId = url.searchParams.get("t") ?? "";
  const sectionKey = url.searchParams.get("s") ?? "";
  const key = url.searchParams.get("k") ?? "";
  const expected = await keyedHash(
    env.DATA,
    oneClickSubject(user, termId, sectionKey),
  );
  if (!parseSectionKey(sectionKey) || !sameHex(key, expected))
    return new Response("This link isn't valid.", { status: 400 });
  if (await getWatch(env.DB, user, termId, sectionKey)) {
    await deleteWatch(env.DB, user, termId, sectionKey);
    ctx.waitUntil?.(
      captureServerEvent(env, "alert_unwatched", { termId, via: "email" }),
    );
  }
  return new Response("Stopped. No more emails about this section.", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ---------- the end of a term ----------

/**
 * Ends watches whose term is no longer active (archived or gone from the
 * term list): seats stop updating then, so nothing could ever reopen. Does
 * nothing when the term list can't be read.
 */
export async function endPastTermWatches(
  env: Pick<AlertsEnv, "DB" | "DATA" | "POSTHOG_TOKEN">,
  options: { waitUntil?: (promise: Promise<unknown>) => void } = {},
): Promise<{ terms: number; watches: number }> {
  const terms = await readPublished(env.DATA, TERMS_KEY, TermsFileSchema);
  if (!terms) return { terms: 0, watches: 0 };
  const active = new Set(
    terms.terms.filter((t) => t.status === "active").map((t) => t.id),
  );
  const ended = (await watchedTerms(env.DB)).filter((t) => !active.has(t));
  const watches = await deleteTermWatches(env.DB, ended);
  if (watches > 0)
    options.waitUntil?.(
      captureServerEvent(env, "alert_watches_ended", {
        terms: ended.length,
        watches,
      }),
    );
  return { terms: ended.length, watches };
}
