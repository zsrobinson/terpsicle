export interface JobContext {
  env: Env;
  /** When the cron was scheduled to fire. Jobs never read the clock. */
  now: Date;
}

export type Job = (context: JobContext) => Promise<void>;

export type JobName =
  | "seats"
  | "catalog"
  | "planetterp"
  | "calendar-buildings"
  | "routes";

/** Placeholder body shared by jobs that land in M2. */
export async function notImplementedYet(job: JobName, now: Date) {
  console.info({ job, scheduledFor: now.toISOString(), status: "stub" });
}
