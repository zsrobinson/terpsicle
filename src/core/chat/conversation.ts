import type {
  ChatAuthor,
  ChatErrorCode,
  ChatMessage,
  ChatMessageId,
  ChatRequestId,
  ChatRoomState,
  ChatServerFrame,
  RoomId,
} from "../schema";

// One course's conversation as the app holds it (V2.md §8.6): the messages
// it has seen per room and per thread, what it's still sending, who's typing,
// and the rooms `welcome` described. A reducer over the socket's frames and
// the app's own sends, so the rules (who drops a withdrawn message, where a
// reply goes, how pages merge) are tested here without a socket.

/** How long someone shows as typing after their last `typing` frame. */
export const TYPING_SHOWS_MS = 6_000;

/**
 * A message as the app shows it: the server's, or one of yours it hasn't
 * acknowledged yet (`local`), whose id is `local-<req>`.
 */
export type ChatItem = ChatMessage & {
  readonly local?: {
    readonly req: ChatRequestId;
    /** `sending` until the ack; `failed` with why when the server refused it. */
    readonly state: "sending" | "failed";
    readonly error?: ChatErrorCode;
    /** When the owner's stop ends, for a send it refused (V2 §10). */
    readonly until?: string;
  };
};

/** A room's top-level messages, or one thread's replies, oldest first. */
export type ChatList = {
  readonly ids: readonly ChatMessageId[];
  /** Older messages remain on the server. */
  readonly more: boolean;
  /** A page has arrived: an empty list means an empty room. */
  readonly loaded: boolean;
};

export type Typist = {
  readonly directoryId: string;
  readonly name: string;
  /** Epoch ms. */
  readonly until: number;
};

export type Conversation = {
  readonly you: ChatAuthor | null;
  /** The rooms the last `welcome` let you follow, with members and unread counts. */
  readonly rooms: Readonly<Record<RoomId, ChatRoomState>>;
  readonly byId: Readonly<Record<ChatMessageId, ChatItem>>;
  /** By `listKey`. */
  readonly lists: Readonly<Record<string, ChatList>>;
  readonly typing: Readonly<Record<RoomId, readonly Typist[]>>;
  /** The first message you hadn't read when the room first loaded ("New"). */
  readonly firstUnread: Readonly<Record<RoomId, ChatMessageId>>;
  /** Messages you deleted that can still be undone: hidden, not yet sent. */
  readonly hidden: ReadonlySet<ChatMessageId>;
};

export type ConversationAction =
  | {
      readonly type: "frame";
      readonly frame: ChatServerFrame;
      readonly now: number;
    }
  /** A page you asked for; `older` when it came from "Load older". */
  | {
      readonly type: "page";
      readonly frame: Extract<ChatServerFrame, { type: "page" }>;
      readonly older: boolean;
    }
  /** A message or its new version, from an ack. */
  | { readonly type: "upsert"; readonly message: ChatMessage }
  | {
      readonly type: "sending";
      readonly req: ChatRequestId;
      readonly room: RoomId;
      readonly text: string;
      readonly replyTo: ChatMessageId | null;
      /** ISO time, for ordering. */
      readonly at: string;
    }
  | {
      readonly type: "sent";
      readonly req: ChatRequestId;
      readonly message: ChatMessage;
    }
  | {
      readonly type: "send-failed";
      readonly req: ChatRequestId;
      readonly code: ChatErrorCode;
      readonly until?: string;
    }
  /** Your failed send, dropped (or retried under a new request id). */
  | { readonly type: "discard"; readonly req: ChatRequestId }
  | { readonly type: "hide"; readonly id: ChatMessageId }
  | { readonly type: "unhide"; readonly id: ChatMessageId }
  | { readonly type: "remove"; readonly id: ChatMessageId };

export function emptyConversation(): Conversation {
  return {
    you: null,
    rooms: {},
    byId: {},
    lists: {},
    typing: {},
    firstUnread: {},
    hidden: new Set(),
  };
}

/** Where a message is listed: its room, or `<room>>` its thread's first message. */
export function listKey(room: RoomId, thread: ChatMessageId | null): string {
  return thread === null ? room : `${room}>${thread}`;
}

export const localId = (req: ChatRequestId): ChatMessageId => `local-${req}`;

const EMPTY_LIST: ChatList = { ids: [], more: false, loaded: false };

