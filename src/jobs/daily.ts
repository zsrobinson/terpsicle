import { deleteExpiredSessions, purgeDueAccounts } from "~/server/auth/purge";
import { pruneReviews } from "~/server/reviews/store";
import { pruneTombstones } from "~/server/sync/store";
import { pruneTodo } from "~/server/todo/store";
import { type Job, runJob } from "./job";

/**
 * The daily housekeeping job (V2.md §13, `7 13 * * *`). Today: purges
 * accounts whose week of grace after "Delete account" has ended (everything
 * of theirs: chat messages in each course's object, pictures in R2, then
 * every D1 row; src/server/auth/purge.ts lists each table), expired
 * sessions, deleted plans' tombstones 30 days on (V2.md §5.2), and
 * reviews' words: rejected ones cleared and deleted rows removed 30 days on
 * (V2.md §7.3), and Todo items due over 30 days ago with their stale done
 * marks (V3.md §3.4). A purged author's reviews stay up without one.
 * Later PRs add the chat digest and the moderation digest.
 */
export const runDailyJob: Job = async (context) => {
  await runJob("daily", context, async () => {
    const { env, now } = context;
    // An account that fails partway is reported and resumed tomorrow.
    const purged = await purgeDueAccounts(env, now);
    const sessionsExpired = await deleteExpiredSessions(env.DB, now);
    const tombstonesPruned = await pruneTombstones(env.DB, now);
    const reviews = await pruneReviews(env.DB, now);
    const todo = await pruneTodo(env.DB, now);
    return {
      counts: {
        accountsPurged: purged.accounts,
        chatCoursesPurged: purged.chatCourses,
        chatMessagesPurged: purged.chatMessages,
        sessionsExpired,
        tombstonesPruned,
        rejectedReviewsBlanked: reviews.blanked,
        deletedReviewsRemoved: reviews.removed,
        todoItemsPruned: todo.items,
        todoDoneMarksPruned: todo.doneMarks,
      },
      errors: purged.errors,
    };
  });
};
