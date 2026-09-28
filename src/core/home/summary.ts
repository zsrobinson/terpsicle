import type { GenEdProgress } from "../four-year/gen-ed";
import type {
  ChatUnreadRoom,
  CourseCode,
  Minutes,
  Plan,
  RoomId,
  SeatWatch,
  TermId,
} from "../schema";
import { type SeatsMap, seatCounts } from "../seats/seats";

// The small facts Home shows from each product (docs/V3.md §1.5), one
// line or a few rows each. Pure: the page reads the data and the clock.

/** "Good morning" until noon, "Good afternoon" until 5pm, then "Good evening". */
export function greeting(minutes: Minutes): string {
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/** One course's unread messages across your rooms in it. */
export type UnreadCourse = {
  readonly courseCode: CourseCode;
  readonly unread: number;
  /** The room to open: the one with the newest message. */
  readonly room: RoomId;
  readonly lastMessageAt: string;
};

/**
 * Your rooms with unread messages, a course at a time, newest message
 * first. Muted rooms don't count: muting says you'll look when you want to.
 */
export function unreadByCourse(
  rooms: readonly ChatUnreadRoom[],
): UnreadCourse[] {
  const byCourse = new Map<CourseCode, UnreadCourse>();
  for (const r of rooms) {
    if (r.muted || r.unread <= 0) continue;
    const had = byCourse.get(r.courseCode);
    const newer = !had || r.lastMessageAt > had.lastMessageAt;
    byCourse.set(r.courseCode, {
      courseCode: r.courseCode,
      unread: (had?.unread ?? 0) + r.unread,
      room: newer ? r.room : (had?.room ?? r.room),
      lastMessageAt: newer ? r.lastMessageAt : (had?.lastMessageAt ?? ""),
    });
  }
  return [...byCourse.values()].sort(
    (a, b) =>
      b.lastMessageAt.localeCompare(a.lastMessageAt) ||
      a.courseCode.localeCompare(b.courseCode),
  );
}

/** A watched section with seats open now. */
export type OpenWatch = {
  readonly termId: TermId;
  readonly courseCode: CourseCode;
  readonly sectionCode: string;
  readonly open: number;
};

/** Your seat watches in `termId` whose sections have a seat open in `seats`. */
export function openWatches(
  watches: readonly SeatWatch[],
  termId: TermId,
  seats: SeatsMap | null,
): OpenWatch[] {
  const out: OpenWatch[] = [];
  for (const w of watches) {
    if (w.termId !== termId) continue;
    const open = seatCounts(seats, w.sectionKey)?.open ?? 0;
    if (open <= 0) continue;
    const at = w.sectionKey.indexOf("-");
    out.push({
      termId,
      courseCode: w.sectionKey.slice(0, at),
      sectionCode: w.sectionKey.slice(at + 1),
      open,
    });
  }
  return out.sort(
    (a, b) =>
      a.courseCode.localeCompare(b.courseCode) ||
      a.sectionCode.localeCompare(b.sectionCode),
  );
}

/** "1 seat open", "3 seats open". */
export function seatsOpenWords(open: number): string {
  return `${open} ${open === 1 ? "seat" : "seats"} open`;
}

/**
 * A plan in a few words: "4 courses · 15 credits · 2 registered", "1
 * course", or "No courses yet". The credits are the scheduler's
 * (`creditsLabel`), once the catalog says them; registered counts the
 * sections you ticked in Register.
 */
export function planLine(
  plan: Pick<Plan, "courses" | "registered">,
  credits: string | null = null,
): string {
  const n = plan.courses.length;
  if (n === 0) return "No courses yet";
  const parts = [`${n} ${n === 1 ? "course" : "courses"}`];
  if (credits) parts.push(credits);
  const registered = plan.registered?.length ?? 0;
  if (registered > 0) parts.push(`${registered} registered`);
  return parts.join(" · ");
}

/** GenEd categories met, counting planned courses: "5 of 11". */
export function genEdsCovered(progress: readonly GenEdProgress[]): {
  covered: number;
  of: number;
} {
  return {
    covered: progress.filter((p) => p.short === 0).length,
    of: progress.length,
  };
}
