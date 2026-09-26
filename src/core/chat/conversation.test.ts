import { describe, expect, it } from "vitest";
import { aChatAuthor, aChatMessage, fixtureTermId } from "~/fixtures";
import {
  type ChatMessage,
  type ChatServerFrame,
  courseRoomId,
  sectionRoomId,
} from "../schema";
import {
  type Conversation,
  conversationReducer,
  emptyConversation,
  listed,
  listState,
  localId,
  newestInRoom,
  TYPING_SHOWS_MS,
  typingIn,
} from "./conversation";
import { chatMessageRef } from "./messages";

const room = courseRoomId(fixtureTermId, "CMSC351");
const section = sectionRoomId(fixtureTermId, "CMSC351", "0101");
const me = aChatAuthor({ directoryId: "tstudent", name: "Test Student" });
const noor = aChatAuthor();
const NOW = Date.parse("2026-09-25T12:00:00.000Z");

const at = (minute: number) => new Date(NOW + minute * 60_000).toISOString();

const msg = (
  id: string,
  minute: number,
  overrides: Partial<ChatMessage> = {},
) => aChatMessage({ id, createdAt: at(minute), ...overrides });

function run(...actions: Parameters<typeof conversationReducer>[1][]) {
  return actions.reduce(conversationReducer, emptyConversation());
}

const frame = (f: ChatServerFrame) =>
  ({ type: "frame", frame: f, now: NOW }) as const;

const welcome = (unread = 0) =>
  frame({
    type: "welcome",
    protocol: 1,
    you: me,
    rooms: [
      { room, members: 42, unread, writable: true },
      { room: section, members: 9, unread: 0, writable: true },
    ],
  });

const page = (
  messages: ChatMessage[],
  more = false,
  older = false,
  thread: string | null = null,
) =>
  ({
    type: "page",
    older,
    frame: {
      type: "page",
      req: "r1",
      room,
      thread,
      messages,
      more,
    },
  }) as const;

const ids = (state: Conversation, thread: string | null = null) =>
  listed(state, room, thread).map((m) => m.id);

