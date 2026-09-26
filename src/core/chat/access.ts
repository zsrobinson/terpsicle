import { parseRoomId, type RoomId, type SectionCode } from "../schema";
import type { RoomTree } from "./rooms";

// Who may read and post where, in a course's rooms (V2.md §8.2): the course
// room is open to anyone signed in; professor and section rooms need one of
// their sections in one of your plans. It's on trust: Terpsicle can't see
// registrations.

const intersects = (a: readonly string[], b: readonly string[]) =>
  a.some((x) => b.includes(x));

/**
 * Whether someone whose plans place `mySections` of this course may read
 * `roomId`. A room the catalog no longer lists (a cancelled section, a
 * professor who left the course) keeps its history for the people who had
 * it: a section room for plans that still have that section, a professor
 * room for anyone with a section of the course.
 */
export function canReadRoom(
  tree: RoomTree,
  roomId: RoomId,
  mySections: readonly SectionCode[],
): boolean {
  const parsed = parseRoomId(roomId);
  if (
    !parsed ||
    parsed.termId !== tree.termId ||
    parsed.courseCode !== tree.courseCode
  )
    return false;
  if (parsed.kind === "course") return true;
  const room = tree.byId.get(roomId);
  if (room) return intersects(room.sectionCodes, mySections);
  if (parsed.kind === "section")
    return (
      parsed.sectionCode !== null && mySections.includes(parsed.sectionCode)
    );
  return mySections.length > 0;
}

/** Whether a room can take new messages: it's one the catalog lists now. */
export function isListedRoom(tree: RoomTree, roomId: RoomId): boolean {
  return tree.byId.has(roomId);
}

/**
 * How many people have the room's sections in their chat plan, from counts
 * per section code ("" for courses saved for later): everyone in the course
 * for the course room, the sum over a professor's sections for theirs.
 */
export function roomMemberCount(
  tree: RoomTree,
  roomId: RoomId,
  bySection: ReadonlyMap<string, number>,
): number {
  const room = tree.byId.get(roomId);
  const parsed = parseRoomId(roomId);
  if (parsed?.kind === "course")
    return [...bySection.values()].reduce((a, b) => a + b, 0);
  const codes =
    room?.sectionCodes ??
    (parsed?.sectionCode ? [parsed.sectionCode] : ([] as string[]));
  return codes.reduce((sum, code) => sum + (bySection.get(code) ?? 0), 0);
}

/** The section codes stored with a room's D1 row, for the unread query. */
export function roomSectionCodes(
  tree: RoomTree,
  roomId: RoomId,
): SectionCode[] {
  const parsed = parseRoomId(roomId);
  if (!parsed || parsed.kind === "course") return [];
  const room = tree.byId.get(roomId);
  if (room) return [...room.sectionCodes];
  return parsed.sectionCode ? [parsed.sectionCode] : [];
}
