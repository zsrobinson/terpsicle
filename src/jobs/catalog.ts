import { runCatalog } from "~/ingest/catalog";
import { type Job, jobHttp, jobLog, runJob } from "./job";
import { createR2BlobStore } from "./r2-blob-store";

/**
 * Testudo's term list → terms.json; per active term: departments, courses and
 * sections → per-department chunks + manifest. Archives terms Testudo dropped.
 * Every 6 hours, so it has 15 min of CPU.
 */
export const runCatalogJob: Job = async (context) => {
  await runJob("catalog", context, async () => {
    const result = await runCatalog({
      http: jobHttp(context),
      store: createR2BlobStore(context.env.DATA),
      now: context.now,
      log: jobLog,
    });
    const { errors, ...counts } = result;
    return { counts, errors };
  });
};
