import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listed } from "~/core/chat";
import {
  type ChatClientFrame,
  type ChatServerFrame,
  courseRoomId,
} from "~/core/schema";
import { aChatAuthor, aChatMessage, fixtureTermId } from "~/fixtures";
import { CourseChatSession } from "./session";
import type { SocketLike } from "./socket";

const room = courseRoomId(fixtureTermId, "CMSC351");
const me = aChatAuthor({ directoryId: "tstudent", name: "Test Student" });

type Listener = (event: { data?: unknown; code?: number }) => void;

/** A socket the test drives: it records what the app sends and plays the server. */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: ChatClientFrame[] = [];
  listeners: Record<string, Listener[]> = {};
  constructor(readonly url: string) {}
  send(data: string) {
    if (data !== "ping") this.sent.push(JSON.parse(data) as ChatClientFrame);
  }
  close() {
    this.readyState = 3;
  }
  addEventListener(type: string, listener: Listener) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }
  emit(type: string, event: { data?: unknown; code?: number } = {}) {
    for (const l of this.listeners[type] ?? []) l(event);
  }
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  serve(frame: ChatServerFrame) {
    this.emit("message", { data: JSON.stringify(frame) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.emit("close", { code });
  }
  last<T extends ChatClientFrame["type"]>(type: T) {
    return this.sent.filter((f) => f.type === type).at(-1) as
      | Extract<ChatClientFrame, { type: T }>
      | undefined;
  }
}

const welcome: ChatServerFrame = {
  type: "welcome",
  protocol: 1,
  you: me,
  rooms: [{ room, members: 3, unread: 0, writable: true }],
};

let sockets: FakeSocket[];
let session: CourseChatSession;

function start() {
  sockets = [];
  session = new CourseChatSession({
    termId: fixtureTermId,
    courseCode: "CMSC351",
    rooms: [room],
    origin: "https://terpsicle.com",
    open: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  });
  const socket = sockets[0] as FakeSocket;
  socket.open();
  socket.serve(welcome);
  return socket;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  session.close();
  vi.useRealTimers();
});

describe("CourseChatSession", () => {
  it("opens the course's socket and says hello with its rooms", () => {
    const socket = start();
    expect(socket.url).toBe(
      `wss://terpsicle.com/api/chat/socket?term=${fixtureTermId}&course=CMSC351`,
    );
    expect(socket.sent[0]).toEqual({
      type: "hello",
      protocol: 1,
      rooms: [room],
    });
    expect(session.getSnapshot().status).toBe("open");
    expect(session.getSnapshot().conversation.you).toEqual(me);
  });

  it("shows a send at once and swaps in the server's copy on its ack", async () => {
    const socket = start();
    const sent = session.send(room, "hi all");
    const frame = socket.last("send");
    expect(frame).toMatchObject({ room, text: "hi all", replyTo: null });
    expect(listed(session.getSnapshot().conversation, room)[0]).toMatchObject({
      text: "hi all",
      local: { state: "sending" },
    });
    socket.serve({
      type: "ack",
      req: frame?.req ?? "",
      message: aChatMessage({ id: "message01", author: me, text: "hi all" }),
    });
    expect(await sent).toMatchObject({ ok: true });
    expect(
      listed(session.getSnapshot().conversation, room).map((m) => m.id),
    ).toEqual(["message01"]);
  });

  it("sends unanswered requests again after a reconnect, with the same request id", async () => {
    const socket = start();
    const sent = session.send(room, "still there?");
    const req = socket.last("send")?.req;
    socket.drop();
    await vi.advanceTimersByTimeAsync(1_000);
    const next = sockets[1] as FakeSocket;
    next.open();
    next.serve(welcome);
    expect(next.last("send")?.req).toBe(req);
    next.serve({
      type: "error",
      req: req ?? "",
      code: "slow-down",
      retryAfter: 20,
    });
    expect(await sent).toEqual({
      ok: false,
      code: "slow-down",
      retryAfter: 20,
    });
    expect(
      listed(session.getSnapshot().conversation, room)[0]?.local,
    ).toMatchObject({
      state: "failed",
      error: "slow-down",
    });
  });

  it("stops reconnecting once the session ends", async () => {
    const socket = start();
    socket.drop(4003);
    expect(session.getSnapshot().status).toBe("signed-out");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
  });

  it("holds a delete until its undo runs out, and undo brings it back", async () => {
    const socket = start();
    socket.serve({
      type: "message",
      message: aChatMessage({ id: "message01", author: me }),
    });
    const undo = session.deleteLater(room, "message01", 10_000);
    expect(listed(session.getSnapshot().conversation, room)).toEqual([]);
    undo();
    expect(
      listed(session.getSnapshot().conversation, room).map((m) => m.id),
    ).toEqual(["message01"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.last("delete")).toBeUndefined();

    session.deleteLater(room, "message01", 10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    const del = socket.last("delete");
    expect(del).toMatchObject({ room, id: "message01" });
    socket.serve({ type: "ack", req: del?.req ?? "", message: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().conversation.byId.message01).toBeUndefined();
  });

  it("marks a room read up to its newest message, once", () => {
    const socket = start();
    socket.serve({
      type: "message",
      message: aChatMessage({ id: "message01" }),
    });
    session.read(room);
    session.read(room);
    expect(socket.sent.filter((f) => f.type === "read")).toEqual([
      { type: "read", room, upTo: "message01" },
    ]);
  });

  it("sends typing at most every few seconds", async () => {
    const socket = start();
    session.typing(room);
    session.typing(room);
    await vi.advanceTimersByTimeAsync(3_000);
    session.typing(room);
    expect(socket.sent.filter((f) => f.type === "typing")).toHaveLength(2);
  });
});
