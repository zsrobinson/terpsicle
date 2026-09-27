import { pruneSendHashes } from "~/server/chat/spam-guard";
import { blankClosedSnapshots, retryHeld } from "~/server/moderation/service";
import { type Job, runJob } from "./job";

/**
 * Every 5 minutes, beside seats: screens again what a failed model call or
 * the daily cap held (so it reaches the owner only if it keeps failing, V2
 * §9.2), blanks held text 30 days after its item closed (V2 §9.4), and
 * drops chat's spam-guard rows once they're past its hour
 * (MODERATION.md §2). Mostly waiting on Workers AI, so it costs little CPU.
 */
export const runModerationJob: Job = async (context) => {
  await runJob("moderation", context, async () => {
    const retry = await retryHeld(context.env, { now: context.now });
    const blanked = await blankClosedSnapshots(context.env, context.now);
    const sendHashes = await pruneSendHashes(context.env.DB, context.now);
    return { counts: { ...retry, blanked, sendHashes }, errors: [] };
  });
};
