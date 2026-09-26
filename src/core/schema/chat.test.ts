import { describe, expect, it } from "vitest";
import { aChatAuthor, aChatMessage } from "~/fixtures";
import {
  CHAT_PAGE_MAX,
  CHAT_TEXT_MAX,
  ChatClientFrameSchema,
  ChatMessageSchema,
  ChatServerFrameSchema,
  courseChatName,
  courseRoomId,
  DirectoryIdSchema,
  lectureRoomId,
  parseRoomId,
  RoomIdSchema,
  sectionRoomId,
} from "./index";

describe("room ids", () => {
  it("build, validate and parse back", () => {
    const course = courseRoomId("202608", "CMSC131");
    const lecture = lectureRoomId("202608", "CMSC131", "0301");
    const section = sectionRoomId("202608", "CMSC131", "0303");
    expect([course, lecture, section]).toEqual([
      "202608:CMSC131",
      "202608:CMSC131:L:0301",
      "202608:CMSC131:0303",
    ]);
    expect(parseRoomId(course)).toEqual({
      termId: "202608",
      courseCode: "CMSC131",
      kind: "course",
      sectionCode: null,
    });
    expect(parseRoomId(lecture)).toMatchObject({
      kind: "lecture",
      sectionCode: "0301",
    });
    expect(parseRoomId(section)).toMatchObject({
      kind: "section",
      sectionCode: "0303",
    });
    expect(parseRoomId("202608:CMSC131:FC01")?.sectionCode).toBe("FC01");
  });

  it("reject anything else", () => {
    for (const bad of [
      "",
      "202609:CMSC131",
      "202608:cmsc131",
      "202608-CMSC131",
      "202608:CMSC131:",
      "202608:CMSC131:L:",
      "202608:CMSC131:X:0101",
      "202608:CMSC131:0101:0102",
      "202608:CMSC131:L:0101:x",
    ]) {
      expect(RoomIdSchema.safeParse(bad).success, bad).toBe(false);
      expect(parseRoomId(bad), bad).toBeNull();
    }
  });

  it("map every room to its course's object", () => {
    expect(courseChatName("202608:CMSC131:L:0301")).toBe("202608:CMSC131");
    expect(courseChatName("202608:CMSC131:0303")).toBe("202608:CMSC131");
    expect(courseChatName("202608:CMSC131")).toBe("202608:CMSC131");
  });
});

describe("DirectoryIdSchema", () => {
  // V2.md §4.2: the local part matches ^[a-z0-9]{2,16}$.
  it("takes a lowercase email local part of 2–16 letters and digits", () => {
    for (const ok of ["zsrobins", "jdoe12", "ab", "a234567890123456"])
      expect(DirectoryIdSchema.safeParse(ok).success, ok).toBe(true);
    for (const bad of [
      "ZSROBINS",
      "z s",
      "a@b",
      ".dot",
      "dash-",
      "first.last",
      "a",
      "a2345678901234567",
      "",
    ])
      expect(DirectoryIdSchema.safeParse(bad).success, bad).toBe(false);
  });
});

describe("ChatMessageSchema", () => {
  it("accepts held replies with reactions and an edit", () => {
    const reply = aChatMessage({
      id: "msg_fixture_02",
      replyTo: "msg_fixture_01",
      editedAt: "2026-09-25T12:05:00.000Z",
      reactions: { thumbs: ["zsrobins", "noorh"], eyes: ["jdoe12"] },
      moderation: { state: "held", reason: "graded-work" },
    });
    expect(ChatMessageSchema.parse(reply)).toEqual(reply);
  });

  it("trims text, and refuses empty, too long, or unknown moderation", () => {
    expect(ChatMessageSchema.parse(aChatMessage({ text: "  hi  " })).text).toBe(
      "hi",
    );
    for (const bad of [
      aChatMessage({ text: "   " }),
      aChatMessage({ text: "x".repeat(CHAT_TEXT_MAX + 1) }),
      { ...aChatMessage(), moderation: { state: "held" } },
      { ...aChatMessage(), moderation: { state: "pending" } },
      { ...aChatMessage(), reactions: { heart: ["noorh"] } },
      { ...aChatMessage(), reactions: { thumbs: [] } },
      aChatMessage({
        author: aChatAuthor({ picture: "http://example.com/a" }),
      }),
    ])
      expect(ChatMessageSchema.safeParse(bad).success).toBe(false);
  });
});

describe("the WebSocket protocol", () => {
  const room = "202608:CMSC131:0303";

  it("parses every client frame", () => {
    const frames = [
      { type: "hello", protocol: 1, rooms: [room, "202608:CMSC131"] },
      {
        type: "history",
        req: "r1",
        room,
        thread: null,
        before: null,
        limit: 50,
      },
      {
        type: "send",
        req: "r2",
        room,
        text: "anyone at office hours?",
        replyTo: null,
      },
      { type: "edit", req: "r3", room, id: "msg_fixture_01", text: "fixed" },
      { type: "delete", req: "r4", room, id: "msg_fixture_01" },
      {
        type: "react",
        req: "r5",
        room,
        id: "msg_fixture_01",
        reaction: "check",
        on: true,
      },
      { type: "typing", room },
      { type: "read", room, upTo: "msg_fixture_01" },
    ];
    for (const frame of frames)
      expect(ChatClientFrameSchema.parse(frame)).toEqual(frame);
  });

  it("is strict about what clients send", () => {
    for (const bad of [
      { type: "typing", room, extra: true },
      { type: "send", req: "r2", room, text: "", replyTo: null },
      {
        type: "history",
        req: "r1",
        room,
        thread: null,
        before: null,
        limit: CHAT_PAGE_MAX + 1,
      },
      { type: "hello", protocol: 1, rooms: [] },
      {
        type: "react",
        req: "r5",
        room,
        id: "msg_fixture_01",
        reaction: "heart",
        on: true,
      },
      { type: "send", req: "has space", room, text: "hi", replyTo: null },
      { type: "moderation", room, id: "msg_fixture_01" },
    ])
      expect(ChatClientFrameSchema.safeParse(bad).success).toBe(false);
  });

  it("parses every server frame, and tolerates fields a newer server adds", () => {
    const message = aChatMessage();
    const frames = [
      {
        type: "welcome",
        protocol: 1,
        you: aChatAuthor(),
        rooms: [{ room, members: 14, unread: 4, writable: true }],
      },
      {
        type: "page",
        req: "r1",
        room,
        thread: null,
        messages: [message],
        more: false,
      },
      {
        type: "ack",
        req: "r2",
        message: aChatMessage({
          moderation: { state: "held", reason: "checking" },
        }),
      },
      { type: "ack", req: "r4", message: null },
      { type: "error", req: "r2", code: "slow-down", retryAfter: 30 },
      { type: "error", req: null, code: "bad-frame", retryAfter: null },
      { type: "message", message },
      { type: "deleted", room, id: message.id },
      {
        type: "reactions",
        room,
        id: message.id,
        reactions: { check: ["noorh"] },
      },
      {
        type: "moderation",
        room,
        id: message.id,
        moderation: { state: "removed" },
      },
      {
        type: "typing",
        room,
        who: { directoryId: "noorh", name: "Noor Haddad" },
      },
    ];
    for (const frame of frames)
      expect(ChatServerFrameSchema.parse(frame)).toEqual(frame);
    expect(
      ChatServerFrameSchema.parse({
        type: "deleted",
        room,
        id: message.id,
        by: "x",
      }),
    ).toEqual({ type: "deleted", room, id: message.id });
  });
});
