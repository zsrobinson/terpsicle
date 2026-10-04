// "Due tomorrow" (docs/V3.md §4, V2.md §6.7): the Todo cron's runs from 6pm
// to midnight in New York tell each person with a feed that's working
// (active, and fetched in the last 26 hours: stale data mustn't remind) and
// something not done that's due the next day, once: an inbox row for
// everyone, and a push for those with the reminder on. The first run after
// 6pm sends; later ones catch up anyone it missed, and the key
// `todo-due:<user>:<New York date>` keeps it to one a day.

import { todoDueTag, withChannel } from "~/core/notifications";
import {
  dueTomorrowInbox,
  dueTomorrowKey,
  dueTomorrowPush,
  dueTomorrowRun,
  isHiddenItem,
  TODO_DUE_FRESH_MS,
} from "~/core/todo";
import { type NotifyEnv, notify } from "../notifications/notify";
import { readSettings, writeSettings } from "../notifications/store";
import { userData } from "../security/user-keys";
import {
  doneAmong,
  hiddenCourses,
  IN_HIDDEN_COURSE,
  listItems,
  listTasks,
} from "./store";

/** People reminded per run, at most; the next run (20 minutes on) takes the rest. */
export const TODO_DUE_BATCH = 2_000;

export interface DueTomorrowResult {
  /** People with something due tomorrow, not yet told today: each got an inbox row. */
  due: number;
  /** Pushed to at least one device. */
  sent: number;
  /** The reminder off, no device, push off here, or every device failed. */
  unsent: number;
  /** People skipped because something threw (their tasks wouldn't open). */
  failed: number;
  /** Those errors' names, never their messages. */
  errors: string[];
}

