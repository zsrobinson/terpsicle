import { describe, expect, it } from "vitest";
import { aCourse, aSection } from "~/fixtures";
import { chatMentionTag } from "../notifications";
import { courseRoomId, professorRoomId, sectionRoomId } from "../schema";
import {
  chatDigestLine,
  chatDigestSubject,
  chatMessageHref,
  chatNotificationKey,
  chatPlaceWords,
  chatPreview,
  chatRecipients,
} from "./notify";
import { roomsForCourse } from "./rooms";

const none = new Set<string>();

describe("chatRecipients", () => {
  it("notifies the mentioned and the thread's author, never the author", () => {
    expect(
      chatRecipients({
        author: "me",
        mentioned: ["a", "b"],
        threadAuthor: "c",
        connected: none,
        muted: none,
      }),
    ).toEqual([
      { userId: "a", type: "chat-mention", push: true },
      { userId: "b", type: "chat-mention", push: true },
      { userId: "c", type: "chat-reply", push: true },
    ]);
    expect(
      chatRecipients({
        author: "me",
        mentioned: ["me"],
        threadAuthor: "me",
        connected: none,
        muted: none,
      }),
    ).toEqual([]);
  });

  it("sends one notification to someone both mentioned and replied to: the mention", () => {
    expect(
      chatRecipients({
        author: "me",
        mentioned: ["c"],
        threadAuthor: "c",
        connected: none,
        muted: none,
      }),
    ).toEqual([{ userId: "c", type: "chat-mention", push: true }]);
  });

  it("pushes nobody who's looking, and no replies in a muted room", () => {
    expect(
      chatRecipients({
        author: "me",
        mentioned: ["a", "m"],
        threadAuthor: "r",
        connected: new Set(["a"]),
        muted: new Set(["m", "r"]),
      }),
    ).toEqual([
      { userId: "a", type: "chat-mention", push: false },
      // Named, so a mention still pushes in a muted room.
      { userId: "m", type: "chat-mention", push: true },
      { userId: "r", type: "chat-reply", push: false },
    ]);
  });
});

describe("the words", () => {
  const TERM = "202701";
  const tree = roomsForCourse(
    TERM,
    aCourse({
      code: "CMSC131",
      sections: [
        aSection({ code: "0101", instructors: ["Pedram Sadeghian"] }),
        aSection({ code: "0201", instructors: ["Lee Moss"] }),
      ],
    }),
  );
  const professor = professorRoomId(TERM, "CMSC131", ["Pedram Sadeghian"]);

  it("names the place", () => {
    expect(chatPlaceWords(courseRoomId(TERM, "CMSC131"), null)).toBe("CMSC131");
    expect(chatPlaceWords(sectionRoomId(TERM, "CMSC131", "0303"), null)).toBe(
      "CMSC131 · 0303",
    );
    expect(chatPlaceWords(professor, tree.byId.get(professor) ?? null)).toBe(
      "CMSC131 · Sadeghian's sections",
    );
    expect(chatPlaceWords(professor, null)).toBe("CMSC131");
  });

  it("cuts a preview at a word", () => {
    expect(chatPreview("  short\n text ")).toBe("short text");
    const long = `${"word ".repeat(40)}end`;
    const preview = chatPreview(long);
    expect(preview.length).toBeLessThanOrEqual(120);
    expect(preview.endsWith("word…")).toBe(true);
    expect(chatPreview("x".repeat(200))).toBe(`${"x".repeat(119)}…`);
  });

  // The push's words and tags are ~/core/notifications' (groupWords, the
  // tags); where it opens is here.
  it("opens the room, or the thread for a reply", () => {
    const room = sectionRoomId(TERM, "CMSC131", "0303");
    expect(
      chatMessageHref({
        termId: TERM,
        courseCode: "CMSC131",
        roomId: room,
        thread: "01J0000000000000000000000A",
      }),
    ).toBe(
      `/chat?term=202701&course=CMSC131&room=${encodeURIComponent(room)}&thread=01J0000000000000000000000A`,
    );
    expect(
      chatMessageHref({
        termId: TERM,
        courseCode: "CMSC131",
        roomId: courseRoomId(TERM, "CMSC131"),
        thread: null,
      }),
    ).toBe("/chat?term=202701&course=CMSC131&room=202701%3ACMSC131");
  });

  it("groups a long professor room's mentions under a 64-character tag", () => {
    const long = professorRoomId(TERM, "CMSC131", [
      "Alexandra Konstantinopoulou-Whitfield",
      "Bartholomew Featherstonehaugh",
    ]);
    expect(chatMentionTag(long)).toHaveLength(64);
  });

  it("keys a notification by type, person and message", () => {
    expect(chatNotificationKey("chat-mention", "hlee", "01J")).toBe(
      "chat-mention:hlee:01J",
    );
  });

  it("words the digest", () => {
    expect(chatDigestSubject(3)).toBe("3 unread in your class chats");
    expect(
      chatDigestLine({
        type: "chat-reply",
        actor: "Hannah Lee",
        place: "CMSC131 · 0303",
        text: "see you there",
      }),
    ).toBe("Hannah Lee replied in CMSC131 · 0303: see you there");
  });
});
