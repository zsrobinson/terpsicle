import { describe, expect, it } from "vitest";
import { aCourse, aSection } from "~/fixtures";
import { courseRoomId, professorRoomId, sectionRoomId } from "../schema";
import {
  chatPath,
  parseChatPath,
  roomIdFromSlug,
  roomLocation,
  roomNameFromId,
  roomPath,
  roomSlug,
} from "./room-paths";
import { roomsForCourse } from "./rooms";

const TERM = "202701";

const course = aCourse({
  code: "CMSC351",
  sections: [
    aSection({ code: "0101", instructors: ["Ada Nelson"] }),
    aSection({ code: "0102", instructors: ["Ada Nelson"] }),
    aSection({ code: "0201", instructors: ["Pedram Sadeghian"] }),
  ],
});

describe("room names", () => {
  it("names each room under its course: Everyone, a professor's Sections, a Section", () => {
    const tree = roomsForCourse(TERM, course);
    expect(tree.rooms.map((r) => r.name)).toEqual([
      "Everyone",
      "Nelson's Sections",
      "Section 0101",
      "Section 0102",
      "Sadeghian's Sections",
      "Section 0201",
    ]);
    expect(tree.course.label).toBe("CMSC351 · Everyone");
  });

  it("names a room from its id alone, as the catalog would", () => {
    const tree = roomsForCourse(TERM, course);
    for (const room of tree.rooms)
      expect(roomNameFromId(room.id)).toBe(room.name);
    expect(
      roomNameFromId(
        professorRoomId(TERM, "CMSC351", ["Ada Brandt", "Lee Moss"]),
      ),
    ).toBe("Brandt and Moss's Sections");
  });
});

describe("room paths", () => {
  it("round-trips every room: name, path, room", () => {
    const tree = roomsForCourse(TERM, course);
    for (const room of tree.rooms) {
      const path = roomPath(room.id);
      const at = parseChatPath(
        new URL(path, "https://x").pathname,
        new URLSearchParams(),
      );
      expect(at?.course).toBe("CMSC351");
      expect(roomIdFromSlug(TERM, "CMSC351", at?.room ?? "")).toBe(room.id);
    }
    expect(tree.rooms.map((r) => roomPath(r.id))).toEqual([
      "/chat/CMSC351/everyone",
      "/chat/CMSC351/ada-nelson",
      "/chat/CMSC351/0101",
      "/chat/CMSC351/0102",
      "/chat/CMSC351/pedram-sadeghian",
      "/chat/CMSC351/0201",
    ]);
  });

  it("carries a thread, and Schedule's join", () => {
    const room = sectionRoomId(TERM, "CMSC351", "0101");
    expect(roomPath(room, "msg-0000001")).toBe(
      "/chat/CMSC351/0101?thread=msg-0000001",
    );
    expect(chatPath({ course: "CMSC351", join: 1 })).toBe(
      "/chat/CMSC351/everyone?join=1",
    );
    expect(chatPath()).toBe("/chat");
    expect(roomLocation(room)).toEqual({ course: "CMSC351", room: "0101" });
  });

  it("keeps section codes and professors apart, and refuses what names no room", () => {
    expect(roomSlug(courseRoomId(TERM, "CMSC351"))).toBe("everyone");
    expect(roomIdFromSlug(TERM, "CMSC351", "FC01")).toBe(
      sectionRoomId(TERM, "CMSC351", "FC01"),
    );
    expect(roomIdFromSlug(TERM, "CMSC351", "ruth")).toBe(
      `${TERM}:CMSC351:P:ruth`,
    );
    expect(roomIdFromSlug(TERM, "CMSC351", "Not a room!")).toBeNull();
    expect(parseChatPath("/schedule", new URLSearchParams())).toBeNull();
  });

  it("reads an older link's search params, which redirect to the path", () => {
    const old = new URLSearchParams({
      term: TERM,
      course: "CMSC351",
      room: sectionRoomId(TERM, "CMSC351", "0101"),
      thread: "msg-0000001",
    });
    const at = parseChatPath("/chat", old);
    expect(at).toEqual({
      course: "CMSC351",
      room: "0101",
      term: TERM,
      thread: "msg-0000001",
    });
    expect(chatPath(at ?? {})).toBe(
      `/chat/CMSC351/0101?thread=msg-0000001&term=${TERM}`,
    );
    expect(parseChatPath("/chat", new URLSearchParams())).toEqual({});
  });
});
