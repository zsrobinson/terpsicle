// Server-side PostHog events (cron telemetry). Anonymous by construction: one
// fixed distinct id, no person profile. See docs/ANALYTICS.md.

const CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";
const DISTINCT_ID = "terpsicle-worker";

/** Every server event name, in one place. Add new ones here. */
export interface ServerEvents {
  cron_job_finished: {
    job: string;
    durationMs: number;
    /** What the job did: departments written, sections, changes, … */
    counts?: Record<string, number>;
    /** Errors it recovered from (a department that kept its old chunk). */
    errorCount?: number;
    firstError?: string;
  };
  cron_job_failed: { job: string; durationMs: number; error: string };
  // Review summaries. Never the review text or anything about the requester.
  summary_generated: {
    model: string;
    durationMs: number;
    reviews: number;
    attempts: number;
  };
  summary_cached: { ageDays: number };
  summary_failed: {
    reason: "model-output" | "model-error" | "planetterp" | "storage";
  };
  summary_capped: { cap: number };
  // Seat alerts. Never an email address, token or IP, not even hashed.
  alert_subscribed: {
    outcome: "confirm-sent" | "already-watching" | "not-sent";
  };
  alert_confirmed: { termId: string };
  alert_sent: { termId: string; count: number };
  alert_unsubscribed: { termId: string };
}
export type ServerEvent = keyof ServerEvents;

/**
 * Sends one event. A no-op without `POSTHOG_TOKEN`, which only production
 * sets (wrangler.jsonc `vars`; vite.config.ts drops it in dev, the worker
 * test pool never has it, previews don't inherit it). Never throws:
 * telemetry must not fail the job it describes.
 */
export async function captureServerEvent<E extends ServerEvent>(
  env: { POSTHOG_TOKEN?: string },
  event: E,
  properties: ServerEvents[E],
  options: { now?: Date; fetcher?: typeof fetch } = {},
): Promise<void> {
  if (!env.POSTHOG_TOKEN) return;
  const { now = new Date(), fetcher = fetch } = options;
  try {
    const response = await fetcher(CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.POSTHOG_TOKEN,
        event,
        distinct_id: DISTINCT_ID,
        timestamp: now.toISOString(),
        properties: { ...properties, $process_person_profile: false },
      }),
    });
    if (!response.ok) {
      console.warn({ analytics: event, status: response.status });
    }
  } catch (error) {
    console.warn({ analytics: event, error: String(error) });
  }
}
