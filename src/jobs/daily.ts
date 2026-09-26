import { deletePictures } from "~/server/auth/pictures";
import { accountsDueForPurge, purgeAccounts } from "~/server/auth/store";
import { type Job, runJob } from "./job";

/**
 * The daily housekeeping job (V2.md §13, `7 13 * * *`). Today: purges
 * accounts whose week of grace after "Delete account" has ended (their
 * pictures in R2, then their rows, identities and sessions) and expired
 * sessions. Later PRs add the chat digest, the moderation digest, and the
 * rest of an account's data to the purge (V2.md §4.7).
 */
export const runDailyJob: Job = async (context) => {
  await runJob("daily", context, async () => {
    const { env, now } = context;
    const due = await accountsDueForPurge(env.DB, now);
    // Pictures first: if R2 fails, the rows stay and tomorrow tries again.
    for (const userId of due) await deletePictures(env.USER_CONTENT, userId);
    const purged = await purgeAccounts(env.DB, now);
    return {
      counts: {
        accountsPurged: purged.accounts,
        sessionsExpired: purged.sessions,
      },
      errors: [],
    };
  });
};
