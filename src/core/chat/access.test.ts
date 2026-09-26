import { describe, expect, it } from "vitest";
import { aCourse, aSection } from "~/fixtures";
import { courseRoomId, professorRoomId, sectionRoomId } from "../schema";
import {
  canReadRoom,
  isListedRoom,
  roomMemberCount,
  roomSectionCodes,
} from "./access";
import { roomsForCourse } from "./rooms";

const TERM = "202608";
// Two professors: Brandt teaches 0101 and 0102, Moss 0201.
const course = aCourse({
  code: "CMSC351",
  sections: [
    aSection({ code: "0101", instructors: ["Ada Brandt"] }),
    aSection({ code: "0102", instructors: ["Ada Brandt"] }),
    aSection({ code: "0201", instructors: ["Lee Moss"] }),
  ],
});
const tree = roomsForCourse(TERM, course);
const courseRoom = courseRoomId(TERM, "CMSC351");
const brandt = professorRoomId(TERM, "CMSC351", ["Ada Brandt"]);
const moss = professorRoomId(TERM, "CMSC351", ["Lee Moss"]);
const s0101 = sectionRoomId(TERM, "CMSC351", "0101");
const s0201 = sectionRoomId(TERM, "CMSC351", "0201");

describe("canReadRoom", () => {
  it("opens the course room to everyone signed in", () => {
    expect(canReadRoom(tree, courseRoom, [])).toBe(true);
  });

  it("opens professor and section rooms to people with one of their sections", () => {
    expect(canReadRoom(tree, brandt, ["0102"])).toBe(true);
    expect(canReadRoom(tree, s0101, ["0102"])).toBe(false);
    expect(canReadRoom(tree, s0101, ["0101"])).toBe(true);
    expect(canReadRoom(tree, moss, ["0101", "0102"])).toBe(false);
    expect(canReadRoom(tree, s0201, [])).toBe(false);
  });

  it("refuses another course's or term's rooms", () => {
    expect(canReadRoom(tree, courseRoomId(TERM, "CMSC131"), [])).toBe(false);
    expect(canReadRoom(tree, courseRoomId("202701", "CMSC351"), [])).toBe(
      false,
    );
    expect(canReadRoom(tree, "not a room", [])).toBe(false);
  });

  it("keeps rooms the catalog dropped readable for the people who had them", () => {
    const cancelled = sectionRoomId(TERM, "CMSC351", "0999");
    expect(isListedRoom(tree, cancelled)).toBe(false);
    expect(canReadRoom(tree, cancelled, ["0999"])).toBe(true);
    expect(canReadRoom(tree, cancelled, ["0101"])).toBe(false);
    const gone = professorRoomId(TERM, "CMSC351", ["Former Professor"]);
    expect(canReadRoom(tree, gone, ["0101"])).toBe(true);
    expect(canReadRoom(tree, gone, [])).toBe(false);
    expect(isListedRoom(tree, s0101)).toBe(true);
  });
});

describe("roomMemberCount", () => {
  const counts = new Map([
    ["0101", 3],
    ["0102", 2],
    ["0201", 4],
    ["", 5],
  ]);

  it("counts the course, a professor's sections, or one section", () => {
    expect(roomMemberCount(tree, courseRoom, counts)).toBe(14);
    expect(roomMemberCount(tree, brandt, counts)).toBe(5);
    expect(roomMemberCount(tree, s0201, counts)).toBe(4);
    expect(
      roomMemberCount(tree, sectionRoomId(TERM, "CMSC351", "0999"), counts),
    ).toBe(0);
  });
});

describe("roomSectionCodes", () => {
  it("is what a room's D1 row stores", () => {
    expect(roomSectionCodes(tree, courseRoom)).toEqual([]);
    expect(roomSectionCodes(tree, brandt)).toEqual(["0101", "0102"]);
    expect(roomSectionCodes(tree, s0201)).toEqual(["0201"]);
    expect(
      roomSectionCodes(tree, sectionRoomId(TERM, "CMSC351", "0999")),
    ).toEqual(["0999"]);
    expect(
      roomSectionCodes(tree, professorRoomId(TERM, "CMSC351", ["Gone Person"])),
    ).toEqual([]);
  });
});
