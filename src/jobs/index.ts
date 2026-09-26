import { runCalendarBuildingsJob } from "./calendar-buildings";
import { runCatalogJob } from "./catalog";
import { runDailyJob } from "./daily";
import type { Job, JobName } from "./job";
import { runModerationJob } from "./moderation";
import { runPlanetTerpJob } from "./planetterp";
import { runSeatsJob } from "./seats";

// One entry per cron in wrangler.jsonc `triggers.crons`; a worker test fails
// if the two drift. Schedules and CPU budgets: BUILD.md §2. Routes aren't a
// cron: Workers can't reach UMD's token server (scripts/build-routes.ts).
export const CRON_JOBS: Readonly<Record<string, { name: JobName; run: Job }>> =
  {
    "*/5 * * * *": { name: "seats", run: allOf(runSeatsJob, runModerationJob) },
    "0 */6 * * *": { name: "catalog", run: runCatalogJob },
    "17 5 * * *": { name: "planetterp", run: runPlanetTerpJob },
    "23 6 * * 1": { name: "calendar-buildings", run: runCalendarBuildingsJob },
    "7 13 * * *": { name: "daily", run: runDailyJob },
  };

/**
 * Runs jobs that share a cron one after another. Each reports its own
 * telemetry; one failing doesn't stop the next, and the first failure is
 * rethrown so Cloudflare still marks the run failed.
 */
export function allOf(...jobs: Job[]): Job {
  return async (context) => {
    const results = await jobs.reduce<Promise<PromiseSettledResult<void>[]>>(
      async (done, job) => {
        const settled = await done;
        const [result] = await Promise.allSettled([job(context)]);
        // allSettled of one job always yields one result.
        return result ? [...settled, result] : settled;
      },
      Promise.resolve([]),
    );
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  };
}

export class UnknownCronError extends Error {
  constructor(cron: string) {
    super(
      `No job for cron "${cron}". Add it to CRON_JOBS in src/jobs/index.ts so it matches wrangler.jsonc.`,
    );
    this.name = "UnknownCronError";
  }
}

/** Runs the job for `controller.cron` and returns its name. */
export async function runScheduled(
  controller: Pick<ScheduledController, "cron" | "scheduledTime">,
  env: Env,
): Promise<JobName> {
  const job = CRON_JOBS[controller.cron];
  if (!job) throw new UnknownCronError(controller.cron);
  await job.run({ env, now: new Date(controller.scheduledTime) });
  return job.name;
}
