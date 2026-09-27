import { endPastTermWatches } from "~/server/alerts/service";
import { deleteExpiredSessions, purgeDueAccounts } from "~/server/auth/purge";
import { groupOpenFeedback } from "~/server/feedback/group";
import { pruneFeedback } from "~/server/feedback/store";
import {
  pruneChatNotifications,
  sendChatDigests,
} from "~/server/notifications/digest";
import { pruneDeliveries } from "~/server/notifications/store";
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
 * marks (V3.md §3.4), notification deliveries after 90 days, and feedback
 * past its retention (docs/FEEDBACK.md): undo tokens after 10 minutes,
 * screenshots after 180 days or 30 after closing, items after a year or
 * once the owner's delete can't be undone. A purged author's reviews stay
 * up without one. Seat watches end once their term is no longer active
 * (V2.md §6.5). It sends the chat digest (V2.md §6.6) and prunes chat
 * mentions and replies after 30 days. It groups open feedback again with
 * Workers AI (src/server/feedback/group.ts).
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
    // A digest that fails is reported; the rest of the job still runs, and
    // tomorrow's digest picks up what wasn't sent.
    const digestErrors: string[] = [];
    const digest = await sendChatDigests(env, { now }).catch(
      (error: unknown) => {
        digestErrors.push(
          `chat digest: ${error instanceof Error ? error.name : "error"}`,
        );
        return { emailed: 0, notifications: 0 };
      },
    );
    const chatNotificationsPruned = await pruneChatNotifications(env.DB, now);
    const deliveriesPruned = await pruneDeliveries(env.DB, now);
    const watches = await endPastTermWatches(env);
    const feedback = await pruneFeedback(env.DB, env.USER_CONTENT, now);
    // Grouping is a convenience: a model that doesn't answer leaves
    // yesterday's groups, and the job goes on.
    const grouping = await groupOpenFeedback(env, now).catch(() => null);
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
        todoTasksPruned: todo.tasks,
        todoDoneMarksPruned: todo.doneMarks,
        chatDigestsEmailed: digest.emailed,
        chatNotificationsDigested: digest.notifications,
        chatNotificationsPruned,
        deliveriesPruned,
        seatWatchesEnded: watches.watches,
        feedbackUndoCleared: feedback.undoCleared,
        feedbackShotsExpired: feedback.shotsExpired,
        feedbackRemoved: feedback.removed,
        feedbackGroups: grouping?.groups ?? 0,
        feedbackGrouped: grouping?.grouped ?? 0,
      },
      errors: [...purged.errors, ...digestErrors],
    };
  });
};
