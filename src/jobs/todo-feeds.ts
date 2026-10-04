import { captureServerEvent } from "~/server/analytics";
import { type TodoEnv, todoMode } from "~/server/todo/config";
import { loadSealedLinks } from "~/server/todo/crypto";
import { dueTomorrowOn, sendDueTomorrow } from "~/server/todo/due-tomorrow";
import { refreshFeed } from "~/server/todo/refresh";
import { dueFeeds, feedOwner, type TodoFeedRow } from "~/server/todo/store";
import { type Job, runJob } from "./job";

/** Feeds fetched per run, at most (V3 §3.5): about 8,000 on a 20-minute cadence. */
export const TODO_FETCH_BATCH = 400;
/** Feeds fetched at once. */
export const TODO_FETCH_CONCURRENCY = 8;

/**
 * Terpsicle Todo's feeds (docs/V3.md §3.5, `3,23,43 * * * *`): fetches the
 * active feeds that are due, oldest first, 8 at a time, with backoff after
 * failures, `broken` after ELMS stops sharing a link, and `paused` for feeds
 * nobody opens. Then, from 6pm to midnight in New York, it sends "Due
 * tomorrow" (V3.md §4; src/server/todo/due-tomorrow.ts): the run that
 * crosses 6pm sends, later ones catch up. It reports counts only, never a
 * feed.
 */
export const runTodoFeedsJob: Job = async (context) => {
  await runJob("todo-feeds", context, async () => {
    const { now } = context;
    const env: TodoEnv = context.env;
    const counts = {
      due: 0,
      fetched: 0,
      notModified: 0,
      unchanged: 0,
      failed: 0,
      broken: 0,
      paused: 0,
    };
    // Crons have no host, so test mode here is the var alone; production
    // never sets it (auth.test.ts checks).
    const mode = await todoMode(env, {
      testMode: env.AUTH_TEST_MODE === "true",
      fetch: context.fetch ?? fetch,
      now,
    });
    if (mode.kind === "off") return { counts, errors: [] };

    const started = Date.now();
    const due = await dueFeeds(env.DB, now, TODO_FETCH_BATCH);
    counts.due = due.length;
    const sealedFor = await loadSealedLinks(env.DB, due.map(feedOwner));
    // "Due tomorrow" keeps a feed on the 20-minute cadence (V3.md §3.5).
    const reminded = await dueTomorrowOn(
      env.DB,
      due.map((row) => row.user_id),
    );
    const errors: string[] = [];

    const one = async (row: TodoFeedRow) => {
      const sealed = sealedFor(feedOwner(row));
      // Disconnected since the select.
      if (sealed === null) return;
      try {
        const outcome = await refreshFeed(env.DB, mode, row, sealed, {
          now,
          random: Math.random(),
          opened: false,
          dueTomorrowOn: reminded.has(row.user_id),
        });
        switch (outcome.kind) {
          case "fetched":
            counts.fetched++;
            break;
          case "not-modified":
            counts.notModified++;
            break;
          case "unchanged":
            counts.unchanged++;
            break;
          case "failed":
            counts.failed++;
            if (outcome.broken) counts.broken++;
            break;
        }
        if (outcome.kind !== "failed" && outcome.paused) counts.paused++;
      } catch (error) {
        // A D1 error; the fetcher itself never throws. The message names
        // no link (the link never reaches a statement's text).
        errors.push(error instanceof Error ? error.name : "error");
      }
    };
    let next = 0;
    await Promise.all(
      Array.from({ length: TODO_FETCH_CONCURRENCY }, async () => {
        for (let row = due[next++]; row; row = due[next++]) await one(row);
      }),
    );

    await captureServerEvent(
      env,
      "todo_fetch_run",
      { ...counts, durationMs: Date.now() - started },
      { now, ...(context.fetch ? { fetcher: context.fetch } : {}) },
    );

    // After the fetches, so tonight's reminder reads what ELMS says now.
    let reminders = { due: 0, sent: 0, unsent: 0, failed: 0 };
    try {
      const sent = await sendDueTomorrow(context.env, {
        now,
        testMode: env.AUTH_TEST_MODE === "true",
        ...(context.fetch ? { fetch: context.fetch } : {}),
      });
      reminders = sent;
      errors.push(...sent.errors.map((name) => `due tomorrow: ${name}`));
    } catch (error) {
      errors.push(
        `due tomorrow: ${error instanceof Error ? error.name : "error"}`,
      );
    }
    return {
      counts: {
        ...counts,
        dueTomorrow: reminders.due,
        dueTomorrowSent: reminders.sent,
        dueTomorrowUnsent: reminders.unsent,
        dueTomorrowFailed: reminders.failed,
      },
      errors,
    };
  });
};
