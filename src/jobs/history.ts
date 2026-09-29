import { snapshotHistory } from "~/ingest/history";
import { type Job, jobLog, runJob } from "./job";
import { createR2BlobStore } from "./r2-blob-store";

/**
 * Instructor history (DATA.md §3.5): copies each term's changed department
 * chunks into our own record of who taught what, so a term isn't lost when
 * Testudo stops listing it. Every 6 hours, 41 minutes after the catalog
 * crawl, so it has 15 min of CPU. Reads only R2.
 */
export const runHistoryJob: Job = async (context) => {
  await runJob("history", context, async () => {
    const { errors, ...counts } = await snapshotHistory({
      store: createR2BlobStore(context.env.DATA),
      now: context.now,
      log: jobLog,
    });
    return { counts, errors };
  });
};
