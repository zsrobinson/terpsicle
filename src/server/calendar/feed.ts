// The calendar feed (docs/V2.md §6.7): the two signed-in routes that hand
// out and replace the link, and `GET /cal/<token>.ics`, which calendar apps
// fetch with no cookie. What goes in it is ~/core/ics/feed; which plan a
// term's classes come from is `feedPlanFor` there.
import type { SectionRef } from "~/core/catalog/catalog-index";
import {
  buildCalendarFeed,
  type FeedTerm,
  feedDeadlines,
  feedPlanFor,
  feedTermIds,
} from "~/core/ics";
import {
  type AcademicCalendar,
  AcademicCalendarSchema,
  calendarKey,
  sectionKey,
  type TermId,
} from "~/core/schema";
import type {
  CalendarFeedResetResult,
  CalendarFeedResult,
} from "~/core/schema/calendar-feed";
import { isHiddenItem, newYorkDateOf } from "~/core/todo";
import { catalogReader } from "../alerts/catalog";
import { clientIp } from "../api/http";
import type { RouteContext } from "../api/router";
import { hit, secondsLeft } from "../counters";
import { keyedHash } from "../crypto";
import { doneAmong, hiddenCourses, listItems, listTasks } from "../todo/store";
import {
  createFeed,
  feedOwner,
  getFeed,
  mainPlansOf,
  markFetched,
  plansInTerms,
  replaceFeed,
} from "./store";
import {
  feedToken,
  feedTokenHash,
  feedUrl,
  newFeedNonce,
  tokenFromPath,
} from "./token";

export interface CalendarFeedEnv {
  DB: D1Database;
  /** The published catalog and calendars, and the HMAC key (under _jobs/). */
  DATA: R2Bucket;
}

/** Fetches per IP per hour. Google fetches every subscriber's feed from a few addresses. */
export const FEED_PER_IP_PER_HOUR = 600;
/** Fetches per link per hour: a few calendars on a few devices, every 15 minutes at most. */
export const FEED_PER_TOKEN_PER_HOUR = 60;
/** The feed's own caching: calendars and browsers may keep it 15 minutes. */
export const FEED_CACHE_CONTROL = "private, max-age=900";

type SignedIn = Pick<RouteContext, "now" | "origin" | "session">;

function userOf(ctx: SignedIn): string {
  // The router only calls these for `auth: "user"` routes, with a session.
  if (!ctx.session) throw new Error("calendar feed route without a session");
  return ctx.session.user.id;
}

/** `calendar/feed`: the person's link, made on the first ask. */
export async function feedLink(
  env: CalendarFeedEnv,
  ctx: SignedIn,
): Promise<CalendarFeedResult> {
  const userId = userOf(ctx);
  let created = false;
  let feed = await getFeed(env.DB, userId);
  if (!feed) {
    const nonce = newFeedNonce();
    const token = await feedToken(env.DATA, userId, nonce);
    created = await createFeed(
      env.DB,
      userId,
      { nonce, tokenHash: await feedTokenHash(token) },
      ctx.now,
    );
    // Another request may have made it first: read what's stored.
    feed = await getFeed(env.DB, userId);
    if (!feed) throw new Error("calendar feed row missing after insert");
  }
  const token = await feedToken(env.DATA, userId, feed.nonce);
  return { url: feedUrl(ctx.origin, token), created };
}

/** `calendar/feed/reset`: a new link, and the old one stops working. */
export async function resetFeedLink(
  env: CalendarFeedEnv,
  ctx: SignedIn,
): Promise<CalendarFeedResetResult> {
  const userId = userOf(ctx);
  const nonce = newFeedNonce();
  const token = await feedToken(env.DATA, userId, nonce);
  await replaceFeed(
    env.DB,
    userId,
    { nonce, tokenHash: await feedTokenHash(token) },
    ctx.now,
  );
  return { url: feedUrl(ctx.origin, token) };
}

// ---------- GET /cal/<token>.ics ----------

