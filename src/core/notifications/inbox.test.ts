import { describe, expect, it } from "vitest";
import {
  chatMentionTag,
  chatReplyTag,
  type GroupedEvent,
  groupWords,
  INBOX_PRODUCT,
  inboxCursor,
  listWords,
  readInboxCursor,
  seatTag,
  shouldRenotify,
  todoDueTag,
} from ".";

const one = { count: 1, labels: [] };

describe("tags", () => {
  it("gives each group one tag, at most 64 characters", () => {
    expect(chatMentionTag("202701:CMSC351")).toBe(
      "chat-mention:202701:CMSC351",
    );
    expect(chatReplyTag("01JABC")).toBe("chat-reply:01JABC");
    expect(seatTag("202701")).toBe("seat:202701");
    expect(todoDueTag("2026-09-29")).toBe("todo-due:2026-09-29");
    expect(
      chatMentionTag(`202701:CMSC351:prof-${"x".repeat(80)}`),
    ).toHaveLength(64);
  });

  it("puts each type under its product", () => {
    expect(INBOX_PRODUCT).toEqual({
      "seat-open": "schedule",
      "chat-mention": "chat",
      "chat-reply": "chat",
      "todo-due": "todo",
      "admin-urgent": "admin",
    });
  });
});

describe("groupWords", () => {
  const mention = {
    type: "chat-mention" as const,
    actor: "Maya",
    place: "CMSC351",
    text: "are we meeting at McKeldin at 7?  I booked 2nd floor",
  };

  it("names the sender in the title, never the app (V2 §6.7)", () => {
    expect(groupWords(mention, one)).toEqual({
      title: "Maya in CMSC351",
      body: "are we meeting at McKeldin at 7? I booked 2nd floor",
    });
    expect(
      groupWords(
        {
          ...mention,
          type: "chat-reply",
          text: "I think it's the second proof",
        },
        one,
      ),
    ).toEqual({
      title: "Maya replied to your question",
      body: "I think it's the second proof",
    });
  });

  it("counts a group, and quotes the newest with who said it", () => {
    expect(groupWords(mention, { count: 3, labels: [] })).toEqual({
      title: "3 mentions in CMSC351",
      body: "Maya: are we meeting at McKeldin at 7? I booked 2nd floor",
    });
    expect(
      groupWords(
        {
          ...mention,
          type: "chat-reply",
          text: "I think it's the second proof",
        },
        { count: 2, labels: [] },
      ),
    ).toEqual({
      title: "2 replies to your question in CMSC351",
      body: "Maya: I think it's the second proof",
    });
  });

  it("says a classmate for an account that's gone, and nothing for text it can't read", () => {
    expect(groupWords({ ...mention, actor: null, text: null }, one)).toEqual({
      title: "A classmate in CMSC351",
      body: "",
    });
    expect(
      groupWords({ ...mention, text: null }, { count: 2, labels: [] }).body,
    ).toBe("");
  });

  it("cuts long messages and titles", () => {
    const words = groupWords(
      { ...mention, actor: "M".repeat(200), text: "word ".repeat(100) },
      one,
    );
    expect(words.title).toHaveLength(120);
    expect(words.body.length).toBeLessThanOrEqual(120);
    expect(words.body.endsWith("…")).toBe(true);
  });

  it("lists the sections a seats run opened", () => {
    const seat = {
      type: "seat-open" as const,
      title: "A seat opened in CMSC351 0101",
      body: "2 of 40 open. Register on Testudo before it's gone.",
    };
    expect(groupWords(seat, { count: 1, labels: ["CMSC351 0101"] })).toEqual({
      title: "A seat opened in CMSC351 0101",
      body: "2 of 40 open. Register on Testudo before it's gone.",
    });
    expect(
      groupWords(seat, {
        count: 3,
        labels: ["CMSC351 0101", "MATH240 0203", "ENGL101 0401"],
      }),
    ).toEqual({
      title: "Seats opened in 3 sections you're watching",
      body: "CMSC351 0101, MATH240 0203 and ENGL101 0401",
    });
    // The same section twice is still one section.
    expect(
      groupWords(seat, { count: 2, labels: ["CMSC351 0101", "CMSC351 0101"] })
        .title,
    ).toBe("A seat opened in CMSC351 0101");
  });

  it("keeps Due tomorrow's own words, which already count", () => {
    const due = {
      type: "todo-due" as const,
      title: "3 things due tomorrow",
      body: "Project 2 (CMSC216) 11:59pm, WebAssign 5 and 1 more",
    };
    expect(groupWords(due, { count: 3, labels: [] })).toEqual({
      title: due.title,
      body: due.body,
    });
  });
});

describe("listWords", () => {
  it("joins like a sentence, then says how many more", () => {
    expect(listWords([])).toBe("");
    expect(listWords(["A"])).toBe("A");
    expect(listWords(["A", "B"])).toBe("A and B");
    expect(listWords(["A", "B", "C"])).toBe("A, B and C");
    expect(listWords(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
  });
});

describe("shouldRenotify", () => {
  const at = (minutes: number): string =>
    new Date(Date.UTC(2026, 8, 27, 18, 0) + minutes * 60_000).toISOString();
  const ev = (
    minutes: number,
    actorId: string | null = null,
  ): GroupedEvent => ({
    actorId,
    createdAt: at(minutes),
  });

  it("buzzes for every seat and admin item, and never for Due tomorrow", () => {
    expect(shouldRenotify("seat-open", ev(5), [ev(0)])).toBe(true);
    expect(shouldRenotify("admin-urgent", ev(5), [ev(0)])).toBe(true);
    expect(shouldRenotify("todo-due", ev(5), [])).toBe(false);
  });

  it("buzzes for a mention from someone new, not the same person again", () => {
    expect(shouldRenotify("chat-mention", ev(1, "maya"), [])).toBe(true);
    expect(shouldRenotify("chat-mention", ev(2, "jon"), [ev(1, "maya")])).toBe(
      true,
    );
    expect(
      shouldRenotify("chat-mention", ev(3, "maya"), [
        ev(1, "maya"),
        ev(2, "jon"),
      ]),
    ).toBe(false);
  });

  it("buzzes for the first reply in an hour only", () => {
    expect(shouldRenotify("chat-reply", ev(0), [])).toBe(true);
    expect(shouldRenotify("chat-reply", ev(10), [ev(0)])).toBe(false);
    expect(shouldRenotify("chat-reply", ev(59), [ev(0), ev(10)])).toBe(false);
    expect(shouldRenotify("chat-reply", ev(60), [ev(0), ev(10)])).toBe(true);
    // Replies every 50 minutes: the first buzzed, the second didn't, so the
    // third, 100 minutes after the first, does.
    expect(shouldRenotify("chat-reply", ev(100), [ev(0), ev(50)])).toBe(true);
    expect(
      shouldRenotify("chat-reply", ev(150), [ev(0), ev(50), ev(100)]),
    ).toBe(false);
  });
});

describe("the inbox cursor", () => {
  it("reads back what it wrote, and nothing else", () => {
    const item = {
      createdAt: "2026-09-27T18:00:00.000Z",
      id: "tstudent:202701:CMSC351:01J",
    };
    expect(readInboxCursor(inboxCursor(item))).toEqual(item);
    expect(readInboxCursor("nonsense")).toBeNull();
    expect(readInboxCursor("not a date|x")).toBeNull();
    expect(readInboxCursor("2026-09-27T18:00:00.000Z|")).toBeNull();
  });
});
