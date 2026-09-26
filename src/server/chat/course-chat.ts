// CourseChat: one Durable Object per course per term (V2.md §8.4), named by
// the course room's id (`<termId>:<courseCode>`). It holds every room of the
// course in its own SQLite, speaks the WebSocket protocol in
// ~/core/schema/chat.ts over hibernatable sockets, screens every message
// with the shared moderation service, and deletes itself on schedule.
//
// It's reachable only through the Worker (src/server/chat/socket.ts), which
// checks the session and says who's asking in X-Terpsicle-* headers, and
// through moderation's handler (applyDecision).
import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import {
  CHAT_SEND_LIMITS,
  type ChatRetention,
  canReadRoom,
  chatMessageId,
  chatModeration,
  chatRetention,
  isListedRoom,
  roomMemberCount,
  roomSectionCodes,
} from "~/core/chat";
import {
  CHAT_PROTOCOL_VERSION,
  type ChatClientFrame,
  ChatClientFrameSchema,
  type ChatErrorCode,
  type ChatMessage,
  ChatRequestIdSchema,
  type ChatServerFrame,
  CourseCodeSchema,
  DirectoryIdSchema,
  type Moderation,
  type ModerationReason,
  parseRoomId,
  type RoomId,
  TermIdSchema,
} from "~/core/schema";
import { latestDecision, moderate } from "../moderation/service";
import { type ChatCourse, loadChatCourse, loadTermDates } from "./catalog";
import { chatTargetId } from "./moderation-handler";
import {
  type MessageRow,
  type MessageStatus,
  ObjectStore,
} from "./object-store";
import {
  type ChatProfile,
  deleteCourseRows,
  markRead,
  memberCounts,
  planSections,
  readMarkers,
  readProfiles,
  recordVisible,
} from "./store";

export type CourseChatNamespace = DurableObjectNamespace<CourseChat>;

/**
 * How the object screens messages. An object, not bare imports, so worker
 * tests can stand in for the models (the object runs in the test's isolate).
 */
export const chatScreening = { moderate, latestDecision };

/** The headers the Worker forwards a socket with; the object trusts them. */
export const CHAT_HEADERS = {
  user: "X-Terpsicle-User",
  term: "X-Terpsicle-Term",
  course: "X-Terpsicle-Course",
  /** CHAT_ENABLED: "on", or "read" (reading works, sending doesn't). */
  level: "X-Terpsicle-Chat",
} as const;

const ForwardedSchema = z.object({
  user: DirectoryIdSchema,
  term: TermIdSchema,
  course: CourseCodeSchema,
  level: z.enum(["on", "read"]),
});

/** Sections kept per socket, so the attachment stays under its 2 KB limit. */
const MAX_SECTIONS = 64;

/** What each socket remembers across hibernation (at most 2 KB). */
const AttachmentSchema = z.object({
  user: DirectoryIdSchema,
  term: TermIdSchema,
  course: CourseCodeSchema,
  /** CHAT_ENABLED was "on" when it connected. */
  canSend: z.boolean(),
  /** A `hello` arrived; nothing else is answered before one. */
  hello: z.boolean(),
  /** This course's sections in any of the person's plans, as of the last `hello`. */
  sections: z.array(z.string()).max(MAX_SECTIONS),
});
type Attachment = z.infer<typeof AttachmentSchema>;

/** Close codes the app acts on by reconnecting. */
export const CHAT_CLOSE = {
  /** The term's rooms turned read-only; a new `welcome` says so. */
  readOnly: 4001,
  /** The course's chat was deleted (retention). */
  deleted: 4002,
  /** The account is gone or signed out. */
  signedOut: 4003,
} as const;

/** A message still `checking` after this long is screened again by the alarm. */
export const RECHECK_MS = 2 * 60_000;
const CATALOG_TTL_MS = 60 * 60_000;
const PROFILE_TTL_MS = 10 * 60_000;
/** Typing frames per person per room, at most one this often. */
const TYPING_EVERY_MS = 2_000;
const MAX_FRAME_CHARS = 16_384;
/** While retention dates aren't known (no calendar yet), ask again this often. */
const RETENTION_RETRY_MS = 24 * 60 * 60_000;
const RECHECK_BATCH = 20;
const DAY_MS = 86_400_000;

