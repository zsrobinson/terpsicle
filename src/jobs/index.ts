import { runCalendarBuildingsJob } from "./calendar-buildings";
import { runCatalogJob } from "./catalog";
import type { Job, JobName } from "./job";
import { runPlanetTerpJob } from "./planetterp";
import { runRoutesJob } from "./routes";
import { runSeatsJob } from "./seats";

// One entry per cron in wrangler.jsonc `triggers.crons`; a worker test fails
// if the two drift. Schedules and CPU budgets: BUILD.md §2.
export const CRON_JOBS: Readonly<Record<string, { name: JobName; run: Job }>> =
  {
    "*/5 * * * *": { name: "seats", run: runSeatsJob },
    "0 */6 * * *": { name: "catalog", run: runCatalogJob },
    "17 5 * * *": { name: "planetterp", run: runPlanetTerpJob },
    "23 6 * * 1": { name: "calendar-buildings", run: runCalendarBuildingsJob },
    "41 * * * *": { name: "routes", run: runRoutesJob },
  };

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
