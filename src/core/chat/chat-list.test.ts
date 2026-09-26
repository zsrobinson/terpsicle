import { describe, expect, it } from "vitest";
import {
  aCourse,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  aSection,
  FIXTURE_NOW,
  fixtureTermId,
} from "~/fixtures";
import {
  type ChatUnreadRoom,
  type Course,
  courseRoomId,
  professorRoomId,
  sectionRoomId,
} from "../schema";
import { chatList, chatListCourseCodes, chatListUnread } from "./chat-list";

const cmsc351 = aCourse({
  code: "CMSC351",
  sections: [
    aSection({ code: "0101", instructors: ["Ada Brandt"] }),
    aSection({ code: "0201", instructors: ["Lee Moss"] }),
  ],
});
const musc130 = aCourse({ code: "MUSC130", sections: [aSection()] });
const engl101 = aCourse({ code: "ENGL101", sections: [aSection()] });
const courses = new Map<string, Course>([
  ["CMSC351", cmsc351],
  ["MUSC130", musc130],
  ["ENGL101", engl101],
]);

const plan = aPlan({
  courses: [
    aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" }),
    aSavedCourse("MUSC130"),
  ],
});

const unreadRow = (
  room: string,
  unread: number,
  muted = false,
): ChatUnreadRoom => ({
  room,
  courseCode: room.split(":")[1] ?? "",
  lastSeq: unread + 1,
  unread,
  lastMessageAt: FIXTURE_NOW,
  muted,
});

describe("chatList", () => {
  it("lists your plan's rooms widest first, then courses you follow", () => {
    const list = chatList({
      termId: fixtureTermId,
      chatPlan: plan,
      follows: ["ENGL101"],
      unread: [],
      courses,
    });
    expect(list.map((c) => [c.courseCode, c.reason])).toEqual([
      ["CMSC351", "plan"],
      ["MUSC130", "saved"],
      ["ENGL101", "following"],
    ]);
    expect(list[0]?.rooms.map((r) => r.room.id)).toEqual([
      courseRoomId(fixtureTermId, "CMSC351"),
      professorRoomId(fixtureTermId, "CMSC351", ["Ada Brandt"]),
      sectionRoomId(fixtureTermId, "CMSC351", "0101"),
    ]);
    expect(list[1]?.rooms.map((r) => r.room.id)).toEqual([
      courseRoomId(fixtureTermId, "MUSC130"),
    ]);
  });

  it("counts unread messages, leaving muted rooms out of the total", () => {
    const list = chatList({
      termId: fixtureTermId,
      chatPlan: plan,
      follows: [],
      unread: [
        unreadRow(courseRoomId(fixtureTermId, "CMSC351"), 4, true),
        unreadRow(sectionRoomId(fixtureTermId, "CMSC351", "0101"), 2),
        // Followed on another device: it has messages, so it's listed.
        unreadRow(courseRoomId(fixtureTermId, "ENGL101"), 1),
      ],
      courses,
    });
    expect(list[0]?.rooms.map((r) => [r.unread, r.muted])).toEqual([
      [4, true],
      [0, false],
      [2, false],
    ]);
    expect(list[0]?.unread).toBe(2);
    expect(list.map((c) => c.courseCode)).toEqual([
      "CMSC351",
      "MUSC130",
      "ENGL101",
    ]);
    expect(chatListUnread(list)).toBe(3);
  });

  it("keeps a course whose department hasn't loaded, with no rooms yet", () => {
    const [only] = chatList({
      termId: fixtureTermId,
      chatPlan: null,
      follows: ["HIST200"],
      unread: [],
      courses,
    });
    expect(only).toMatchObject({
      courseCode: "HIST200",
      course: null,
      rooms: [],
    });
  });

  it("ignores a chat plan from another term", () => {
    expect(
      chatList({
        termId: "202608",
        chatPlan: plan,
        follows: [],
        unread: [],
        courses,
      }),
    ).toEqual([]);
  });

  it("names every course the list needs", () => {
    expect(
      chatListCourseCodes({
        termId: fixtureTermId,
        chatPlan: plan,
        follows: ["ENGL101", "CMSC351"],
        unread: [unreadRow(courseRoomId(fixtureTermId, "HIST200"), 1)],
      }),
    ).toEqual(["CMSC351", "MUSC130", "ENGL101", "HIST200"]);
  });
});