function order(
  byId: Readonly<Record<ChatMessageId, ChatItem>>,
): (a: ChatMessageId, b: ChatMessageId) => number {
  return (a, b) => {
    const x = byId[a];
    const y = byId[b];
    // Yours still sending go last, in the order you sent them.
    const lx = x?.local ? 1 : 0;
    const ly = y?.local ? 1 : 0;
    if (lx !== ly) return lx - ly;
    return (
      (x?.createdAt ?? "").localeCompare(y?.createdAt ?? "") ||
      a.localeCompare(b)
    );
  };
}

function keyOf(m: Pick<ChatMessage, "room" | "replyTo">): string {
  return listKey(m.room, m.replyTo);
}

/** Adds ids to a list (once each) and re-sorts it. */
function withIds(
  state: Conversation,
  byId: Record<ChatMessageId, ChatItem>,
  key: string,
  ids: readonly ChatMessageId[],
  patch: Partial<ChatList> = {},
): Record<string, ChatList> {
  const list = state.lists[key] ?? EMPTY_LIST;
  const all = [...new Set([...list.ids, ...ids])].sort(order(byId));
  return { ...state.lists, [key]: { ...list, ...patch, ids: all } };
}

function withoutId(
  lists: Readonly<Record<string, ChatList>>,
  key: string,
  id: ChatMessageId,
): Record<string, ChatList> {
  const list = lists[key];
  if (!list?.ids.includes(id)) return { ...lists };
  return {
    ...lists,
    [key]: { ...list, ids: list.ids.filter((x) => x !== id) },
  };
}

function upsert(state: Conversation, message: ChatItem): Conversation {
  const before = state.byId[message.id];
  const byId = { ...state.byId, [message.id]: message };
  let lists: Record<string, ChatList> = { ...state.lists };
  // A message never changes rooms or threads, but be safe about stale copies.
  if (before && keyOf(before) !== keyOf(message))
    lists = withoutId(lists, keyOf(before), message.id);
  lists = withIds({ ...state, lists }, byId, keyOf(message), [message.id]);
  return { ...state, byId, lists };
}

function remove(state: Conversation, id: ChatMessageId): Conversation {
  const message = state.byId[id];
  if (!message) return state;
  const { [id]: _gone, ...byId } = state.byId;
  return { ...state, byId, lists: withoutId(state.lists, keyOf(message), id) };
}

function isYours(state: Conversation, m: ChatMessage): boolean {
  return state.you !== null && m.author.directoryId === state.you.directoryId;
}

function applyFrame(
  state: Conversation,
  frame: ChatServerFrame,
  now: number,
): Conversation {
  switch (frame.type) {
    case "welcome":
      return {
        ...state,
        you: frame.you,
        rooms: Object.fromEntries(frame.rooms.map((r) => [r.room, r])),
      };
    case "message":
      return upsert(state, frame.message);
    case "deleted":
      return remove(state, frame.id);
    case "reactions": {
      const message = state.byId[frame.id];
      if (!message) return state;
      return {
        ...state,
        byId: {
          ...state.byId,
          [frame.id]: { ...message, reactions: frame.reactions },
        },
      };
    }
    case "moderation": {
      const message = state.byId[frame.id];
      if (!message) return state;
      // Classmates drop a message that's been withdrawn (held, removed or
      // being re-checked after an edit); its author keeps it, with a note.
      if (frame.moderation.state === "removed" && !isYours(state, message))
        return remove(state, frame.id);
      return {
        ...state,
        byId: {
          ...state.byId,
          [frame.id]: { ...message, moderation: frame.moderation },
        },
      };
    }
    case "typing": {
      if (state.you?.directoryId === frame.who.directoryId) return state;
      const others = (state.typing[frame.room] ?? []).filter(
        (t) => t.directoryId !== frame.who.directoryId && t.until > now,
      );
      return {
        ...state,
        typing: {
          ...state.typing,
          [frame.room]: [
            ...others,
            { ...frame.who, until: now + TYPING_SHOWS_MS },
          ],
        },
      };
    }
    // Pages come through `page` (the session knows whether they're older);
    // acks and errors through the session's own requests.
    case "page":
    case "ack":
    case "error":
      return state;
  }
}

