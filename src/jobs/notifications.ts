import { alertAdmins } from "~/server/admin/alerts";
import { releaseHeldPushes } from "~/server/notifications/quiet";
import { type Job, runJob } from "./job";

/**
 * Every 5 minutes, beside seats and moderation (docs/V2.md §6.7): at 8am
 * New York, the pushes that waited through quiet hours go, one per group;
 * and admins hear about urgent items moderation held, at most once an
 * hour. Both are a look at a small index when there's nothing to do.
 */
export const runNotificationsJob: Job = async (context) => {
  await runJob("notifications", context, async () => {
    const options = {
      now: context.now,
      ...(context.fetch ? { fetch: context.fetch } : {}),
    };
    const released = await releaseHeldPushes(context.env, options);
    const alerts = await alertAdmins(context.env, options);
    return {
      counts: {
        releasedGroups: released.groups,
        releasedSent: released.sent,
        adminAlerts: alerts.alerted,
        adminAlertItems: alerts.items,
      },
      errors: [],
    };
  });
};
