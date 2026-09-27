// A page of inbox rows as the app shows them (V2.md §6.7). Seats, Todo and
// admin rows carry their words; a chat row carries only its message, so
// its words come from the course's object, per reader, the way the digest
// gets them: a message deleted, held or removed since, or in a room the
// reader can't read now, drops out, and D1 never holds chat text.
import { chatMessageHref, chatPlaceWords } from "~/core/chat";
import { groupWords, type InboxEvent } from "~/core/notifications";
import {
  CourseCodeSchema,
  courseRoomId,
  RoomIdSchema,
  TermIdSchema,
} from "~/core/schema";
import type { InboxItem } from "~/core/schema/notifications";
import type { CourseChatNamespace } from "../chat/course-chat";
import type { InboxItemRow } from "./inbox";

type Found = { text: string; place: string; threadRoot: string | null };

/**
 * What each course's object shows this reader of the page's chat
 * messages, by message id; a course that couldn't be reached maps to null.
 */
async function chatWords(
  chat: CourseChatNamespace | undefined,
  userId: string,
  rows: readonly InboxItemRow[],
): Promise<Map<string, Map<string, Found> | null>> {
  const byCourse = new Map<
    string,
    { termId: string; courseCode: string; ids: string[] }
  >();
  for (const row of rows) {
    if (row.product !== "chat" || !row.term_id || !row.course_code) continue;
    if (!row.message_id) continue;
    const key = courseRoomId(row.term_id, row.course_code);
    const entry = byCourse.get(key) ?? {
      termId: row.term_id,
      courseCode: row.course_code,
      ids: [],
    };
    entry.ids.push(row.message_id);
    byCourse.set(key, entry);
  }
  const out = new Map<string, Map<string, Found> | null>();
  await Promise.all(
    [...byCourse].map(async ([key, { termId, courseCode, ids }]) => {
      if (!chat) {
        out.set(key, null);
        return;
      }
      try {
        const stub = chat.get(chat.idFromName(key));
        const [reader] = await stub.digestMessages({
          termId,
          courseCode,
          readers: [{ userId, ids }],
        });
        out.set(key, new Map((reader?.messages ?? []).map((m) => [m.id, m])));
      } catch (error) {
        console.warn({ inbox: "course lookup failed", error: String(error) });
        out.set(key, null);
      }
    }),
  );
  return out;
}

/** A chat row's event and link, or null when its message is gone for this reader. */
function chatItem(
  row: InboxItemRow,
  course: Map<string, Found> | null | undefined,
): { event: InboxEvent; url: string } | null {
  const termId = TermIdSchema.safeParse(row.term_id);
  const courseCode = CourseCodeSchema.safeParse(row.course_code);
  const roomId = RoomIdSchema.safeParse(row.room_id);
  if (!termId.success || !courseCode.success || !roomId.success) return null;
  if (row.type !== "chat-mention" && row.type !== "chat-reply") return null;
  const found = row.message_id ? course?.get(row.message_id) : undefined;
  // The object answered and doesn't show it: deleted, held, or out of reach.
  if (course && !found) return null;
  return {
    event: {
      type: row.type,
      actor: row.actor_name,
      place: found?.place ?? chatPlaceWords(roomId.data, null),
      text: found?.text ?? null,
    },
    url: chatMessageHref({
      termId: termId.data,
      courseCode: courseCode.data,
      roomId: roomId.data,
      thread: row.thread_id ?? found?.threadRoot ?? null,
    }),
  };
}

/** The page's items, worded for their groups ("3 mentions in CMSC351"). */
export async function inboxItems(
  chat: CourseChatNamespace | undefined,
  userId: string,
  rows: readonly InboxItemRow[],
): Promise<InboxItem[]> {
  const words = await chatWords(chat, userId, rows);
  return rows.flatMap((row): InboxItem[] => {
    let shown: { event: InboxEvent; url: string } | null;
    if (row.product === "chat") {
      const key =
        row.term_id && row.course_code
          ? courseRoomId(row.term_id, row.course_code)
          : "";
      shown = chatItem(row, words.get(key));
    } else if (
      row.type !== "chat-mention" &&
      row.type !== "chat-reply" &&
      row.title !== null &&
      row.url !== null
    ) {
      shown = {
        event: { type: row.type, title: row.title, body: row.body ?? "" },
        url: row.url,
      };
    } else shown = null;
    if (!shown) return [];
    return [
      {
        id: row.id,
        type: row.type,
        product: row.product,
        ...groupWords(shown.event, { count: row.n, labels: row.labels }),
        url: shown.url,
        count: row.n,
        createdAt: row.created_at,
        readAt: row.read_at,
      },
    ];
  });
}