function applyPage(
  state: Conversation,
  frame: Extract<ChatServerFrame, { type: "page" }>,
  older: boolean,
): Conversation {
  const byId: Record<ChatMessageId, ChatItem> = { ...state.byId };
  for (const m of frame.messages) byId[m.id] = m;
  const key = listKey(frame.room, frame.thread);
  const list = state.lists[key] ?? EMPTY_LIST;
  const pageIds = frame.messages.map((m) => m.id);
  // A later latest page (after a reconnect) catches up. When it doesn't
  // reach what's already listed, more arrived than a page holds: start the
  // list over from it, since the old part no longer joins on.
  const catchUp = !older && list.loaded;
  const gap =
    catchUp &&
    frame.more &&
    list.ids.length > 0 &&
    !pageIds.some((id) => list.ids.includes(id));
  const lists = gap ? { ...state.lists, [key]: EMPTY_LIST } : state.lists;
  // "Load older" and a first page say whether older messages remain; a
  // catch-up leaves that as it was.
  const more = catchUp && !gap ? list.more : frame.more;
  const next: Conversation = {
    ...state,
    byId,
    lists: withIds({ ...state, lists }, byId, key, pageIds, {
      more,
      loaded: true,
    }),
  };
  if (list.loaded || frame.thread !== null) return next;
  // The room's first page: mark where what you hadn't read starts.
  const unread = state.rooms[frame.room]?.unread ?? 0;
  const ids = next.lists[key]?.ids ?? [];
  const first = unread > 0 ? ids[Math.max(0, ids.length - unread)] : undefined;
  return first
    ? { ...next, firstUnread: { ...next.firstUnread, [frame.room]: first } }
    : next;
}

export function conversationReducer(
  state: Conversation,
  action: ConversationAction,
): Conversation {
  switch (action.type) {
    case "frame":
      return applyFrame(state, action.frame, action.now);
    case "page":
      return applyPage(state, action.frame, action.older);
    case "upsert":
      return upsert(state, action.message);
    case "sending": {
      if (!state.you) return state;
      return upsert(state, {
        id: localId(action.req),
        room: action.room,
        author: state.you,
        text: action.text,
        createdAt: action.at,
        editedAt: null,
        replyTo: action.replyTo,
        thread: null,
        reactions: {},
        moderation: { state: "held", reason: "checking" },
        deleted: false,
        local: { req: action.req, state: "sending" },
      });
    }
    case "sent":
      return upsert(remove(state, localId(action.req)), action.message);
    case "send-failed": {
      const id = localId(action.req);
      const message = state.byId[id];
      if (!message?.local) return state;
      return {
        ...state,
        byId: {
          ...state.byId,
          [id]: {
            ...message,
            local: {
              req: action.req,
              state: "failed",
              error: action.code,
              ...(action.until ? { until: action.until } : {}),
            },
          },
        },
      };
    }
    case "discard":
      return remove(state, localId(action.req));
    case "hide":
      return { ...state, hidden: new Set([...state.hidden, action.id]) };
    case "unhide": {
      const hidden = new Set(state.hidden);
      hidden.delete(action.id);
      return { ...state, hidden };
    }
    case "remove": {
      const hidden = new Set(state.hidden);
      hidden.delete(action.id);
      return { ...remove(state, action.id), hidden };
    }
  }
}

/** A room's messages (or a thread's replies) as they show: oldest first, without hidden ones. */
export function listed(
  state: Conversation,
  room: RoomId,
  thread: ChatMessageId | null = null,
): ChatItem[] {
  const list = state.lists[listKey(room, thread)];
  if (!list) return [];
  return list.ids.flatMap((id) => {
    const m = state.byId[id];
    return m && !state.hidden.has(id) ? [m] : [];
  });
}

export function listState(
  state: Conversation,
  room: RoomId,
  thread: ChatMessageId | null = null,
): ChatList {
  return state.lists[listKey(room, thread)] ?? EMPTY_LIST;
}

/** Who's typing in a room now, not counting you. */
export function typingIn(
  state: Conversation,
  room: RoomId,
  now: number,
): Typist[] {
  return (state.typing[room] ?? []).filter((t) => t.until > now);
}

/**
 * The newest message in a room that came from the server, replies included:
 * reading up to it clears the room's unread count (they count every message).
 */
export function newestInRoom(
  state: Conversation,
  room: RoomId,
): ChatItem | null {
  let newest: ChatItem | null = null;
  for (const m of Object.values(state.byId)) {
    if (m.room !== room || m.local) continue;
    if (
      !newest ||
      m.createdAt > newest.createdAt ||
      (m.createdAt === newest.createdAt && m.id > newest.id)
    )
      newest = m;
  }
  return newest;
}