function plain(status: number, text: string, headers: HeadersInit = {}) {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

const notFound = () => plain(404, "Not found");

async function readCalendar(
  bucket: R2Bucket,
  termId: TermId,
): Promise<AcademicCalendar | null> {
  const object = await bucket.get(calendarKey(termId));
  if (!object) return null;
  const parsed = AcademicCalendarSchema.safeParse(await object.json());
  return parsed.success ? parsed.data : null;
}

/** Each term's classes, from its main plan's placed sections as the catalog has them now. */
async function feedTerms(
  env: CalendarFeedEnv,
  userId: string,
  termIds: readonly TermId[],
): Promise<FeedTerm[]> {
  const [plans, mainPlans] = await Promise.all([
    plansInTerms(env.DB, userId, termIds),
    mainPlansOf(env.DB, userId),
  ]);
  const findSection = catalogReader(env.DATA);
  const terms: FeedTerm[] = [];
  for (const termId of termIds) {
    const placed = (
      feedPlanFor(termId, plans, mainPlans)?.courses ?? []
    ).flatMap((c) =>
      c.sectionCode === null ? [] : [sectionKey(c.courseCode, c.sectionCode)],
    );
    if (placed.length === 0) continue;
    const [calendar, found] = await Promise.all([
      readCalendar(env.DATA, termId),
      Promise.all(placed.map((key) => findSection(termId, key))),
    ]);
    // A section the catalog no longer lists was cancelled: it doesn't meet.
    const sections = found.flatMap((f, i): SectionRef[] => {
      const key = placed[i];
      return f && key ? [{ key, course: f.course, section: f.section }] : [];
    });
    terms.push({ termId, calendar, sections });
  }
  return terms;
}

async function feedBody(
  env: CalendarFeedEnv,
  userId: string,
  now: Date,
): Promise<string> {
  const today = newYorkDateOf(now.getTime());
  const [terms, items, tasks, hiddenKeys] = await Promise.all([
    feedTerms(env, userId, feedTermIds(today)),
    listItems(env.DB, userId, null),
    listTasks(env.DB, userId, null, { undated: false }),
    hiddenCourses(env.DB, userId),
  ]);
  const hidden = new Set(hiddenKeys);
  const all = [...items, ...tasks];
  const done = new Set(
    await doneAmong(
      env.DB,
      userId,
      all.map((i) => i.uid),
    ),
  );
  return buildCalendarFeed({
    terms,
    // A hidden course leaves the feed as it leaves "Due tomorrow" (V3 §3.11),
    // read the same way: by the item's codes, without the person's plans.
    deadlines: feedDeadlines(all, done, (i) =>
      isHiddenItem(i, hidden, new Set()),
    ),
    now: now.toISOString(),
  });
}

/**
 * `GET /cal/<token>.ics`. Anyone with the link gets the feed; anything else
 * is a plain 404, the same whether the token is malformed, unknown or old.
 * Limited per IP before the lookup (so guessing costs), and per link after.
 */
export async function serveCalendarFeed(
  request: Request,
  env: CalendarFeedEnv,
  ctx: Pick<ExecutionContext, "waitUntil">,
  now: Date = new Date(),
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return plain(405, "Method not allowed", { Allow: "GET, HEAD" });
  const token = tokenFromPath(new URL(request.url).pathname);
  if (!token) return notFound();

  const window = { seconds: 3_600 };
  const limited = () =>
    plain(429, "Too many requests. Try again later.", {
      "Retry-After": String(secondsLeft(window, now)),
    });
  const ipHash = await keyedHash(env.DATA, clientIp(request));
  if (
    (await hit(env.DB, `cal-feed:ip:${ipHash}`, window, now)) >
    FEED_PER_IP_PER_HOUR
  )
    return limited();

  // Counters and lookups use the hash; the token itself goes nowhere.
  const tokenHash = await feedTokenHash(token);
  const userId = await feedOwner(env.DB, tokenHash);
  if (!userId) return notFound();
  if (
    (await hit(env.DB, `cal-feed:${tokenHash}`, window, now)) >
    FEED_PER_TOKEN_PER_HOUR
  )
    return limited();

  let body: string;
  try {
    body = await feedBody(env, userId, now);
  } catch (error) {
    // The error's name only: never the token, the path or the person.
    console.error({
      calendarFeed: error instanceof Error ? error.name : "unknown",
    });
    return plain(503, "The calendar isn't available right now.", {
      "Retry-After": "300",
    });
  }
  ctx.waitUntil(markFetched(env.DB, userId, now));
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="terpsicle.ics"',
      "Cache-Control": FEED_CACHE_CONTROL,
      "X-Robots-Tag": "noindex",
    },
  });
}