function moderationOf(row: MessageRow): Moderation {
  switch (row.status) {
    case "visible":
      return { state: "visible" };
    case "checking":
      return { state: "held", reason: "checking" };
    case "held":
      return { state: "held", reason: row.held_reason ?? "flagged" };
    case "removed":
      return { state: "removed" };
  }
}

function statusOf(m: Moderation): {
  status: MessageStatus;
  heldReason: MessageRow["held_reason"];
} {
  if (m.state === "visible") return { status: "visible", heldReason: null };
  if (m.state === "removed") return { status: "removed", heldReason: null };
  if (m.reason === "checking") return { status: "checking", heldReason: null };
  return { status: "held", heldReason: m.reason };
}

/** The request id of a frame that didn't parse, if it had a usable one. */
function requestIdOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("req" in value))
    return null;
  const req = ChatRequestIdSchema.safeParse(value.req);
  return req.success ? req.data : null;
}

export class CourseChat extends DurableObject<Env> {
  readonly #store: ObjectStore;
  #termId: string | null;
  #courseCode: string | null;
  #catalog: { at: number; value: ChatCourse | null } | null = null;
  readonly #profiles = new Map<string, { at: number; profile: ChatProfile }>();
  readonly #typing = new Map<string, number>();
  /** Screens in flight per message, so the alarm doesn't start another. */
  readonly #screening = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#store = new ObjectStore(ctx.storage);
    this.#termId = this.#store.meta("term_id");
    this.#courseCode = this.#store.meta("course_code");
    // Keepalive pings answered without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  // ---------- the socket ----------

  override async fetch(request: Request): Promise<Response> {
    const forwarded = ForwardedSchema.safeParse({
      user: request.headers.get(CHAT_HEADERS.user),
      term: request.headers.get(CHAT_HEADERS.term),
      course: request.headers.get(CHAT_HEADERS.course),
      level: request.headers.get(CHAT_HEADERS.level),
    });
    if (!forwarded.success) return new Response("Bad request", { status: 400 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected a WebSocket", {
        status: 426,
        headers: { Upgrade: "websocket" },
      });
    const { user, term, course, level } = forwarded.data;
    this.#bind(term, course);
    if (!(await this.#course()))
      return new Response("No such course", { status: 404 });
    const [client, server] = Object.values(new WebSocketPair()) as [
      WebSocket,
      WebSocket,
    ];
    this.ctx.acceptWebSocket(server, [user]);
    const attachment: Attachment = {
      user,
      term,
      course,
      canSend: level === "on",
      hello: false,
      sections: [],
    };
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const att = this.#attachment(ws);
    if (!att) return ws.close(CHAT_CLOSE.signedOut, "Sign in again.");
    this.#bind(att.term, att.course);
    if (typeof message !== "string" || message.length > MAX_FRAME_CHARS)
      return this.#error(ws, null, "bad-frame");
    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      return this.#error(ws, null, "bad-frame");
    }
    const parsed = ChatClientFrameSchema.safeParse(json);
    if (!parsed.success) return this.#error(ws, requestIdOf(json), "bad-frame");
    const frame = parsed.data;
    if (frame.type === "hello") return this.#hello(ws, att, frame);
    if (!att.hello) return this.#error(ws, requestIdOf(frame), "bad-frame");
    switch (frame.type) {
      case "history":
        return this.#history(ws, att, frame);
      case "send":
        return this.#send(ws, att, frame);
      case "edit":
        return this.#edit(ws, att, frame);
      case "delete":
        return this.#delete(ws, att, frame);
      case "react":
        return this.#react(ws, att, frame);
      case "typing":
        return this.#typingFrame(att, frame);
      case "read":
        return this.#read(att, frame);
    }
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed on our side.
    }
  }

  // ---------- frames ----------

