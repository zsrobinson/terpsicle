import {
  CHAT_PROTOCOL_VERSION,
  type ChatClientFrame,
  type ChatServerFrame,
  ChatServerFrameSchema,
  type CourseCode,
  type RoomId,
  type TermId,
} from "~/core/schema";

// One course's socket (GET /api/chat/socket, V2.md §8.4): it says hello with
// the rooms to follow, keeps itself alive, and reconnects with backoff. It
// knows nothing about messages; the session above it does. Every frame from
// the server is validated before anyone sees it.

export type SocketStatus =
  /** Opening, or waiting to reconnect. */
  | "connecting"
  /** `welcome` arrived. */
  | "open"
  /** The browser is offline; it reconnects when it's back. */
  | "offline"
  /** The session ended (close 4003, or "signed-out"): no more reconnects. */
  | "signed-out"
  /** Chat is off, or the course isn't in the catalog: no more reconnects. */
  | "unavailable";

/** A WebSocket as the socket uses it, so tests can stand one in. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: { data?: unknown; code?: number }) => void,
  ): void;
}

export interface ChatSocketOptions {
  termId: TermId;
  courseCode: CourseCode;
  rooms: readonly RoomId[];
  onFrame: (frame: ChatServerFrame) => void;
  onStatus: (status: SocketStatus) => void;
  /** Called after each `welcome` (the first, and after every reconnect). */
  onWelcome?: () => void;
  open?: (url: string) => SocketLike;
  /** Defaults to the page's origin. */
  origin?: string;
}

const OPEN = 1;
/** Keepalive, answered by the object without waking it. */
const PING_EVERY_MS = 30_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
/** Close codes from src/server/chat/course-chat.ts (CHAT_CLOSE). */
const SIGNED_OUT = 4003;

export class ChatSocket {
  #ws: SocketLike | null = null;
  #rooms: readonly RoomId[];
  #status: SocketStatus = "connecting";
  #attempt = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #ping: ReturnType<typeof setInterval> | null = null;
  #closed = false;
  readonly #options: ChatSocketOptions;
  readonly #online = () => {
    if (this.#status === "offline") this.#connect();
  };

  constructor(options: ChatSocketOptions) {
    this.#options = options;
    this.#rooms = options.rooms;
    if (typeof window !== "undefined")
      window.addEventListener("online", this.#online);
    this.#connect();
  }

  get status(): SocketStatus {
    return this.#status;
  }

  /**
   * Sends a frame if the socket is open; false if it isn't. The session
   * sends its unanswered requests again after the next welcome.
   */
  send(frame: ChatClientFrame): boolean {
    if (this.#status !== "open" || this.#ws?.readyState !== OPEN) return false;
    this.#ws.send(JSON.stringify(frame));
    return true;
  }

  /** Follows a new set of rooms (after the chat plan changes): hello again. */
  setRooms(rooms: readonly RoomId[]): void {
    this.#rooms = rooms;
    if (this.#ws?.readyState === OPEN) this.#hello();
  }

  close(): void {
    this.#closed = true;
    this.#clearTimers();
    if (typeof window !== "undefined")
      window.removeEventListener("online", this.#online);
    try {
      this.#ws?.close(1000, "done");
    } catch {
      // Already closed.
    }
    this.#ws = null;
  }

  #setStatus(status: SocketStatus) {
    if (status === this.#status) return;
    this.#status = status;
    this.#options.onStatus(status);
  }

  #url(): string {
    const origin =
      this.#options.origin ??
      (typeof window === "undefined" ? "" : window.location.origin);
    const base = origin.replace(/^http/, "ws");
    const query = new URLSearchParams({
      term: this.#options.termId,
      course: this.#options.courseCode,
    });
    return `${base}/api/chat/socket?${query}`;
  }

  #hello() {
    this.#ws?.send(
      JSON.stringify({
        type: "hello",
        protocol: CHAT_PROTOCOL_VERSION,
        rooms: [...this.#rooms],
      } satisfies ChatClientFrame),
    );
  }

  #connect() {
    if (this.#closed) return;
    this.#clearTimers();
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.#setStatus("offline");
      return;
    }
    this.#setStatus("connecting");
    const open =
      this.#options.open ?? ((url: string) => new WebSocket(url) as SocketLike);
    let ws: SocketLike;
    try {
      ws = open(this.#url());
    } catch {
      this.#retry();
      return;
    }
    this.#ws = ws;
    ws.addEventListener("open", () => {
      if (this.#ws !== ws) return;
      this.#hello();
      this.#ping = setInterval(() => {
        if (ws.readyState === OPEN) ws.send("ping");
      }, PING_EVERY_MS);
    });
    ws.addEventListener("message", (event) => this.#message(ws, event.data));
    ws.addEventListener("close", (event) => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      if (event.code === SIGNED_OUT) {
        this.#clearTimers();
        this.#setStatus("signed-out");
        return;
      }
      this.#retry();
    });
  }

  #message(ws: SocketLike, data: unknown) {
    if (this.#ws !== ws || typeof data !== "string" || data === "pong") return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = ChatServerFrameSchema.safeParse(json);
    // A newer server's frame this build doesn't know: skip it.
    if (!parsed.success) return;
    const frame = parsed.data;
    if (frame.type === "welcome") {
      this.#attempt = 0;
      this.#setStatus("open");
      this.#options.onFrame(frame);
      this.#options.onWelcome?.();
      return;
    }
    if (frame.type === "error" && frame.req === null) {
      if (frame.code === "signed-out") {
        this.#setStatus("signed-out");
        this.close();
        return;
      }
      if (frame.code === "old-client") {
        this.#setStatus("unavailable");
        this.close();
      }
    }
    this.#options.onFrame(frame);
  }

  #retry() {
    this.#clearTimers();
    if (this.#closed) return;
    // Sockets that never open (Chat off, a course the catalog doesn't
    // have) look the same from here; stop after a few tries.
    if (this.#attempt >= BACKOFF_MS.length + 3) {
      this.#setStatus("unavailable");
      return;
    }
    const wait = BACKOFF_MS[Math.min(this.#attempt, BACKOFF_MS.length - 1)];
    this.#attempt++;
    this.#setStatus("connecting");
    this.#timer = setTimeout(() => this.#connect(), wait);
  }

  #clearTimers() {
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#ping) clearInterval(this.#ping);
    this.#timer = null;
    this.#ping = null;
  }
}
