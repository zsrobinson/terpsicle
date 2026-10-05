// Your data, from the account (docs/DATA.md §5.6): what only the server
// holds, for the data file Settings downloads. The device adds its synced
// plans, four-year plans and settings; this adds who you are, Todo's own
// tasks, seat watches, notification settings, your class chats and the
// messages you wrote, and your reviews. Never anyone else's data: a reply
// names what it answers by id, and nothing here reads another person's row.

import { courseRoomId, type MyReview } from "~/core/schema";
import {
  type AccountData,
  AccountDataSchema,
  type ExportChatMessage,
} from "~/core/schema/data-export";
import { taskFieldsOf } from "~/core/todo";
import { listWatches } from "../alerts/store";
import type { ApiEnv, RouteContext } from "../api/route";
import { chatDataOf } from "../chat/store";
import { readSettings } from "../notifications/store";
import { myReviews } from "../reviews/api";
import { userDataForRequest } from "../security/user-keys";
import { todoAvailable } from "../todo/config";
import { doneAmong, hiddenCourses, listTasks } from "../todo/store";
import { isTestMode } from "./config";
import { getUser } from "./store";

/** `POST /api/account/export`: everything above, checked against the format. */
export async function accountData(
  env: ApiEnv,
  ctx: RouteContext,
): Promise<AccountData | null> {
  const user = ctx.session?.user;
  if (!user) return null;
  const row = await getUser(env.DB, user.id);
  if (!row) return null;
  const testMode = isTestMode(env, new URL(ctx.request.url));
  const [todo, watches, notificationSettings, chat, reviews] =
    await Promise.all([
      todoAvailable(env, testMode) ? todoData(env, ctx, user.id) : null,
      listWatches(env.DB, user.id),
      readSettings(env.DB, user.id),
      chatData(env, user.id),
      ownReviews(env, ctx),
    ]);
  return AccountDataSchema.parse({
    profile: {
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: row.created_at,
    },
    todo,
    seatWatches: watches.map((w) => ({
      termId: w.term_id,
      sectionKey: w.section_key,
      createdAt: w.created_at,
    })),
    notificationSettings,
    chat,
    reviews,
  } satisfies AccountData);
}

async function todoData(env: ApiEnv, ctx: RouteContext, userId: string) {
  const items = await listTasks(
    userDataForRequest(env, ctx.request),
    userId,
    null,
    { undated: true },
  );
  const done = new Set(
    await doneAmong(
      env.DB,
      userId,
      items.map((i) => i.uid),
    ),
  );
  return {
    tasks: items.map((item) => ({
      uid: item.uid,
      ...taskFieldsOf(item),
      done: done.has(item.uid),
    })),
    hiddenCourses: await hiddenCourses(env.DB, userId),
  };
}

/** Rooms, follows and mutes from D1; each course's messages from its object. */
async function chatData(env: ApiEnv, userId: string) {
  const rows = await chatDataOf(env.DB, userId);
  const messages: ExportChatMessage[] = [];
  if (env.COURSE_CHAT)
    for (const course of rows.authored) {
      const stub = env.COURSE_CHAT.get(
        env.COURSE_CHAT.idFromName(
          courseRoomId(course.termId, course.courseCode),
        ),
      );
      messages.push(...(await stub.exportAuthor({ ...course, userId })));
    }
  return {
    rooms: rows.rooms,
    follows: rows.follows,
    muted: rows.muted,
    messages,
  };
}

async function ownReviews(env: ApiEnv, ctx: RouteContext): Promise<MyReview[]> {
  const result = await myReviews(env, ctx);
  return result instanceof Response ? [] : result.reviews;
}
