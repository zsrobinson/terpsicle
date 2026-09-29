import {
  type ChatMessageId,
  ChatMessageIdSchema,
  type CourseCode,
  CourseCodeSchema,
  courseRoomId,
  parseRoomId,
  type RoomId,
  RoomIdSchema,
  type SectionCode,
  sectionRoomId,
  type TermId,
} from "../schema";

// Every room's name and path, in one place (the owner, 2026-09-29: "make
// sure that we clean up all the paths that name the rooms"). A room is
// "Everyone", "Nelson's Sections" or "Section 0101", under its course's
// code; its link is `/chat/<COURSE>/<room>`: `/chat/CMSC351/everyone`,
// `/chat/CMSC351/0101`, `/chat/CMSC351/pedram-sadeghian`. Links name no
// term: Chat is only ever on Chat's term (`chatTerm`), so a path and that
// term make the room id. Everything that names a room or links to one
// (the list, the room, Schedule, Home, Todo, notifications, pushes, the
// digest, the inbox, admin) goes through here.

/** The course room's name, and its path segment. */
export const EVERYONE_NAME = "Everyone";
export const EVERYONE_SLUG = "everyone";

/** "Nelson's Sections", "Rendall and Moss's Sections". */
export function professorRoomName(who: string): string {
  return `${who}'s Sections`;
}

/** "Section 0101". */
export function sectionRoomName(sectionCode: SectionCode): string {
  return `Section ${sectionCode}`;
}

/** "Pedram Sadeghian" → "Sadeghian": the name a professor room goes by. */
export function instructorShortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

/** "" (TBA), "Rendall", "Rendall and Moss", "Rendall and 2 others". */
export function instructorsWords(instructors: readonly string[]): string {
  const [first, second, ...rest] = instructors.map(instructorShortName);
  if (first === undefined) return "";
  if (second === undefined) return first;
  if (rest.length === 0) return `${first} and ${second}`;
  return `${first} and ${rest.length + 1} others`;
}

/**
 * A room's name from its id alone, for when the catalog isn't at hand (a
 * notification about a room the catalog no longer lists): a professor's
 * comes from the slug, so "pedram-sadeghian" is "Sadeghian's Sections".
 * The catalog's names (`roomsForCourse`) keep accents the slug drops.
 */
export function roomNameFromId(roomId: RoomId): string {
  const parsed = parseRoomId(roomId);
  if (!parsed || parsed.kind === "course") return EVERYONE_NAME;
  if (parsed.kind === "section")
    return sectionRoomName(parsed.sectionCode ?? "");
  const names = (parsed.professor ?? "").split("_").map((slug) => {
    const last = slug.split("-").pop() ?? slug;
    return last.charAt(0).toUpperCase() + last.slice(1);
  });
  return professorRoomName(instructorsWords(names));
}

/** "CMSC351 · Section 0101": a room named outside its course's group. */
export function roomPlace(courseCode: CourseCode, name: string): string {
  return `${courseCode} · ${name}`;
}

// ---------- paths ----------

/** A room's last path segment: "everyone", "0101", "pedram-sadeghian". */
export function roomSlug(roomId: RoomId): string {
  const parsed = parseRoomId(roomId);
  if (!parsed || parsed.kind === "course") return EVERYONE_SLUG;
  if (parsed.kind === "section") return parsed.sectionCode ?? EVERYONE_SLUG;
  return parsed.professor ?? EVERYONE_SLUG;
}

/**
 * The room a path names in `termId`, or null for a segment that names
 * none. Section codes are upper case and professor slugs lower case, so
 * they never collide; "everyone" is the course room.
 */
export function roomIdFromSlug(
  termId: TermId,
  courseCode: CourseCode,
  slug: string,
): RoomId | null {
  if (slug === EVERYONE_SLUG) return courseRoomId(termId, courseCode);
  if (/^[A-Z0-9]{4}$/.test(slug))
    return sectionRoomId(termId, courseCode, slug);
  const id = `${termId}:${courseCode}:P:${slug}`;
  return RoomIdSchema.safeParse(id).success ? id : null;
}

/** Where a link points in Chat: the list, a course's room, a thread. */
export type ChatLocation = {
  readonly course?: CourseCode;
  /** The room's path segment (`roomSlug`); the course room when left out. */
  readonly room?: string;
  readonly thread?: ChatMessageId;
  /** From Schedule's "Join CMSC351 chat": join the course once signed in. */
  readonly join?: 1;
  /** Only on older links (`/chat?term=…`): a term that isn't Chat's opens the list. */
  readonly term?: TermId;
};

/** `/chat`, `/chat/CMSC351/everyone?join=1`, `/chat/CMSC351/0101?thread=…`. */
export function chatPath(at: ChatLocation = {}): string {
  if (!at.course) return "/chat";
  const params = new URLSearchParams();
  if (at.thread) params.set("thread", at.thread);
  if (at.join) params.set("join", "1");
  if (at.term) params.set("term", at.term);
  const query = params.toString();
  const path = `/chat/${at.course}/${encodeURIComponent(at.room ?? EVERYONE_SLUG)}`;
  return query ? `${path}?${query}` : path;
}

/** A room's location, and its thread's. */
export function roomLocation(
  roomId: RoomId,
  thread: ChatMessageId | null = null,
): ChatLocation {
  const parsed = parseRoomId(roomId);
  return {
    ...(parsed ? { course: parsed.courseCode } : {}),
    room: roomSlug(roomId),
    ...(thread ? { thread } : {}),
  };
}

/** A room's path: what notifications, pushes, the digest and the inbox open. */
export function roomPath(
  roomId: RoomId,
  thread: ChatMessageId | null = null,
): string {
  return chatPath(roomLocation(roomId, thread));
}

/**
 * A Chat link read back: `/chat/CMSC351/0101?thread=…`, or an older
 * `/chat?term=…&course=…&room=…&thread=…` (which redirects to the new
 * one). Null for anything that isn't Chat.
 */
export function parseChatPath(
  pathname: string,
  search: URLSearchParams,
): ChatLocation | null {
  const thread = ChatMessageIdSchema.safeParse(search.get("thread"));
  const extras = {
    ...(thread.success ? { thread: thread.data } : {}),
    ...(search.get("join") === "1" ? { join: 1 as const } : {}),
  };
  const parts = pathname.replace(/\/+$/, "").split("/").slice(1);
  if (parts[0] !== "chat") return null;
  if (parts.length === 1) {
    // The older links: search params, with the term in the room id.
    const room = parseRoomId(search.get("room") ?? "");
    const course = CourseCodeSchema.safeParse(
      search.get("course") ?? room?.courseCode,
    );
    const term = search.get("term") ?? room?.termId;
    if (!course.success) return {};
    return {
      course: course.data,
      ...(room ? { room: roomSlug(search.get("room") ?? "") } : {}),
      ...(term && /^\d{6}$/.test(term) ? { term } : {}),
      ...extras,
    };
  }
  const course = CourseCodeSchema.safeParse(parts[1]);
  if (!course.success || parts.length > 3) return null;
  const slug = parts[2] ? decodeURIComponent(parts[2]) : EVERYONE_SLUG;
  return { course: course.data, room: slug, ...extras };
}