  async #hello(
    ws: WebSocket,
    att: Attachment,
    frame: Extract<ChatClientFrame, { type: "hello" }>,
  ): Promise<void> {
    if (frame.protocol < CHAT_PROTOCOL_VERSION)
      return this.#error(ws, null, "old-client");
    const [course, profile, sections] = await Promise.all([
      this.#course(),
      this.#profile(att.user, 0),
      planSections(this.env.DB, att.user, att.term, att.course),
    ]);
    if (!profile?.active) {
      this.#error(ws, null, "signed-out");
      return ws.close(CHAT_CLOSE.signedOut, "Sign in again.");
    }
    if (!course) return this.#error(ws, null, "not-found");
    // A hello again (after a sync) rechecks which rooms you can read.
    const next: Attachment = {
      ...att,
      hello: true,
      sections: sections.slice(0, MAX_SECTIONS),
    };
    ws.serializeAttachment(next);
    const rooms = [...new Set(frame.rooms)].filter(
      (room) =>
        canReadRoom(course.tree, room, next.sections) &&
        (isListedRoom(course.tree, room) || this.#store.hasRoom(room)),
    );
    const [counts, markers] = await Promise.all([
      memberCounts(this.env.DB, att.term, att.course),
      readMarkers(this.env.DB, att.user, att.term, att.course),
    ]);
    const unread = this.#store.unread(rooms, markers, att.user);
    const readOnly = this.#isReadOnly(course, Date.now());
    this.#sendFrame(ws, {
      type: "welcome",
      protocol: CHAT_PROTOCOL_VERSION,
      you: profile.author,
      rooms: rooms.map((room) => ({
        room,
        members: roomMemberCount(course.tree, room, counts),
        unread: unread.get(room) ?? 0,
        writable: next.canSend && !readOnly && isListedRoom(course.tree, room),
      })),
    });
  }

  async #history(
    ws: WebSocket,
    att: Attachment,
    frame: Extract<ChatClientFrame, { type: "history" }>,
  ): Promise<void> {
    const { req, room } = frame;
    const course = await this.#course();
    if (!course || !canReadRoom(course.tree, room, att.sections))
      return this.#error(ws, req, "not-a-member");
    let beforeSeq: number | null = null;
    if (frame.before !== null) {
      const before = this.#store.message(frame.before);
      if (before?.room_id !== room) return this.#error(ws, req, "not-found");
      beforeSeq = before.seq;
    }
    if (frame.thread !== null) {
      const root = this.#store.message(frame.thread);
      if (
        root?.room_id !== room ||
        root.reply_to !== null ||
        !this.#canSee(root, att.user)
      )
        return this.#error(ws, req, "not-found");
    }
    const page = this.#store.page(room, {
      thread: frame.thread,
      beforeSeq,
      limit: frame.limit,
      viewer: att.user,
    });
    this.#sendFrame(ws, {
      type: "page",
      req,
      room,
      thread: frame.thread,
      messages: await this.#render(page.rows),
      more: page.more,
    });
  }

  async #send(
    ws: WebSocket,
    att: Attachment,
    frame: Extract<ChatClientFrame, { type: "send" }>,
  ): Promise<void> {
    const { req, room } = frame;
    const now = Date.now();
    const gate = await this.#writeGate(ws, att, room, req, now);
    if (!gate) return;
    // A resend after a reconnect: the first one's answer, not a copy.
    const earlier = this.#store.messageByRequest(att.user, req);
    if (earlier) return this.#ack(ws, req, earlier);

    let replyTo: string | null = null;
    if (frame.replyTo !== null) {
      const parent = this.#store.message(frame.replyTo);
      if (parent?.room_id !== room || !this.#canSee(parent, att.user))
        return this.#error(ws, req, "not-found");
      // Threads are one level deep: a reply to a reply joins its thread.
      replyTo = parent.reply_to ?? parent.id;
    }
    if (this.#slowDown(ws, att, req, now)) return;

    const at = new Date(now).toISOString();
    const first = !this.#store.exists;
    const row = this.#store.insertMessage({
      id: chatMessageId(now, crypto.getRandomValues(new Uint8Array(10))),
      room_id: room,
      author_id: att.user,
      author_name: gate.profile.author.name,
      body: frame.text,
      reply_to: replyTo,
      status: "checking",
      held_reason: null,
      client_req: req,
      created_at: at,
      edited_at: null,
      check_after: now + RECHECK_MS,
    });
    this.#store.logSend(att.user, now, now - DAY_MS);
    if (first) {
      this.#store.setMeta("term_id", att.term);
      this.#store.setMeta("course_code", att.course);
    }
    await this.#scheduleAlarm(now);
    await this.#ack(ws, req, row);
    await this.#toAuthor(row, ws, "message");
    await this.#screen(row);
  }

  async #edit(
    ws: WebSocket,
    att: Attachment,
    frame: Extract<ChatClientFrame, { type: "edit" }>,
  ): Promise<void> {
    const { req, room } = frame;
    const now = Date.now();
    const row = this.#ownMessage(ws, att, room, frame.id, req);
    if (!row || !(await this.#writeGate(ws, att, room, req, now))) return;
    if (row.body === frame.text) return this.#ack(ws, req, row);
    if (this.#slowDown(ws, att, req, now)) return;
    this.#store.editMessage(
      row.id,
      frame.text,
      new Date(now).toISOString(),
      now + RECHECK_MS,
    );
    this.#store.logSend(att.user, now, now - DAY_MS);
    const edited = this.#store.message(row.id);
    if (!edited) return;
    await this.#scheduleAlarm(now);
    await this.#ack(ws, req, edited);
    await this.#toAuthor(edited, ws, "message");
    // Classmates don't see the new text until it's checked.
    if (row.status === "visible") await this.#withdrawn(row);
    await this.#screen(edited);
  }

  async #delete(
    ws: WebSocket,
    att: Attachment,
    frame: Extract<ChatClientFrame, { type: "delete" }>,
  ): Promise<void> {
    const { req, room } = frame;
    const row = this.#ownMessage(ws, att, room, frame.id, req);
    if (!row || !(await this.#writeGate(ws, att, room, req, Date.now())))
      return;
    this.#store.deleteMessage(row.id);
    this.#sendFrame(ws, { type: "ack", req, message: null });
    const deleted: ChatServerFrame = { type: "deleted", room, id: row.id };
    if (row.status === "visible")
      await this.#broadcast(room, () => deleted, { except: ws });
    else
      for (const other of this.ctx.getWebSockets(att.user))
        if (other !== ws) this.#sendFrame(other, deleted);
    if (row.status === "visible" && row.reply_to)
      await this.#threadChanged(row.reply_to);
  }

  async #react(
    ws: WebSocket,
    att: Attachment,
    frame: Extract<ChatClientFrame, { type: "react" }>,
  ): Promise<void> {
    const { req, room } = frame;
    const now = Date.now();
    if (!(await this.#writeGate(ws, att, room, req, now))) return;
    const row = this.#store.message(frame.id);
    if (row?.room_id !== room || row.status !== "visible")
      return this.#error(ws, req, "not-found");
    this.#store.setReaction(
      row.id,
      frame.reaction,
      att.user,
      frame.on,
      new Date(now).toISOString(),
    );
    await this.#ack(ws, req, row);
    const reactions = this.#store.reactionsFor([row.id]).get(row.id) ?? {};
    await this.#broadcast(
      room,
      () => ({ type: "reactions", room, id: row.id, reactions }),
      { except: ws },
    );
  }

  async #typingFrame(
    att: Attachment,
    frame: Extract<ChatClientFrame, { type: "typing" }>,
  ): Promise<void> {
    const now = Date.now();
    const course = await this.#course();
    if (
      !course ||
      !att.canSend ||
      !canReadRoom(course.tree, frame.room, att.sections) ||
      this.#isReadOnly(course, now)
    )
      return;
    const key = `${att.user} ${frame.room}`;
    if (now - (this.#typing.get(key) ?? 0) < TYPING_EVERY_MS) return;
    this.#typing.set(key, now);
    const profile = await this.#profile(att.user, PROFILE_TTL_MS);
    if (!profile) return;
    const { directoryId, name } = profile.author;
    await this.#broadcast(frame.room, (other) =>
      other.user === att.user
        ? null
        : { type: "typing", room: frame.room, who: { directoryId, name } },
    );
  }

  async #read(
    att: Attachment,
    frame: Extract<ChatClientFrame, { type: "read" }>,
  ): Promise<void> {
    const course = await this.#course();
    const row = this.#store.message(frame.upTo);
    // Nothing to answer: a stale marker is simply ignored.
    if (
      !course ||
      row?.room_id !== frame.room ||
      !canReadRoom(course.tree, frame.room, att.sections)
    )
      return;
    await markRead(
      this.env.DB,
      att.user,
      frame.room,
      att.term,
      att.course,
      row.seq,
    );
  }

  // ---------- moderation ----------

  /**
   * Screens a message and applies the outcome. A failure leaves it
   * `checking` with its recheck time, so the alarm tries again.
   */
  async #screen(row: MessageRow): Promise<void> {
    const term = this.#termId;
    const course = this.#courseCode;
    if (!term || !course) return;
    this.#screening.set(row.id, (this.#screening.get(row.id) ?? 0) + 1);
    try {
      const result = await chatScreening.moderate(
        this.env,
        {
          kind: "chat",
          text: row.body,
          context: { targetId: chatTargetId(term, course, row.id), course },
        },
        { now: new Date() },
      );
      await this.#apply(
        row.id,
        chatModeration(result.decision, result.reasons),
        row.body,
      );
    } catch (error) {
      console.warn({ chat: "screening failed", error: String(error) });
    } finally {
      const left = (this.#screening.get(row.id) ?? 1) - 1;
      if (left > 0) this.#screening.set(row.id, left);
      else this.#screening.delete(row.id);
    }
  }

  /**
   * A later decision from moderation (a retry that passed, or the owner),
   * through its handler. Idempotent: the same decision twice changes
   * nothing, and a message deleted since is ignored.
   */
  async applyDecision(target: {
    termId: string;
    courseCode: string;
    messageId: string;
    decision: "publish" | "hold" | "remove";
    /** Why, when moderation says (a retry's reasons); none from the owner's approve. */
    reasons?: readonly ModerationReason[];
  }): Promise<void> {
    this.#bind(target.termId, target.courseCode);
    await this.#apply(
      target.messageId,
      chatModeration(target.decision, target.reasons ?? []),
    );
  }

  /**
   * Moves a message to a moderation state and tells whoever may see the
   * change. `screenedText`: the text the decision was about; if the author
   * edited it since, the edit's own screening decides instead.
   */
  async #apply(
    id: string,
    moderation: Moderation,
    screenedText?: string,
  ): Promise<void> {
    const row = this.#store.message(id);
    if (!row || (screenedText !== undefined && row.body !== screenedText))
      return;
    const { status, heldReason } = statusOf(moderation);
    // Still checking means moderation's cron retries it and calls back.
    this.#store.setModeration(id, status, heldReason, null);
    if (row.status === status && row.held_reason === heldReason) return;
    const after: MessageRow = {
      ...row,
      status,
      held_reason: heldReason,
      check_after: null,
    };
    const frame: ChatServerFrame = {
      type: "moderation",
      room: row.room_id,
      id,
      moderation,
    };
    for (const ws of this.ctx.getWebSockets(row.author_id))
      this.#sendFrame(ws, frame);
    if (status === "visible") await this.#published(after);
    else if (row.status === "visible") await this.#withdrawn(row);
  }

  /** A message everyone in the room may now see. */
  async #published(row: MessageRow): Promise<void> {
    const [message] = await this.#render([row]);
    if (!message) return;
    await this.#broadcast(row.room_id, (other) =>
      other.user === row.author_id ? null : { type: "message", message },
    );
    if (row.reply_to) await this.#threadChanged(row.reply_to);
    await this.#recordVisible(row);
  }

  /** A message classmates saw that's gone for now (edited, held or removed). */
  async #withdrawn(row: MessageRow): Promise<void> {
    await this.#broadcast(row.room_id, (other) =>
      other.user === row.author_id
        ? null
        : {
            type: "moderation",
            room: row.room_id,
            id: row.id,
            moderation: { state: "removed" },
          },
    );
    if (row.reply_to) await this.#threadChanged(row.reply_to);
  }

  /** A thread's reply count changed: its first message, again. */
  async #threadChanged(rootId: string): Promise<void> {
    const root = this.#store.message(rootId);
    if (!root) return;
    const [message] = await this.#render([root]);
    if (!message) return;
    await this.#broadcast(root.room_id, (other) =>
      this.#canSee(root, other.user) ? { type: "message", message } : null,
    );
  }

  async #recordVisible(row: MessageRow): Promise<void> {
    const course = await this.#course();
    const parsed = parseRoomId(row.room_id);
    if (!parsed) return;
    await recordVisible(this.env.DB, {
      termId: parsed.termId,
      courseCode: parsed.courseCode,
      roomId: row.room_id,
      kind: parsed.kind,
      sections: course ? roomSectionCodes(course.tree, row.room_id) : [],
      seq: row.seq,
      at: row.created_at,
      authorId: row.author_id,
    });
  }

  // ---------- retention and rechecks (alarms) ----------

  override async alarm(): Promise<void> {
    if (!this.#store.exists) return;
    const term = this.#store.meta("term_id");
    const course = this.#store.meta("course_code");
    if (term && course) this.#bind(term, course);
    const now = Date.now();
    const retention = await this.#retention(now);
    if (retention && now >= retention.deleteAt) return this.#purge();
    if (
      retention &&
      now >= retention.readOnlyAt &&
      this.#store.meta("read_only_announced") !== "1"
    ) {
      this.#store.setMeta("read_only_announced", "1");
      // The app reconnects and its new welcome says the rooms are read-only.
      for (const ws of this.ctx.getWebSockets())
        ws.close(CHAT_CLOSE.readOnly, "This term's chat is read-only now.");
    }
    await this.#recheck(now);
    await this.#scheduleAlarm(now);
  }

  /**
   * Messages still `checking` past their recheck time (the object was
   * evicted mid-check, or moderation threw): take moderation's latest
   * decision if it's about this text, or screen again.
   */
  async #recheck(now: number): Promise<void> {
    const term = this.#termId;
    const course = this.#courseCode;
    if (!term || !course) return;
    for (const row of this.#store.dueForCheck(now, RECHECK_BATCH)) {
      if (this.#screening.has(row.id)) continue;
      this.#store.setCheckAfter(row.id, now + RECHECK_MS);
      try {
        const latest = await chatScreening.latestDecision(
          this.env.DB,
          "chat",
          chatTargetId(term, course, row.id),
        );
        if (latest && latest.decidedAt >= (row.edited_at ?? row.created_at))
          await this.#apply(
            row.id,
            chatModeration(latest.decision, latest.reasons),
            row.body,
          );
        else await this.#screen(row);
      } catch (error) {
        console.warn({ chat: "recheck failed", error: String(error) });
      }
    }
  }

  /** When this course's rooms turn read-only and are deleted, stored once known. */
  async #retention(now: number): Promise<ChatRetention | null> {
    const readOnlyAt = this.#store.meta("read_only_at");
    const deleteAt = this.#store.meta("delete_at");
    if (readOnlyAt && deleteAt)
      return { readOnlyAt: Number(readOnlyAt), deleteAt: Number(deleteAt) };
    if (!this.#termId) return null;
    const { term, calendar } = await loadTermDates(this.env.DATA, this.#termId);
    const retention = chatRetention(calendar, term, now);
    if (retention && this.#store.exists) {
      this.#store.setMeta("read_only_at", String(retention.readOnlyAt));
      this.#store.setMeta("delete_at", String(retention.deleteAt));
    }
    return retention;
  }

  #isReadOnly(course: ChatCourse, now: number): boolean {
    const stored = this.#store.meta("read_only_at");
    const readOnlyAt = stored
      ? Number(stored)
      : chatRetention(course.calendar, course.term, now)?.readOnlyAt;
    return readOnlyAt !== undefined && now >= readOnlyAt;
  }

  /** The next alarm: the earliest recheck, read-only time or deletion. */
  async #scheduleAlarm(now: number): Promise<void> {
    if (!this.#store.exists) return;
    const retention = await this.#retention(now);
    const next = retention
      ? now < retention.readOnlyAt
        ? retention.readOnlyAt
        : retention.deleteAt
      : now + RETENTION_RETRY_MS;
    const check = this.#store.nextCheck();
    const at = check === null ? next : Math.min(next, check);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  /** Retention's end: the object's storage and the course's D1 rows. */
  async #purge(): Promise<void> {
    if (this.#termId && this.#courseCode)
      await deleteCourseRows(this.env.DB, this.#termId, this.#courseCode);
    for (const ws of this.ctx.getWebSockets())
      ws.close(CHAT_CLOSE.deleted, "This term's chat was deleted.");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.#store.forget();
  }

  // ---------- helpers ----------

  #bind(term: string, course: string): void {
    this.#termId ??= term;
    this.#courseCode ??= course;
  }

  async #course(): Promise<ChatCourse | null> {
    const now = Date.now();
    if (this.#catalog && now - this.#catalog.at < CATALOG_TTL_MS)
      return this.#catalog.value;
    if (!this.#termId || !this.#courseCode) return null;
    const value = await loadChatCourse(
      this.env.DATA,
      this.#termId,
      this.#courseCode,
    );
    this.#catalog = { at: now, value };
    return value;
  }

  /** A person as they are now; `maxAge` 0 reads D1 fresh (blocks, deletion). */
  async #profile(userId: string, maxAge: number): Promise<ChatProfile | null> {
    return (await this.#profilesFor([userId], maxAge)).get(userId) ?? null;
  }

  async #profilesFor(
    ids: readonly string[],
    maxAge = PROFILE_TTL_MS,
  ): Promise<Map<string, ChatProfile>> {
    const now = Date.now();
    const out = new Map<string, ChatProfile>();
    const missing: string[] = [];
    for (const id of new Set(ids)) {
      const hit = this.#profiles.get(id);
      if (hit && now - hit.at < maxAge) out.set(id, hit.profile);
      else missing.push(id);
    }
    if (missing.length > 0)
      for (const [id, profile] of await readProfiles(this.env.DB, missing)) {
        this.#profiles.set(id, { at: now, profile });
        out.set(id, profile);
      }
    return out;
  }

  /** Messages as the protocol sends them, with reactions and thread summaries. */
  async #render(rows: readonly MessageRow[]): Promise<ChatMessage[]> {
    const ids = rows.map((r) => r.id);
    const reactions = this.#store.reactionsFor(ids);
    const threads = this.#store.threadsFor(
      rows.filter((r) => r.reply_to === null).map((r) => r.id),
    );
    const profiles = await this.#profilesFor(rows.map((r) => r.author_id));
    return rows.map((row) => ({
      id: row.id,
      room: row.room_id,
      author: profiles.get(row.author_id)?.author ?? {
        // The account is gone: the name it wrote under, no picture.
        directoryId: row.author_id,
        name: row.author_name,
        picture: null,
      },
      text: row.body,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      replyTo: row.reply_to,
      thread: row.reply_to === null ? (threads.get(row.id) ?? null) : null,
      reactions: reactions.get(row.id) ?? {},
      moderation: moderationOf(row),
    }));
  }

  /** Visible to everyone in the room; checking and held ones to their author only. */
  #canSee(row: MessageRow, userId: string): boolean {
    return (
      row.status === "visible" ||
      (row.author_id === userId && row.status !== "removed")
    );
  }

  /** The author's own message in the room, or an error sent. */
  #ownMessage(
    ws: WebSocket,
    att: Attachment,
    room: RoomId,
    id: string,
    req: string,
  ): MessageRow | null {
    const row = this.#store.message(id);
    if (row?.room_id !== room || row.status === "removed") {
      this.#error(ws, req, "not-found");
      return null;
    }
    if (row.author_id !== att.user) {
      this.#error(ws, req, "not-yours");
      return null;
    }
    return row;
  }

  /**
   * Whether the person may write in the room now: they can read it, the
   * term isn't over, Chat isn't read-only, the room is still listed, and
   * no admin block holds them. Sends the error and returns null otherwise.
   */
  async #writeGate(
    ws: WebSocket,
    att: Attachment,
    room: RoomId,
    req: string,
    now: number,
  ): Promise<{ course: ChatCourse; profile: ChatProfile } | null> {
    const [course, profile] = await Promise.all([
      this.#course(),
      this.#profile(att.user, 0),
    ]);
    if (!profile?.active) {
      this.#error(ws, req, "signed-out");
      return null;
    }
    if (!course || !canReadRoom(course.tree, room, att.sections)) {
      this.#error(ws, req, "not-a-member");
      return null;
    }
    if (
      !att.canSend ||
      this.#isReadOnly(course, now) ||
      !isListedRoom(course.tree, room)
    ) {
      this.#error(ws, req, "read-only");
      return null;
    }
    const blockedUntil = profile.chatBlockedUntil
      ? Date.parse(profile.chatBlockedUntil)
      : Number.NaN;
    if (blockedUntil > now) {
      this.#error(
        ws,
        req,
        "slow-down",
        Math.max(1, Math.ceil((blockedUntil - now) / 1000)),
      );
      return null;
    }
    return { course, profile };
  }

  /** Sends `slow-down` and returns true past a send limit. */
  #slowDown(ws: WebSocket, att: Attachment, req: string, now: number): boolean {
    let wait = 0;
    for (const limit of CHAT_SEND_LIMITS) {
      const window = limit.seconds * 1000;
      const { count, first } = this.#store.sendsSince(att.user, now - window);
      if (count >= limit.count && first !== null)
        wait = Math.max(wait, Math.ceil((first + window - now) / 1000));
    }
    if (wait <= 0) return false;
    this.#error(ws, req, "slow-down", Math.max(1, wait));
    return true;
  }

  async #ack(ws: WebSocket, req: string, row: MessageRow): Promise<void> {
    const [message] = await this.#render([row]);
    this.#sendFrame(ws, { type: "ack", req, message: message ?? null });
  }

  /** The author's other sockets (other tabs and devices) get their own message too. */
  async #toAuthor(
    row: MessageRow,
    except: WebSocket,
    type: "message",
  ): Promise<void> {
    const others = this.ctx
      .getWebSockets(row.author_id)
      .filter((ws) => ws !== except);
    if (others.length === 0) return;
    const [message] = await this.#render([row]);
    if (!message) return;
    for (const ws of others) this.#sendFrame(ws, { type, message });
  }

  /** A frame to every socket that has said hello and can read the room. */
  async #broadcast(
    room: RoomId,
    frameFor: (att: Attachment) => ChatServerFrame | null,
    options: { except?: WebSocket } = {},
  ): Promise<void> {
    const course = await this.#course();
    if (!course) return;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === options.except) continue;
      const att = this.#attachment(ws);
      if (!att?.hello || !canReadRoom(course.tree, room, att.sections))
        continue;
      const frame = frameFor(att);
      if (frame) this.#sendFrame(ws, frame);
    }
  }

  #attachment(ws: WebSocket): Attachment | null {
    const parsed = AttachmentSchema.safeParse(ws.deserializeAttachment());
    return parsed.success ? parsed.data : null;
  }

  #error(
    ws: WebSocket,
    req: string | null,
    code: ChatErrorCode,
    retryAfter: number | null = null,
  ): void {
    this.#sendFrame(ws, { type: "error", req, code, retryAfter });
  }

  #sendFrame(ws: WebSocket, frame: ChatServerFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // The socket closed under us; its close handler cleans up.
    }
  }
}
