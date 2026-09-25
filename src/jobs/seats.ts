import { runSeats } from "~/ingest/seats";
import { notifySeatChanges } from "~/server/alerts/notify";
import { type Job, jobHttp, jobLog, runJob } from "./job";
import { createR2BlobStore } from "./r2-blob-store";

/**
 * Sections for every department of every active term → seats + changes.
 * Every 5 minutes, so it has 30 s of CPU; a term whose "Open Seats as of"
 * stamp hasn't moved is skipped (refreshed at least hourly anyway). When a
 * term's counts change, watchers of reopened sections get an email (M7).
 */
export const runSeatsJob: Job = async (context) => {
  await runJob("seats", context, async () => {
    let alertsSent = 0;
    const result = await runSeats({
      http: jobHttp(context),
      store: createR2BlobStore(context.env.DATA),
      now: context.now,
      log: jobLog,
      onSeatsPublished: async (before, after) => {
        const result = await notifySeatChanges(context.env, before, after, {
          now: context.now,
        });
        alertsSent += result.sent;
      },
    });
    const counts = {
      alertsSent,
      refreshed: result.terms.filter((t) => t.status === "refreshed").length,
      unchanged: result.terms.filter((t) => t.status === "unchanged").length,
      skipped: result.terms.filter((t) => t.status === "skipped").length,
      sections: sum(result.terms.map((t) => t.sections)),
      changes: sum(result.terms.map((t) => t.changes)),
      rewrittenDepartments: sum(
        result.terms.map((t) => t.rewrittenDepartments),
      ),
      failedDepartments: sum(result.terms.map((t) => t.failedDepartments)),
    };
    return { counts, errors: result.errors };
  });
};

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
