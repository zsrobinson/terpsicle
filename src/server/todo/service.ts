// Terpsicle Todo's JSON routes (docs/V3.md §3.8), registered in
// src/server/api/router.ts, all `auth: "user"`:
//
//   todo/connect      checks, fetches and stores an ELMS feed link
//   todo/disconnect   deletes the link and everything from it
//   todo/list         items and done marks for a range; notes the opening
//   todo/done         marks an item done or not
//   todo/refresh      fetches the feed now (at most every 5 minutes)
//   todo/import-file  stores a dropped file's items
//   todo/hide-course  hides a course's items everywhere, or shows them (V3 §3.11)
//   todo/save-task    adds or changes one of your own tasks (V3 §3.10)
//   todo/delete-task  deletes one, with its done mark
//
// No answer has a field that could hold the link (V3 §5.1).
import {
  TODO_MAX_FEED_ITEMS,
  TODO_MAX_FILE_ITEMS,
  TODO_MAX_HIDDEN,
  TODO_MAX_TASKS,
  type TodoConnectInput,
  type TodoConnectResult,
  type TodoDeleteTaskInput,
  type TodoDeleteTaskResult,
  type TodoDisconnectResult,
  type TodoDoneInput,
  type TodoDoneResult,
  type TodoHideCourseInput,
  type TodoHideCourseResult,
  type TodoImportFileInput,
  type TodoImportFileResult,
  type TodoListInput,
  type TodoListResult,
  type TodoRefreshResult,
  type TodoSaveTaskInput,
  type TodoSaveTaskResult,
} from "~/core/schema";
import {
  connectFailure,
  fromFileItem,
  keepInWindow,
  newYorkDateOf,
  nextFetch,
  ownTaskDue,
  parseFeedLink,
  parseIcs,
  TODO_OPENED_WRITE_MS,
  TODO_REFRESH_MIN_MS,
  taskDateInWindow,
} from "~/core/todo";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import { type AuthEnv, isTestMode } from "../auth/config";
import { type TodoEnv, type TodoMode, todoMode } from "./config";
import {
  type FeedOwner,
  loadSealedLinks,
  saveFeedLinkStatement,
  sealFeedLink,
} from "./crypto";
import { dueTomorrowAtConnect, dueTomorrowOn } from "./due-tomorrow";
import { CONNECT_TIMEOUT_MS, fetchFeed } from "./fetch";
import { refreshFeed } from "./refresh";
import {
  deleteTaskStatements,
  disconnectStatements,
  doneAmong,
  feedItemUids,
  feedOwner,
  feedState,
  feedSuccessStatement,
  getFeed,
  hiddenCourses,
  listItems,
  listTasks,
  markOpened,
  replaceItemsStatements,
  setCourseHidden,
  setDone,
  upsertTask,
} from "./store";

export type TodoApiEnv = TodoEnv & AuthEnv;

type Ready = Extract<TodoMode, { kind: "live" | "test" }>;

/** The signed-in person and Todo's mode, or the error to answer with. */
async function begin(
  env: TodoApiEnv,
  ctx: IdentityRouteContext,
): Promise<{ userId: string; mode: Ready } | Response> {
  // The router guarantees a session for `auth: "user"` routes.
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  const mode = await todoMode(env, {
    testMode: isTestMode(env, new URL(ctx.request.url)),
    fetch: ctx.fetch ?? fetch,
    now: ctx.now,
  });
  if (mode.kind === "off") return apiError("unavailable");
  return { userId: user.id, mode };
}

export async function connect(
  env: TodoApiEnv,
  input: TodoConnectInput,
  ctx: IdentityRouteContext,
): Promise<TodoConnectResult | Response> {
  const started = await begin(env, ctx);
  if (started instanceof Response) return started;
  const { userId, mode } = started;
  const url = parseFeedLink(input.url);
  if (!url) return { status: "invalid-link" };

  // The person is waiting, and Canvas can take a while to build the feed.
  const fetched = await fetchFeed(url, {
    fetch: mode.fetch,
    timeoutMs: CONNECT_TIMEOUT_MS,
  });
  // Nothing but the code goes back: the answer says why, never the link.
  if (!fetched.ok) return connectFailure(fetched.code);
  // No validators were sent, so a 304 isn't an answer to this request.
  if (fetched.notModified) return connectFailure("http-304");
  const parsed = parseIcs(fetched.text, "elms");
  if (!parsed.recognized)
    return { status: "not-a-calendar", reason: "not-recognized" };

  const { now } = ctx;
  const owner: FeedOwner = { userId, source: "elms" };
  // Connecting turns "Due tomorrow" on (V3.md §4); the cadence reads it.
  const dueTomorrow = await dueTomorrowAtConnect(
    env.DB,
    userId,
    (await getFeed(env.DB, userId)) === null,
  );
  const { kept } = keepInWindow(
    parsed.items,
    newYorkDateOf(now.getTime()),
    TODO_MAX_FEED_ITEMS,
  );
  const sealed = await sealFeedLink(mode.keys, owner, url);
  await env.DB.batch([
    saveFeedLinkStatement(env.DB, owner, sealed, now),
    feedSuccessStatement(env.DB, owner, {
      now,
      next: nextFetch({
        now,
        lastOpenedAt: now,
        dueTomorrowOn: dueTomorrow.on,
      }),
      body: {
        etag: fetched.etag,
        lastModified: fetched.lastModified,
        hash: fetched.hash,
      },
      itemCount: kept.length,
      opened: true,
    }),
    // Reconnecting keeps done marks: they're keyed on UIDs, apart from items.
    ...replaceItemsStatements(env.DB, userId, "elms", kept, now),
  ]);
  await dueTomorrow.apply(now);
  const row = await getFeed(env.DB, userId);
  if (!row) return apiError("unavailable");
  return {
    status: "connected",
    feed: feedState(row),
    items: await listItems(env.DB, userId, null),
  };
}

