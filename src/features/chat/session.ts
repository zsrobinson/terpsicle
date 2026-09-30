import { useEffect, useState, useSyncExternalStore } from "react";
import {
  type Conversation,
  type ConversationAction,
  conversationReducer,
  emptyConversation,
  listState,
  localId,
  newestInRoom,
} from "~/core/chat";
import type {
  ChatClientFrame,
  ChatErrorCode,
  ChatMessage,
  ChatMessageId,
  ChatServerFrame,
  CourseCode,
  Reaction,
  RoomId,
  TermId,
} from "~/core/schema";
import { ChatSocket, type SocketLike, type SocketStatus } from "./socket";

// A course's live conversation (V2.md §8.4): one socket for every room of
// the course, the reducer in ~/core/chat over what arrives, and the
// requests the app makes (send, edit, delete, react, history). Unanswered
// requests go again after a reconnect; a send's request id is its
// idempotency key, so a resend never makes a copy.

export type ChatResult =
  | { ok: true; message: ChatMessage | null }
  | {
      ok: false;
      code: ChatErrorCode;
      retryAfter: number | null;
      /** When the owner's stop ends, if that's why. */
      until?: string;
    };

type Requested = Extract<ChatClientFrame, { req: string }>;

interface Pending {
  frame: Requested;
  /** For history: whether it asked for older messages. */
  older: boolean;
  resolve: (result: ChatResult) => void;
}

export interface SessionSnapshot {
  conversation: Conversation;
  status: SocketStatus;
}

/** Messages per history page. */
export const PAGE_SIZE = 50;
/** At most one typing frame this often (the object drops extras anyway). */
const TYPING_EVERY_MS = 3_000;

/** A fresh request id: random, since a send's is its idempotency key. */
export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

/**
 * What a course's socket hears live, for the chat list (the owner,
 * 2026-09-29: previews "in realtime for chats besides the one that's
 * currently selected"): each room's counts at every welcome, and each
 * message as it arrives.
 */
export interface LiveListener {
  welcome(
    courseCode: CourseCode,
    rooms: readonly { room: RoomId; unread: number }[],
  ): void;
  /**
   * A message the room can see, as it arrived. `fresh`: just sent, rather
   * than an edit, a moderation change or a thread's count moving.
   */
  message(message: ChatMessage, fresh: boolean, you: string | null): void;
  /** Whether the socket is open: the list polls only for courses whose isn't. */
  status(courseCode: CourseCode, open: boolean): void;
}

export interface SessionOptions {
  termId: TermId;
  courseCode: CourseCode;
  rooms: readonly RoomId[];
  open?: (url: string) => SocketLike;
  /** Defaults to the page's origin. */
  origin?: string;
  now?: () => number;
  live?: LiveListener;
}

/**
 * Whether a `message` frame is a message just sent: one the session hasn't
 * seen, never edited, and either a reply or a top-level message with no
 * thread yet (a thread's first message comes again whenever its count moves).
 */
export function isFreshMessage(message: ChatMessage, known: boolean): boolean {
  return (
    !known &&
    message.editedAt === null &&
    !message.deleted &&
    (message.replyTo !== null || message.thread === null)
  );
}

/** The open sessions the list listens on, by course: "Mark read" reads through them. */
const liveSessions = new Map<CourseCode, CourseChatSession>();

/** The course's open session, if the list or its open room has one. */
export function liveSessionFor(
  courseCode: CourseCode,
): CourseChatSession | undefined {
  return liveSessions.get(courseCode);
}