/** Who to remind this run (see the top of this file). */
async function candidates(
  db: D1Database,
  now: Date,
  today: string,
  tomorrow: string,
  batch: number,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT f.user_id FROM todo_feeds f
       JOIN users u ON u.id = f.user_id AND u.status = 'active'
       LEFT JOIN notification_settings s ON s.user_id = f.user_id
       WHERE f.status = 'active' AND f.last_success_at >= ?1
         -- Told today: the inbox row (a delivery row alone is from before the inbox).
         AND NOT EXISTS (SELECT 1 FROM notifications n
                         WHERE n.id = 'todo-due:' || f.user_id || ':' || ?2)
         AND NOT EXISTS (SELECT 1 FROM notification_deliveries d
                         WHERE d.dedupe_key = 'todo-due:' || f.user_id || ':' || ?2 || ':push')
         -- Own tasks count like the feed's items (V3.md §3.10); a hidden
         -- course never reminds (§3.11). A task is in a course by its code.
         AND (EXISTS (SELECT 1 FROM todo_items i
                      WHERE i.user_id = f.user_id AND i.due_date = ?3
                        AND NOT EXISTS (SELECT 1 FROM todo_done d
                                        WHERE d.user_id = i.user_id AND d.uid = i.uid)
                        AND NOT ${IN_HIDDEN_COURSE("i")})
              OR EXISTS (SELECT 1 FROM todo_tasks t
                         WHERE t.user_id = f.user_id AND t.due_date = ?3
                           AND NOT EXISTS (SELECT 1 FROM todo_done d
                                           WHERE d.user_id = t.user_id AND d.uid = t.uid)
                           AND NOT EXISTS (SELECT 1 FROM todo_hidden h
                                           WHERE h.user_id = t.user_id
                                             AND h.course_key = t.course_code)))
       -- The people a push reaches first, so an inbox-only row never
       -- crowds out a push in a full batch (the next run takes the rest).
       ORDER BY (COALESCE(json_extract(s.settings, '$.todoDue.push'), 0) = 1
                 AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = f.user_id)) DESC,
                f.user_id
       LIMIT ?4`,
    )
    .bind(
      new Date(now.getTime() - TODO_DUE_FRESH_MS).toISOString(),
      today,
      tomorrow,
      batch,
    )
    .all<{ user_id: unknown }>();
  return results.flatMap((r) =>
    typeof r.user_id === "string" ? [r.user_id] : [],
  );
}

/** Reminders sent at once, like the fetches (the Todo cron's budget is its 20 minutes). */
const TODO_DUE_CONCURRENCY = 8;

export async function sendDueTomorrow(
  env: NotifyEnv,
  options: {
    now: Date;
    testMode?: boolean;
    fetch?: typeof fetch;
    /** Tests make it small. */
    batch?: number;
  },
): Promise<DueTomorrowResult> {
  const result: DueTomorrowResult = {
    due: 0,
    sent: 0,
    unsent: 0,
    failed: 0,
    errors: [],
  };
  const run = dueTomorrowRun(options.now.getTime());
  if (!run) return result;
  const { today, tomorrow } = run;
  const people = await candidates(
    env.DB,
    options.now,
    today,
    tomorrow,
    options.batch ?? TODO_DUE_BATCH,
  );
  // Crons have no host: test mode is the caller's, or the var alone.
  const data = userData(env, {
    testMode: options.testMode ?? env.AUTH_TEST_MODE === "true",
  });
  const one = async (userId: string) => {
    const day = { from: tomorrow, to: tomorrow };
    const items = [
      ...(await listItems(env.DB, userId, day)),
      ...(await listTasks(data, userId, day, { undated: false })),
    ];
    const done = new Set(
      await doneAmong(
        env.DB,
        userId,
        items.map((i) => i.uid),
      ),
    );
    const hidden = new Set(await hiddenCourses(env.DB, userId));
    const open = items.filter(
      (i) => !done.has(i.uid) && !isHiddenItem(i, hidden, new Set()),
    );
    if (open.length === 0) return;
    result.due++;
    const key = dueTomorrowKey(userId, today);
    const words = dueTomorrowPush(open, tomorrow);
    // The inbox row is stored as it is: it never names your own tasks.
    const stored = dueTomorrowInbox(open, tomorrow);
    // A push that fails is claimed as failed and not tried again tonight:
    // the catch-up is for runs that didn't happen (V3.md §4 "As built").
    const sent = await notify(
      env,
      userId,
      {
        type: "todo-due",
        key,
        inbox: [
          {
            id: key,
            groupKey: todoDueTag(tomorrow),
            count: open.length,
            title: stored.title,
            body: stored.body,
            url: words.url,
          },
        ],
        push: {
          event: { type: "todo-due", title: words.title, body: words.body },
          url: words.url,
        },
      },
      {
        now: options.now,
        ...(options.testMode !== undefined
          ? { testMode: options.testMode }
          : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      },
    );
    if (sent.push === "sent") result.sent++;
    else result.unsent++;
  };
  let next = 0;
  await Promise.all(
    Array.from({ length: TODO_DUE_CONCURRENCY }, async () => {
      for (let id = people[next++]; id; id = people[next++])
        // One person whose tasks won't open (no key, or a title that
        // won't) is counted and logged by the error's name; the rest go on.
        await one(id).catch((error: unknown) => {
          result.failed++;
          result.errors.push(error instanceof Error ? error.name : "error");
        });
    }),
  );
  return result;
}

/** Of these people, the ones with "Due tomorrow" on (the cadence keeps their feeds fresh). */
export async function dueTomorrowOn(
  db: D1Database,
  userIds: readonly string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { results } = await db
    .prepare(
      `SELECT user_id FROM notification_settings
       WHERE user_id IN (SELECT value FROM json_each(?1))
         AND json_extract(settings, '$.todoDue.push') = 1`,
    )
    .bind(JSON.stringify(userIds))
    .all<{ user_id: unknown }>();
  return new Set(
    results.flatMap((r) => (typeof r.user_id === "string" ? [r.user_id] : [])),
  );
}

/**
 * Connecting ELMS turns "Due tomorrow" on (V3.md §4) when the person had no
 * feed; pasting a new link over a connected feed leaves their choice alone.
 * `plan` says whether it will be on (for the cadence) before the feed is
 * stored; `apply` writes it after, so a failed connect changes nothing.
 */
export async function dueTomorrowAtConnect(
  db: D1Database,
  userId: string,
  firstConnect: boolean,
): Promise<{ on: boolean; apply: (now: Date) => Promise<void> }> {
  const settings = await readSettings(db, userId);
  const turnOn = firstConnect && !settings.todoDue.push;
  return {
    on: firstConnect || settings.todoDue.push,
    apply: async (now) => {
      if (turnOn)
        await writeSettings(
          db,
          userId,
          withChannel(settings, "todo-due", "push", true),
          now,
        );
    },
  };
}