export async function disconnect(
  env: TodoApiEnv,
  ctx: IdentityRouteContext,
): Promise<TodoDisconnectResult | Response> {
  const started = await begin(env, ctx);
  if (started instanceof Response) return started;
  await env.DB.batch(disconnectStatements(env.DB, started.userId));
  return { status: "disconnected" };
}

export async function list(
  env: TodoApiEnv,
  input: TodoListInput,
  ctx: IdentityRouteContext,
): Promise<TodoListResult | Response> {
  const started = await begin(env, ctx);
  if (started instanceof Response) return started;
  const { userId } = started;
  const row = await getFeed(env.DB, userId);
  const opened = row
    ? await markOpened(env.DB, row, ctx.now, TODO_OPENED_WRITE_MS)
    : null;
  // Own tasks with no date are always listed: they're under "No date".
  const items = [
    ...(await listItems(env.DB, userId, input)),
    ...(await listTasks(env.DB, userId, input, { undated: true })),
  ];
  return {
    feed: opened ? feedState(opened) : null,
    items,
    done: await doneAmong(
      env.DB,
      userId,
      items.map((i) => i.uid),
    ),
    hidden: await hiddenCourses(env.DB, userId),
  };
}

export async function hideCourse(
  env: TodoApiEnv,
  input: TodoHideCourseInput,
  ctx: IdentityRouteContext,
): Promise<TodoHideCourseResult | Response> {
  const started = await begin(env, ctx);
  if (started instanceof Response) return started;
  await setCourseHidden(
    env.DB,
    started.userId,
    input.key,
    input.hidden,
    ctx.now,
    TODO_MAX_HIDDEN,
  );
  return { status: "ok" };
}

export async function done(
  env: TodoApiEnv,
  input: TodoDoneInput,
  ctx: IdentityRouteContext,
): Promise<TodoDoneResult | Response> {
  const started = await begin(env, ctx);
  if (started instanceof Response) return started;
  await setDone(env.DB, started.userId, input.uid, input.done, ctx.now);
  return { status: "ok" };
}

export async function saveTask(
  env: TodoApiEnv,
  input: TodoSaveTaskInput,
  ctx: IdentityRouteContext,
): Promise<TodoSaveTaskResult | Response> {
  const started = await begin(env, ctx);
  if (started instanceof Response) return started;
  const { now } = ctx;
  if (!taskDateInWindow(input.dueDate, newYorkDateOf(now.getTime())))
    return { status: "out-of-range" };
  const item = await upsertTask(
    env.DB,
    started.userId,
    {
      uid: input.uid,
      title: input.title,
      courseCode: input.courseCode,
      ...ownTaskDue(input.dueDate, input.dueTime),
    },
    now,
    TODO_MAX_TASKS,
  );
  return item ? { status: "saved", item } : { status: "too-many" };
}

export async function deleteTask(
  env: TodoApiEnv,
  input: TodoDeleteTaskInput,
  ctx: IdentityRouteContext,
): Promise<TodoDeleteTaskResult | Response> {
  const started = await begin(env, ctx);
  if (started instanceof Response) return started;
  await env.DB.batch(deleteTaskStatements(env.DB, started.userId, input.uid));
  return { status: "ok" };
}

export async function refresh(
  env: TodoApiEnv,
  ctx: IdentityRouteContext,
): Promise<TodoRefreshResult | Response> {
  const started = await begin(env, ctx);
  if (started instanceof Response) return started;
  const { userId, mode } = started;
  const { now } = ctx;
  const row = await getFeed(env.DB, userId);
  if (!row) return { status: "failed", feed: null };
  // A broken link stays broken until a new one is pasted.
  if (row.status === "broken")
    return { status: "failed", feed: feedState(row) };
  if (
    row.last_fetch_at !== null &&
    now.getTime() - Date.parse(row.last_fetch_at) < TODO_REFRESH_MIN_MS
  )
    return { status: "too-soon", feed: feedState(row) };
  const sealed = (await loadSealedLinks(env.DB, [feedOwner(row)]))(
    feedOwner(row),
  );
  if (sealed === null) return { status: "failed", feed: feedState(row) };
  const outcome = await refreshFeed(env.DB, mode, row, sealed, {
    now,
    random: Math.random(),
    opened: true,
    dueTomorrowOn: (await dueTomorrowOn(env.DB, [userId])).has(userId),
  });
  const after = await getFeed(env.DB, userId);
  return {
    status: outcome.kind === "failed" ? "failed" : "fetched",
    feed: after ? feedState(after) : null,
  };
}

export async function importFile(
  env: TodoApiEnv,
  input: TodoImportFileInput,
  ctx: IdentityRouteContext,
): Promise<TodoImportFileResult | Response> {
  const started = await begin(env, ctx);
  if (started instanceof Response) return started;
  const { userId } = started;
  const { now } = ctx;
  // One per UID (the last wins), inside the window, and not already on the
  // ELMS feed: the feed's copy updates, a file's doesn't.
  const byUid = new Map(
    input.items.map((item) => [item.uid, fromFileItem(item)]),
  );
  const onFeed = await feedItemUids(env.DB, userId);
  const { kept } = keepInWindow(
    [...byUid.values()].filter((item) => !onFeed.has(item.uid)),
    newYorkDateOf(now.getTime()),
    TODO_MAX_FILE_ITEMS,
  );
  // A new file replaces the last one's items.
  await env.DB.batch(replaceItemsStatements(env.DB, userId, "file", kept, now));
  return {
    status: "imported",
    added: kept.length,
    skipped: input.items.length - kept.length,
  };
}
