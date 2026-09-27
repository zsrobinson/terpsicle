// "Due tomorrow" (docs/V3.md §4): the Todo cron's runs from 6pm to midnight
// in New York push once to each person with the reminder on, a feed that's
// working (active, and fetched in the last 26 hours: stale data mustn't
// remind), and something not done that's due the next day. The first run
// after 6pm sends; later ones catch up anyone it missed, and the dedupe key
// `todo-due:<user>:<New York date>` keeps it to one a day.

import { withChannel } from "~/core/notifications";
import {
  dueTomorrowKey,
  dueTomorrowPush,
  dueTomorrowRun,
  TODO_DUE_FRESH_MS,
} from "~/core/todo";
import { type NotifyEnv, notify } from "../notifications/notify";
import { readSettings, writeSettings } from "../notifications/store";
import { doneAmong, listItems } from "./store";

/** People reminded per run, at most; the next run (20 minutes on) takes the rest. */
export const TODO_DUE_BATCH = 2_000;

export interface DueTomorrowResult {
  /** People with something due tomorrow and the reminder on, not yet reminded today. */
  due: number;
  /** Pushed to at least one device. */
  sent: number;
  /** No device, push off here, or every device failed. */
  unsent: number;
}

/** Who to remind this run (see the top of this file). */
async function candidates(
  db: D1Database,
  now: Date,
  today: string,
  tomorrow: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT f.user_id FROM todo_feeds f
       JOIN users u ON u.id = f.user_id AND u.status = 'active'
       JOIN notification_settings s ON s.user_id = f.user_id
         AND json_extract(s.settings, '$.todoDue.push') = 1
       WHERE f.status = 'active' AND f.last_success_at >= ?1
         AND NOT EXISTS (SELECT 1 FROM notification_deliveries d
                         WHERE d.dedupe_key = 'todo-due:' || f.user_id || ':' || ?2 || ':push')
         AND EXISTS (SELECT 1 FROM todo_items i
                     WHERE i.user_id = f.user_id AND i.due_date = ?3
                       AND NOT EXISTS (SELECT 1 FROM todo_done d
                                       WHERE d.user_id = i.user_id AND d.uid = i.uid))
       ORDER BY f.user_id LIMIT ?4`,
    )
    .bind(
      new Date(now.getTime() - TODO_DUE_FRESH_MS).toISOString(),
      today,
      tomorrow,
      TODO_DUE_BATCH,
    )
    .all<{ user_id: unknown }>();
  return results.flatMap((r) =>
    typeof r.user_id === "string" ? [r.user_id] : [],
  );
}

export async function sendDueTomorrow(
  env: NotifyEnv,
  options: { now: Date; testMode?: boolean; fetch?: typeof fetch },
): Promise<DueTomorrowResult> {
  const result: DueTomorrowResult = { due: 0, sent: 0, unsent: 0 };
  const run = dueTomorrowRun(options.now.getTime());
  if (!run) return result;
  const { today, tomorrow } = run;
  for (const userId of await candidates(env.DB, options.now, today, tomorrow)) {
    const items = await listItems(env.DB, userId, {
      from: tomorrow,
      to: tomorrow,
    });
    const done = new Set(
      await doneAmong(
        env.DB,
        userId,
        items.map((i) => i.uid),
      ),
    );
    const open = items.filter((i) => !done.has(i.uid));
    if (open.length === 0) continue;
    result.due++;
    const sent = await notify(
      env,
      userId,
      {
        type: "todo-due",
        key: dueTomorrowKey(userId, today),
        push: dueTomorrowPush(open, tomorrow),
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
  }
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
 * Connecting ELMS turns "Due tomorrow" on (V3.md §4), when the person had
 * no feed before. Reconnecting a feed that's still there (a new link for
 * the same calendar) leaves their choice alone. Returns whether it's on.
 */
export async function turnOnAtConnect(
  db: D1Database,
  userId: string,
  firstConnect: boolean,
  now: Date,
): Promise<boolean> {
  const settings = await readSettings(db, userId);
  if (!firstConnect) return settings.todoDue.push;
  if (!settings.todoDue.push)
    await writeSettings(
      db,
      userId,
      withChannel(settings, "todo-due", "push", true),
      now,
    );
  return true;
}
