import { endPastTermWatches } from "~/server/alerts/service";
import { deletePictures } from "~/server/auth/pictures";
import { accountsDueForPurge, purgeAccounts } from "~/server/auth/store";
import { pruneFeedback } from "~/server/feedback/store";
import { pruneDeliveries } from "~/server/notifications/store";
import { pruneReviews } from "~/server/reviews/store";
import { pruneTombstones } from "~/server/sync/store";
import { pruneTodo } from "~/server/todo/store";
import { type Job, runJob } from "./job";

/**
 * The daily housekeeping job (V2.md §13, `7 13 * * *`). Today: purges
 * accounts whose week of grace after "Delete account" has ended (their
 * pictures in R2, then their rows, identities, sessions and synced docs),
 * expired sessions, deleted plans' tombstones 30 days on (V2.md §5.2), and
 * reviews' words: rejected ones cleared and deleted rows removed 30 days on
 * (V2.md §7.3), and Todo items due over 30 days ago with their stale done
 * marks (V3.md §3.4), notification deliveries after 90 days, and feedback
 * past its retention (docs/FEEDBACK.md): undo tokens after 10 minutes,
 * screenshots after 180 days or 30 after closing, items after a year or
 * once the owner's delete can't be undone. A purged author's reviews stay
 * up without one (`reviews.author_id` is ON DELETE SET NULL). Seat watches
 * end once their term is no longer active (V2.md §6.5).
 * Later PRs add the chat digest, the moderation digest, and the rest of an
 * account's data to the purge (V2.md §4.7).
 */
export const runDailyJob: Job = async (context) => {
  await runJob("daily", context, async () => {
    const { env, now } = context;
    const due = await accountsDueForPurge(env.DB, now);
    // Pictures first: if R2 fails, the rows stay and tomorrow tries again.
    for (const userId of due) await deletePictures(env.USER_CONTENT, userId);
    const purged = await purgeAccounts(env.DB, now);
    const tombstonesPruned = await pruneTombstones(env.DB, now);
    const reviews = await pruneReviews(env.DB, now);
    const todo = await pruneTodo(env.DB, now);
    const deliveriesPruned = await pruneDeliveries(env.DB, now);
    const watches = await endPastTermWatches(env);
    const feedback = await pruneFeedback(env.DB, env.USER_CONTENT, now);
    return {
      counts: {
        accountsPurged: purged.accounts,
        sessionsExpired: purged.sessions,
        tombstonesPruned,
        rejectedReviewsBlanked: reviews.blanked,
        deletedReviewsRemoved: reviews.removed,
        todoItemsPruned: todo.items,
        todoDoneMarksPruned: todo.doneMarks,
        deliveriesPruned,
        seatWatchesEnded: watches.watches,
        feedbackUndoCleared: feedback.undoCleared,
        feedbackShotsExpired: feedback.shotsExpired,
        feedbackRemoved: feedback.removed,
      },
      errors: [],
    };
  });
};
