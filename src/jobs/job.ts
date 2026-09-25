import { createHttpClient, type HttpClient } from "~/ingest/http";
import { consoleLogger } from "~/ingest/publish";
import { captureServerEvent } from "~/server/analytics";

export interface JobContext {
  env: Env;
  /** When the cron was scheduled to fire. Jobs never read the clock. */
  now: Date;
  /** Outbound fetch; tests pass a mock built from saved pages. */
  fetch?: typeof fetch;
}

export type Job = (context: JobContext) => Promise<void>;

export type JobName = "seats" | "catalog" | "planetterp" | "calendar-buildings";

/** What a job reports: counts for telemetry, and errors it recovered from. */
export interface JobReport {
  counts: Record<string, number>;
  errors: string[];
}

export function jobHttp(context: JobContext): HttpClient {
  return createHttpClient({ fetch: context.fetch ?? fetch });
}

export const jobLog = consoleLogger;

/**
 * Runs a job body with telemetry (`cron_job_finished` / `cron_job_failed`,
 * docs/ANALYTICS.md). Failures are rethrown so Cloudflare records the cron
 * as failed; recovered errors (a department that kept its old chunk) only
 * count.
 */
export async function runJob(
  name: JobName,
  context: JobContext,
  body: () => Promise<JobReport>,
): Promise<JobReport> {
  const started = Date.now();
  const telemetry = {
    now: context.now,
    ...(context.fetch ? { fetcher: context.fetch } : {}),
  };
  try {
    const report = await body();
    const durationMs = Date.now() - started;
    console.info({
      job: name,
      durationMs,
      ...report.counts,
      errors: report.errors.slice(0, 20),
    });
    await captureServerEvent(
      context.env,
      "cron_job_finished",
      {
        job: name,
        durationMs,
        counts: report.counts,
        errorCount: report.errors.length,
        ...(report.errors[0]
          ? { firstError: report.errors[0].slice(0, 300) }
          : {}),
      },
      telemetry,
    );
    return report;
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    console.error({ job: name, durationMs, error: message });
    await captureServerEvent(
      context.env,
      "cron_job_failed",
      { job: name, durationMs, error: message.slice(0, 500) },
      telemetry,
    );
    throw error;
  }
}
