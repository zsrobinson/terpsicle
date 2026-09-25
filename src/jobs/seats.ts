import { runSeats } from "~/ingest/seats";
import { type Job, jobHttp, jobLog, runJob } from "./job";
import { createR2BlobStore } from "./r2-blob-store";

/**
 * Sections for every department of every active term → seats + changes.
 * Every 5 minutes, so it has 30 s of CPU; a term whose "Open Seats as of"
 * stamp hasn't moved is skipped (refreshed at least hourly anyway).
 * Seat-alert emails hook in here in M7.
 */
export const runSeatsJob: Job = async (context) => {
  await runJob("seats", context, async () => {
    const result = await runSeats({
      http: jobHttp(context),
      store: createR2BlobStore(context.env.DATA),
      now: context.now,
      log: jobLog,
    });
    const counts = {
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
