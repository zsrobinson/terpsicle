// POST /api/admin/health (V2 §10): the numbers on the queue page's header.
// Counts only; later PRs add their own (push failures, email sends, Todo's
// feeds) as new fields.
import type { AdminHealth } from "~/core/schema";
import { readCount } from "../counters";
import {
  CAP_COUNTER,
  CAP_WINDOW,
  dailyCap,
  type ModerationEnv,
} from "../moderation/service";
import { queueStats } from "../moderation/store";

export async function adminHealth(
  env: Pick<ModerationEnv, "DB" | "MODERATION_DAILY_CAP">,
  now: Date,
): Promise<AdminHealth> {
  const cap = dailyCap(env);
  const [attempts, stats] = await Promise.all([
    readCount(env.DB, CAP_COUNTER, CAP_WINDOW, now),
    queueStats(env.DB),
  ]);
  return {
    // The counter also counts attempts the cap turned away; those never
    // reached a model.
    aiCalls: { today: Math.min(attempts, cap), cap },
    retry: { waiting: stats.retry, oldestAt: stats.oldestRetryAt },
    queue: {
      open: stats.open,
      urgent: stats.urgent,
      oldestAt: stats.oldestOpenAt,
    },
  };
}