export class CourseChatSession {
  readonly termId: TermId;
  readonly courseCode: CourseCode;
  #snapshot: SessionSnapshot = {
    conversation: emptyConversation(),
    status: "connecting",
  };
  readonly #listeners = new Set<() => void>();
  readonly #pending = new Map<string, Pending>();
  readonly #socket: ChatSocket;
  readonly #now: () => number;
  readonly #typedAt = new Map<RoomId, number>();
  readonly #readUpTo = new Map<RoomId, ChatMessageId>();
  /** Deletes waiting out their undo, sent at once if the session closes. */
  readonly #deletes = new Map<ChatMessageId, { room: RoomId }>();
  readonly #live: LiveListener | undefined;

  constructor(options: SessionOptions) {
    this.termId = options.termId;
    this.courseCode = options.courseCode;
    this.#now = options.now ?? Date.now;
    this.#live = options.live;
    if (options.live) liveSessions.set(options.courseCode, this);
    this.#socket = new ChatSocket({
      termId: options.termId,
      courseCode: options.courseCode,
      rooms: options.rooms,
      onFrame: (frame) => this.#frame(frame),
      onStatus: (status) => {
        this.#live?.status(options.courseCode, status === "open");
        this.#set({ ...this.#snapshot, status });
      },
      onWelcome: () => this.#welcomed(),
      ...(options.open ? { open: options.open } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.#snapshot;

  #set(next: SessionSnapshot) {
    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
  }

  #dispatch(action: ConversationAction) {
    this.#set({
      ...this.#snapshot,
      conversation: conversationReducer(this.#snapshot.conversation, action),
    });
  }

  #frame(frame: ChatServerFrame) {
    if (
      frame.type === "page" ||
      frame.type === "ack" ||
      frame.type === "error"
    ) {
      const pending = frame.req ? this.#pending.get(frame.req) : undefined;
      if (frame.req) this.#pending.delete(frame.req);
      if (frame.type === "page")
        this.#dispatch({
          type: "page",
          frame,
          older: pending?.older ?? false,
        });
      pending?.resolve(
        frame.type === "error"
          ? {
              ok: false,
              code: frame.code,
              retryAfter: frame.retryAfter,
              ...(frame.until ? { until: frame.until } : {}),
            }
          : { ok: true, message: frame.type === "ack" ? frame.message : null },
      );
      return;
    }
    if (this.#live) {
      const { conversation } = this.#snapshot;
      if (frame.type === "welcome")
        this.#live.welcome(
          this.courseCode,
          frame.rooms.map((r) => ({ room: r.room, unread: r.unread })),
        );
      else if (
        frame.type === "message" &&
        frame.message.moderation.state === "visible"
      )
        this.#live.message(
          frame.message,
          isFreshMessage(frame.message, frame.message.id in conversation.byId),
          conversation.you?.directoryId ?? null,
        );
    }
    this.#dispatch({ type: "frame", frame, now: this.#now() });
  }

  /** After every welcome: send what's unanswered again, and catch loaded lists up. */
  #welcomed() {
    for (const { frame } of this.#pending.values()) this.#socket.send(frame);
    const { lists } = this.#snapshot.conversation;
    for (const [key, list] of Object.entries(lists)) {
      if (!list.loaded) continue;
      const [room, thread] = key.split(">") as [RoomId, string | undefined];
      void this.#history(room, thread ?? null, false);
    }
  }

  #request(frame: Requested, older = false): Promise<ChatResult> {
    return new Promise((resolve) => {
      this.#pending.set(frame.req, { frame, older, resolve });
      this.#socket.send(frame);
    });
  }

  #history(room: RoomId, thread: ChatMessageId | null, older: boolean) {
    const list = listState(this.#snapshot.conversation, room, thread);
    const before = older
      ? (list.ids.find((id) => !id.startsWith("local-")) ?? null)
      : null;
    return this.#request(
      {
        type: "history",
        req: newRequestId(),
        room,
        thread,
        before,
        limit: PAGE_SIZE,
      },
      older,
    );
  }

  #loading = new Set<string>();

  /** Loads a room's latest messages (or a thread's), once. */
  load(room: RoomId, thread: ChatMessageId | null = null): void {
    const key = `${room}>${thread ?? ""}`;
    const list = listState(this.#snapshot.conversation, room, thread);
    if (list.loaded || this.#loading.has(key)) return;
    this.#loading.add(key);
    void this.#history(room, thread, false).finally(() =>
      this.#loading.delete(key),
    );
  }

  loadOlder(
    room: RoomId,
    thread: ChatMessageId | null = null,
  ): Promise<ChatResult> {
    return this.#history(room, thread, true);
  }

  async send(
    room: RoomId,
    text: string,
    replyTo: ChatMessageId | null = null,
  ): Promise<ChatResult> {
    const req = newRequestId();
    this.#dispatch({
      type: "sending",
      req,
      room,
      text,
      replyTo,
      at: new Date(this.#now()).toISOString(),
    });
    const result = await this.#request({
      type: "send",
      req,
      room,
      text,
      replyTo,
    });
    if (result.ok && result.message)
      this.#dispatch({ type: "sent", req, message: result.message });
    else if (!result.ok)
      this.#dispatch({
        type: "send-failed",
        req,
        code: result.code,
        ...(result.until ? { until: result.until } : {}),
      });
    return result;
  }

  /** A failed send, sent again (a new request: the old one was refused). */
  retry(
    req: string,
    room: RoomId,
    text: string,
    replyTo: ChatMessageId | null,
  ) {
    this.#dispatch({ type: "discard", req });
    return this.send(room, text, replyTo);
  }

  /**
   * Hides a refused send now. `send` drops it once the Undo toast is gone;
   * `undo` brings it back, with Try again and Discard, as it was.
   */
  discardLater(req: string): { undo: () => void; send: () => void } {
    const id = localId(req);
    this.#dispatch({ type: "hide", id });
    return {
      undo: () => this.#dispatch({ type: "unhide", id }),
      send: () => this.#dispatch({ type: "remove", id }),
    };
  }

  async edit(
    room: RoomId,
    id: ChatMessageId,
    text: string,
  ): Promise<ChatResult> {
    const result = await this.#request({
      type: "edit",
      req: newRequestId(),
      room,
      id,
      text,
    });
    if (result.ok && result.message)
      this.#dispatch({ type: "upsert", message: result.message });
    return result;
  }

  /**
   * Hides your message now. `send` deletes it, once the Undo toast is gone
   * (it waits while Undo has focus); `undo` brings it back. Closing the
   * session sends every delete still waiting.
   */
  deleteLater(
    room: RoomId,
    id: ChatMessageId,
  ): { undo: () => void; send: () => void } {
    this.#dispatch({ type: "hide", id });
    this.#deletes.set(id, { room });
    return {
      undo: () => {
        if (!this.#deletes.delete(id)) return;
        this.#dispatch({ type: "unhide", id });
      },
      send: () => void this.#deleteNow(id),
    };
  }

  async #deleteNow(id: ChatMessageId): Promise<void> {
    const waiting = this.#deletes.get(id);
    if (!waiting) return;
    this.#deletes.delete(id);
    const result = await this.#request({
      type: "delete",
      req: newRequestId(),
      room: waiting.room,
      id,
    });
    // A message the room saw comes back as its tombstone ("Message deleted
    // by author"); one only you saw is gone, as is one already gone.
    if (result.ok && result.message) {
      this.#dispatch({ type: "upsert", message: result.message });
      this.#dispatch({ type: "unhide", id });
    } else if (result.ok || result.code === "not-found")
      this.#dispatch({ type: "remove", id });
    else this.#dispatch({ type: "unhide", id });
  }

  async react(
    room: RoomId,
    id: ChatMessageId,
    reaction: Reaction,
    on: boolean,
  ): Promise<ChatResult> {
    const you = this.#snapshot.conversation.you;
    const message = this.#snapshot.conversation.byId[id];
    // Shown at once; the ack (or the next reactions frame) settles it.
    if (you && message) {
      const who = message.reactions[reaction] ?? [];
      const next = on
        ? [...new Set([...who, you.directoryId])]
        : who.filter((d) => d !== you.directoryId);
      const { [reaction]: _old, ...rest } = message.reactions;
      this.#dispatch({
        type: "upsert",
        message: {
          ...message,
          reactions: next.length > 0 ? { ...rest, [reaction]: next } : rest,
        },
      });
    }
    const result = await this.#request({
      type: "react",
      req: newRequestId(),
      room,
      id,
      reaction,
      on,
    });
    if (result.ok && result.message)
      this.#dispatch({ type: "upsert", message: result.message });
    else if (!result.ok && message) this.#dispatch({ type: "upsert", message });
    return result;
  }

  typing(room: RoomId): void {
    const now = this.#now();
    if (now - (this.#typedAt.get(room) ?? 0) < TYPING_EVERY_MS) return;
    this.#typedAt.set(room, now);
    this.#socket.send({ type: "typing", room });
  }

  /** Clears the room's unread count up to its newest message, once per message. */
  read(room: RoomId): void {
    const newest = newestInRoom(this.#snapshot.conversation, room);
    if (!newest || this.#readUpTo.get(room) === newest.id) return;
    if (this.#socket.send({ type: "read", room, upTo: newest.id }))
      this.#readUpTo.set(room, newest.id);
  }

  /** Reads a room up to a message this session may not have loaded (the list's "Mark read"). */
  readUpTo(room: RoomId, id: ChatMessageId): boolean {
    if (this.#readUpTo.get(room) === id) return true;
    if (!this.#socket.send({ type: "read", room, upTo: id })) return false;
    this.#readUpTo.set(room, id);
    return true;
  }

  setRooms(rooms: readonly RoomId[]): void {
    this.#socket.setRooms(rooms);
  }

  close(): void {
    // Deletes waiting out their undo leave now (a send is synchronous).
    for (const id of [...this.#deletes.keys()]) void this.#deleteNow(id);
    this.#socket.close();
    this.#live?.status(this.courseCode, false);
    if (liveSessions.get(this.courseCode) === this)
      liveSessions.delete(this.courseCode);
    for (const pending of this.#pending.values())
      pending.resolve({ ok: false, code: "bad-frame", retryAfter: null });
    this.#pending.clear();
    this.#listeners.clear();
  }
}

/**
 * The session for a course while the component using it is mounted. Rooms
 * can change without a reconnect (the socket says hello again).
 */
export function useCourseChat(
  termId: TermId,
  courseCode: CourseCode,
  rooms: readonly RoomId[],
  open?: (url: string) => SocketLike,
  live?: LiveListener,
): { session: CourseChatSession | null; snapshot: SessionSnapshot | null } {
  const [session, setSession] = useState<CourseChatSession | null>(null);
  const roomKey = rooms.join(" ");
  // biome-ignore lint/correctness/useExhaustiveDependencies: rooms apply through setRooms below
  useEffect(() => {
    const next = new CourseChatSession({
      termId,
      courseCode,
      rooms,
      ...(open ? { open } : {}),
      ...(live ? { live } : {}),
    });
    setSession(next);
    return () => next.close();
  }, [termId, courseCode, open]);
  useEffect(() => {
    if (roomKey) session?.setRooms(roomKey.split(" "));
  }, [session, roomKey]);
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? noSubscribe,
    session?.getSnapshot ?? noSnapshot,
    noSnapshot,
  );
  return { session, snapshot };
}

const noSubscribe = () => () => {};
const noSnapshot = (): SessionSnapshot | null => null;
