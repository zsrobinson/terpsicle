import type {
  ChatUnreadRoom,
  Course,
  CourseCode,
  Plan,
  RoomId,
  TermId,
} from "../schema";
import {
  type Room,
  type RoomTree,
  roomsForCourse,
  roomsForSection,
} from "./rooms";

// The chat list (V2.md §8.2, §8.6): your courses for a term, each with your
// rooms and their unread counts. Your rooms come from your main plan (a
// placed section's course, professor and section rooms; a saved course's
// course room) and from course rooms you follow. Counts come from
// chat/unread, which only lists rooms that have messages. Rooms that aren't
// yours (another section's, another professor's) are never listed: to see
// one, you'd add that section to a plan (the owner, 2026-09-28).

/**
 * Why a course is in your list. "viewing": a course you opened (from Find a
 * course, or a link) but haven't joined, kept at the end while it's open.
 */
export type ChatListReason = "plan" | "saved" | "following" | "viewing";

export type ChatListRoom = {
  readonly room: Room;
  readonly unread: number;
  readonly muted: boolean;
  /** When its latest message was sent; null before the first. */
  readonly lastMessageAt: string | null;
};

export type ChatListCourse = {
  readonly courseCode: CourseCode;
  /** Null while its department loads, or if the catalog dropped it. */
  readonly course: Course | null;
  readonly tree: RoomTree | null;
  readonly reason: ChatListReason;
  /** Yours, widest first: the course room, then your professor's, then your section's. */
  readonly rooms: readonly ChatListRoom[];
  /** Unread messages in rooms you haven't muted. */
  readonly unread: number;
};

export interface ChatListInput {
  termId: TermId;
  mainPlan: Plan | null;
  follows: readonly CourseCode[];
  unread: readonly ChatUnreadRoom[];
  courses: ReadonlyMap<CourseCode, Course>;
  /** The course whose room is open, listed last if it isn't yours. */
  viewing?: CourseCode | null;
  /**
   * Mutes set on this page, which win over `unread`'s: a room muted before
   * the next unread refresh lists it (or with no messages) shows its bell.
   */
  mutes?: Readonly<Record<RoomId, boolean>>;
}

/** Every course the list needs from the catalog. */
export function chatListCourseCodes(
  input: Omit<ChatListInput, "courses" | "viewing" | "mutes">,
): CourseCode[] {
  return [
    ...new Set([
      ...(input.mainPlan?.courses.map((c) => c.courseCode) ?? []),
      ...input.follows,
      ...input.unread.map((r) => r.courseCode),
    ]),
  ];
}

export function chatList(input: ChatListInput): ChatListCourse[] {
  const { termId, mainPlan, unread, courses } = input;
  const byRoom = new Map<RoomId, ChatUnreadRoom>(
    unread.map((r) => [r.room, r]),
  );
  const out: ChatListCourse[] = [];
  const seen = new Set<CourseCode>();

  const add = (
    courseCode: CourseCode,
    reason: ChatListReason,
    sectionCode: string | null,
  ) => {
    if (seen.has(courseCode)) return;
    seen.add(courseCode);
    const course = courses.get(courseCode) ?? null;
    const tree = course ? roomsForCourse(termId, course) : null;
    const rooms: Room[] = tree
      ? sectionCode
        ? roomsForSection(tree, sectionCode)
        : [tree.course]
      : [];
    const listed = rooms.map((room) => {
      const row = byRoom.get(room.id);
      return {
        room,
        unread: row?.unread ?? 0,
        muted: input.mutes?.[room.id] ?? row?.muted ?? false,
        lastMessageAt: row?.lastMessageAt ?? null,
      };
    });
    out.push({
      courseCode,
      course,
      tree,
      reason,
      rooms: listed,
      unread: listed.reduce((n, r) => n + (r.muted ? 0 : r.unread), 0),
    });
  };

  if (mainPlan?.termId === termId)
    for (const entry of mainPlan.courses)
      add(
        entry.courseCode,
        entry.sectionCode ? "plan" : "saved",
        entry.sectionCode,
      );
  // Follows, and course rooms followed from another device (they have messages).
  const followed = [
    ...input.follows,
    ...unread.map((r) => r.courseCode),
  ].sort();
  for (const code of followed) add(code, "following", null);
  if (input.viewing) add(input.viewing, "viewing", null);
  return out;
}

/** Everyone's unread total for the list's heading and the tab title. */
export function chatListUnread(list: readonly ChatListCourse[]): number {
  return list.reduce((n, c) => n + c.unread, 0);
}