describe("conversationReducer", () => {
  it("keeps who you are and the rooms from welcome", () => {
    const state = run(welcome());
    expect(state.you).toEqual(me);
    expect(state.rooms[room]?.members).toBe(42);
  });

  it("merges pages oldest first, and remembers whether older ones remain", () => {
    let state = run(welcome(), page([msg("m3", 3), msg("m4", 4)], true));
    expect(ids(state)).toEqual(["m3", "m4"]);
    expect(listState(state, room)).toMatchObject({ loaded: true, more: true });
    state = conversationReducer(
      state,
      page([msg("m1", 1), msg("m2", 2)], false, true),
    );
    expect(ids(state)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(listState(state, room).more).toBe(false);
    // A catch-up after reconnecting adds what's new and keeps "more".
    state = conversationReducer(
      state,
      page([msg("m4", 4), msg("m5", 5)], true),
    );
    expect(ids(state)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    expect(listState(state, room).more).toBe(false);
    // More arrived than a page holds: the list starts over from the new page.
    state = conversationReducer(
      state,
      page([msg("m8", 8), msg("m9", 9)], true),
    );
    expect(ids(state)).toEqual(["m8", "m9"]);
    expect(listState(state, room).more).toBe(true);
  });

  it("marks the first unread message when the room first loads", () => {
    const state = run(
      welcome(2),
      page([msg("m1", 1), msg("m2", 2), msg("m3", 3)]),
    );
    expect(state.firstUnread[room]).toBe("m2");
    expect(run(welcome(0), page([msg("m1", 1)])).firstUnread[room]).toBe(
      undefined,
    );
  });

  it("lists replies in their thread, not the room", () => {
    const state = run(
      welcome(),
      page([msg("m1", 1)]),
      frame({ type: "message", message: msg("r1", 2, { replyTo: "m1" }) }),
    );
    expect(ids(state)).toEqual(["m1"]);
    expect(ids(state, "m1")).toEqual(["r1"]);
  });

  it("shows your send at once, then swaps in the server's copy", () => {
    let state = run(welcome(), page([msg("m1", 1)]), {
      type: "sending",
      req: "q1",
      room,
      text: "hi",
      replyTo: null,
      at: at(0),
    });
    // Still sending: last, even though its time is earlier.
    expect(ids(state)).toEqual(["m1", localId("q1")]);
    expect(listed(state, room)[1]).toMatchObject({
      author: me,
      local: { state: "sending" },
      moderation: { state: "held", reason: "checking" },
    });
    state = conversationReducer(state, {
      type: "sent",
      req: "q1",
      message: msg("m2", 2, { author: me, text: "hi" }),
    });
    expect(ids(state)).toEqual(["m1", "m2"]);
  });

  it("keeps a refused send, with why, until you drop it", () => {
    let state = run(welcome(), {
      type: "sending",
      req: "q1",
      room,
      text: "hi",
      replyTo: null,
      at: at(0),
    });
    state = conversationReducer(state, {
      type: "send-failed",
      req: "q1",
      code: "slow-down",
    });
    expect(listed(state, room)[0]?.local).toEqual({
      req: "q1",
      state: "failed",
      error: "slow-down",
    });
    state = conversationReducer(state, { type: "discard", req: "q1" });
    expect(ids(state)).toEqual([]);
  });

  it("drops a withdrawn message for classmates, but its author keeps it with a note", () => {
    const withdrawn = frame({
      type: "moderation",
      room,
      id: "m1",
      moderation: { state: "removed" },
    });
    expect(ids(run(welcome(), page([msg("m1", 1)]), withdrawn))).toEqual([]);
    const mine = run(
      welcome(),
      page([msg("m1", 1, { author: me })]),
      withdrawn,
    );
    expect(listed(mine, room)[0]?.moderation).toEqual({ state: "removed" });
  });

  it("brings a message back when it's visible again", () => {
    const state = run(
      welcome(),
      page([msg("m1", 1), msg("m2", 2)]),
      frame({
        type: "moderation",
        room,
        id: "m1",
        moderation: { state: "removed" },
      }),
      frame({ type: "message", message: msg("m1", 1, { text: "edited" }) }),
    );
    expect(listed(state, room).map((m) => m.text)).toEqual([
      "edited",
      "review and a worksheet. bring a laptop",
    ]);
  });

  it("applies reactions and deletes", () => {
    let state = run(
      welcome(),
      page([msg("m1", 1), msg("m2", 2)]),
      frame({
        type: "reactions",
        room,
        id: "m1",
        reactions: { thumbs: ["noorh"] },
      }),
    );
    expect(state.byId.m1?.reactions).toEqual({ thumbs: ["noorh"] });
    state = conversationReducer(
      state,
      frame({ type: "deleted", room, id: "m1" }),
    );
    expect(ids(state)).toEqual(["m2"]);
  });

  it("hides a message you deleted until the undo runs out", () => {
    let state = run(welcome(), page([msg("m1", 1)]), {
      type: "hide",
      id: "m1",
    });
    expect(ids(state)).toEqual([]);
    state = conversationReducer(state, { type: "unhide", id: "m1" });
    expect(ids(state)).toEqual(["m1"]);
    state = conversationReducer(state, { type: "hide", id: "m1" });
    state = conversationReducer(state, { type: "remove", id: "m1" });
    expect(state.hidden.size).toBe(0);
    expect(state.byId.m1).toBeUndefined();
  });

  it("shows typing for a few seconds, never your own", () => {
    const state = run(
      welcome(),
      frame({
        type: "typing",
        room,
        who: { directoryId: "noorh", name: noor.name },
      }),
      frame({
        type: "typing",
        room,
        who: { directoryId: "tstudent", name: me.name },
      }),
    );
    expect(typingIn(state, room, NOW).map((t) => t.name)).toEqual([noor.name]);
    expect(typingIn(state, room, NOW + TYPING_SHOWS_MS)).toEqual([]);
  });

  it("finds the newest message in a room, replies included", () => {
    const state = run(
      welcome(),
      page([msg("m1", 1)]),
      frame({ type: "message", message: msg("r1", 5, { replyTo: "m1" }) }),
      { type: "sending", req: "q1", room, text: "x", replyTo: null, at: at(9) },
    );
    expect(newestInRoom(state, room)?.id).toBe("r1");
    expect(newestInRoom(state, section)).toBeNull();
  });
});

describe("chatMessageRef", () => {
  it("is what moderation calls a message", () => {
    expect(chatMessageRef(section, "01ABCDEFGH")).toBe(
      `${fixtureTermId}:CMSC351:01ABCDEFGH`,
    );
    expect(chatMessageRef("nope", "01ABCDEFGH")).toBeNull();
  });
});
