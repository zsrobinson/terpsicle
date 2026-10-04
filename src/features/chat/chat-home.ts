import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import {
  chatTerm,
  type TermTags,
  termTagCandidates,
  termTags,
} from "~/core/catalog/term-tag";
import {
  type ChatListCourse,
  chatList,
  chatListCourseCodes,
  chatPreview,
} from "~/core/chat";
import { mainPlanFor, tabsInTerm } from "~/core/plans/main-plan";
import {
  ChatJoinedStoreSchema,
  type ChatLatestMessage,
  type ChatUnreadRoom,
  type Course,
  type CourseCode,
  type Plan,
  type RoomId,
  type Term,
  type TermId,
} from "~/core/schema";
import { newYorkClock } from "~/core/todo/list";
import { type ChatApi, chatClient, setChatClient } from "./chat-client";
import { type ChatData, queryChatData, type Synced } from "./chat-data";
import {
  type CourseLatest,
  chatLatestQuery,
  chatSyncedQuery,
  chatUnreadQuery,
  latestBehind,
  withLatest,
} from "./queries";
import { type LiveListener, liveSessionFor } from "./session";

// The chat list's state (V2.md §8.6): the term, the catalog courses the
// list shows, courses you follow, and which course sockets are open.
// What the server says (your synced plans and settings, unread counts,
// each room's newest message) is in the page's query client (./queries),
// which the sockets write into as messages land (`listLive`). Loaded once
// you're signed in; conversations live in their own sessions (./session).
// The term is always Chat's term (`chatTerm`: the one in session, or
// between terms the next to start), never a pick: a chat for a term you
// aren't in yet is confusing (owner, 2026-09-29).

export type ChatHomeStatus = "idle" | "loading" | "ready" | "error";

/** Course rooms followed from this browser, per term (the server keeps them too). */
const FOLLOWS_KEY = "terpsicle:chat-follows";

function readFollows(): Record<TermId, CourseCode[]> {
  try {
    const parsed = ChatJoinedStoreSchema.safeParse(
      JSON.parse(localStorage.getItem(FOLLOWS_KEY) ?? "{}"),
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeFollows(follows: Record<TermId, CourseCode[]>): void {
  try {
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows));
  } catch {
    // Storage blocked: the server still has the follow.
  }
}

export interface ChatHomeState {
  status: ChatHomeStatus;
  terms: Term[];
  /** Now and Next (V2 §5.5), for the term's tag in the bar. */
  tags: TermTags;
  termId: TermId | null;
  courses: Map<CourseCode, Course>;
  /**
   * Courses whose socket is open (./live-list, or the open room's): their
   * rows update live, so the list asks `chat/latest` only for the others.
   */
  live: Record<CourseCode, boolean>;
  /** The room on screen: a message there is read as it lands. */
  viewing: RoomId | null;
  follows: Record<TermId, CourseCode[]>;
  /** Mutes set here, for rooms chat/unread doesn't list yet (no messages). */
  mutes: Record<RoomId, boolean>;

  /** Loads everything for Chat's term. */
  load: () => Promise<void>;
  /**
   * Loads the catalog entries of courses the list has gained since: a
   * room the unread poll brought, a main plan changed elsewhere.
   */
  loadListCourses: () => Promise<void>;
  /** Makes sure a course's catalog entry is loaded (a room opened by link or Find a course). */
  ensureCourse: (courseCode: CourseCode) => Promise<Course | null>;
  /** You've seen a room's newest message: its count goes to 0 here at once. */
  markRead: (room: RoomId) => void;
  /** The open room's newest message, as its socket has it. */
  noteLatest: (message: ChatLatestMessage) => void;
  setViewing: (room: RoomId | null) => void;
  /** "Mark read" on a room's row: its count goes now, and the object hears it on the course's socket. */
  markRoomRead: (room: RoomId) => void;
  /**
   * Makes a plan the term's main plan, whose sections are your rooms (and
   * which Schedule, Plan, Todo and the calendar feed read); false if it
   * didn't save.
   */
  setMainPlan: (planId: string) => Promise<boolean>;
}

export interface ChatHomeDeps {
  client: ChatApi;
}

/** Test hook. */
export function setChatHomeDeps(next: ChatHomeDeps): void {
  setChatClient(next.client);
}

const notConnected = (): Promise<never> =>
  Promise.reject(new Error("Chat's published reads aren't connected yet"));

/** Published data, read through the page's query client once it's connected. */
let data: ChatData = {
  terms: notConnected,
  courses: notConnected,
  calendar: notConnected,
};

/** The page's query client, which holds what the server says. */
let queryClient: QueryClient | null = null;

/**
 * Reads through the page's query client from now on, so Chat shares every
 * file and answer with the other products in the page (the chat page
 * connects it before it loads).
 */
export function connectChatData(client: QueryClient): void {
  queryClient = client;
  data = queryChatData(client);
}

/** The page's query client, once Chat's page has connected it. */
export function chatQueryClient(): QueryClient | null {
  return queryClient;
}

const EMPTY: Synced = { plans: [], settings: null };
const NO_ROOMS: ChatUnreadRoom[] = [];

/** Your synced plans and settings as last read, without asking. */
export function cachedSynced(): Synced {
  return queryClient?.getQueryData(chatSyncedQuery().queryKey) ?? EMPTY;
}

/** Your rooms' unread rows as last heard, without asking. */
export function cachedUnread(termId: TermId | null): ChatUnreadRoom[] {
  return (
    queryClient?.getQueryData(chatUnreadQuery(termId).queryKey) ?? NO_ROOMS
  );
}

/** Changes the unread rows in the cache, if they've loaded; `change` returns `rows` for no change. */
export function updateUnread(
  termId: TermId | null,
  change: (rows: ChatUnreadRoom[]) => ChatUnreadRoom[],
): void {
  if (!queryClient || !termId) return;
  queryClient.setQueryData(chatUnreadQuery(termId).queryKey, (rows) => {
    if (!rows) return undefined;
    const next = change(rows);
    return next === rows ? undefined : next;
  });
}

/** A room's term and course, from its id. */
function roomCourse(room: RoomId): { termId: TermId; courseCode: CourseCode } {
  const [termId = "", courseCode = ""] = room.split(":");
  return { termId, courseCode };
}

/** Puts a room's newest message in its course's entry (see `withLatest`). */
function writeLatest(message: ChatLatestMessage, seq?: number): void {
  if (!queryClient) return;
  const { termId, courseCode } = roomCourse(message.room);
  queryClient.setQueryData(
    chatLatestQuery(termId, courseCode).queryKey,
    (entry) => {
      const next = withLatest(entry, message, seq);
      return next === entry ? undefined : next;
    },
  );
}

/** Changes the courses you follow in a term, here and in this browser's copy. */
export function changeFollows(
  termId: TermId,
  change: (codes: readonly CourseCode[]) => CourseCode[],
): void {
  const follows = { ...useChatHome.getState().follows };
  follows[termId] = change(follows[termId] ?? []);
  writeFollows(follows);
  useChatHome.setState({ follows });
}

/** The courses the list shows in a term, from these answers. */
function listCodes(
  termId: TermId,
  synced: Synced,
  unread: readonly ChatUnreadRoom[],
): CourseCode[] {
  return chatListCourseCodes({
    termId,
    mainPlan: mainPlanFor(
      termId,
      synced.plans,
      synced.settings?.body.mainPlans ?? {},
    ),
    follows: useChatHome.getState().follows[termId] ?? [],
    unread: [...unread],
  });
}

export const useChatHome = create<ChatHomeState>()((set, get) => {
  const coursesFor = async (termId: TermId, codes: CourseCode[]) => {
    const have = get().termId === termId ? get().courses : new Map();
    const missing = codes.filter((c) => !have.has(c));
    if (missing.length === 0) return have;
    const loaded = await data.courses(termId, missing);
    return new Map([...have, ...loaded]);
  };

  return {
    status: "idle",
    terms: [],
    tags: { now: null, next: null },
    termId: null,
    courses: new Map(),
    live: {},
    viewing: null,
    follows: typeof window === "undefined" ? {} : readFollows(),
    mutes: {},

    load: async () => {
      set({ status: "loading" });
      try {
        const client = queryClient;
        if (!client) throw new Error("Chat's reads aren't connected yet");
        const today = newYorkClock(Date.now()).date;
        // What's cached shows at once: the page asks for your plans again
        // as it opens (`useChatReads`).
        const [terms, synced, calendars] = await Promise.all([
          data.terms(),
          client.ensureQueryData(chatSyncedQuery()),
          Promise.all(termTagCandidates(today).map((id) => data.calendar(id))),
        ]);
        const tags = termTags(
          today,
          calendars.filter((c) => c !== null),
        );
        const picked = chatTerm(
          today,
          terms.map((t) => t.id),
          calendars.filter((c) => c !== null),
        );
        set({ terms, tags });
        if (!picked) {
          set({ status: "ready" });
          return;
        }
        // Home's copy, if it asked a moment ago.
        const rooms = await client.ensureQueryData(chatUnreadQuery(picked));
        const courses = await coursesFor(
          picked,
          listCodes(picked, synced, rooms),
        );
        set({ termId: picked, courses, status: "ready" });
      } catch {
        set({ status: "error" });
      }
    },

    loadListCourses: async () => {
      const { termId } = get();
      if (!termId) return;
      try {
        const courses = await coursesFor(
          termId,
          listCodes(termId, cachedSynced(), cachedUnread(termId)),
        );
        if (courses !== get().courses) set({ courses });
      } catch {
        // The rows say what they have; the next change asks again.
      }
    },

    ensureCourse: async (courseCode) => {
      const { termId } = get();
      if (!termId) return null;
      try {
        const courses = await coursesFor(termId, [courseCode]);
        set({ courses });
        return courses.get(courseCode) ?? null;
      } catch {
        return null;
      }
    },

    noteLatest: (message) => writeLatest(message),

    setViewing: (viewing) => set({ viewing }),

    markRoomRead: (room) => {
      get().markRead(room);
      const { termId, courseCode } = roomCourse(room);
      const newest = queryClient?.getQueryData(
        chatLatestQuery(termId, courseCode).queryKey,
      )?.byRoom[room];
      if (newest) liveSessionFor(courseCode)?.readUpTo(room, newest.id);
    },

    markRead: (room) =>
      updateUnread(get().termId, (rows) =>
        rows.some((r) => r.room === room && r.unread !== 0)
          ? rows.map((r) => (r.room === room ? { ...r, unread: 0 } : r))
          : rows,
      ),

    setMainPlan: async (planId) => {
      const { termId } = get();
      const synced = cachedSynced();
      const client = queryClient;
      if (!termId || !synced.settings || !client) return false;
      let settings = synced.settings;
      // Saved with the rev we have; after a conflict, once more on the server's copy.
      for (let attempt = 0; attempt < 2; attempt++) {
        const mainPlans = { ...settings.body.mainPlans, [termId]: planId };
        // With its old name too, as every push has it (settingsDocOf).
        const body = { ...settings.body, mainPlans, chatPlans: mainPlans };
        try {
          const { results } = await chatClient().sync.push({
            docs: [
              { kind: "settings", id: "settings", baseRev: settings.rev, body },
            ],
          });
          const result = results[0];
          if (result?.status === "ok") {
            client.setQueryData(chatSyncedQuery().queryKey, {
              ...synced,
              settings: { ...settings, rev: result.rev, body },
            });
            // The server's rooms for you moved with it.
            await Promise.all([
              client.invalidateQueries({
                queryKey: chatUnreadQuery(termId).queryKey,
              }),
              get().loadListCourses(),
            ]);
            return true;
          }
          if (result?.status === "conflict" && result.doc?.kind === "settings")
            settings = result.doc;
          else return false;
        } catch {
          return false;
        }
      }
      return false;
    },
  };
});

/**
 * What Chat's page asks the server for, once a page: your synced plans as
 * it opens, and your rooms' unread counts every minute while it's on
 * screen (`chatUnreadQuery`). The list's courses follow what they bring.
 */
export function useChatReads(): void {
  const termId = useChatHome((s) => s.termId);
  const status = useChatHome((s) => s.status);
  const follows = useChatHome((s) => s.follows);
  const synced = useQuery(chatSyncedQuery()).data;
  const unread = useQuery({
    ...chatUnreadQuery(termId),
    enabled: termId !== null,
  }).data;
  // biome-ignore lint/correctness/useExhaustiveDependencies: each answer can bring a course
  useEffect(() => {
    if (status === "ready") void useChatHome.getState().loadListCourses();
  }, [status, synced, unread, follows]);
}

/** Your synced plans and settings, as Chat's page last read them. */
export function useChatSynced(): Synced {
  return useQuery({ ...chatSyncedQuery(), enabled: false }).data ?? EMPTY;
}

/** Your rooms' unread rows in Chat's term, as last heard. */
export function useChatUnread(): ChatUnreadRoom[] {
  const termId = useChatHome((s) => s.termId);
  return (
    useQuery({ ...chatUnreadQuery(termId), enabled: false }).data ?? NO_ROOMS
  );
}

const NO_MESSAGES: CourseLatest["byRoom"] = {};

/**
 * A course's rooms' newest messages, for its rows in the list: asked for
 * once, then again only when a room's unread row moves past what was
 * asked and the course has no open socket to have said so.
 */
export function useCourseLatest(
  termId: TermId,
  courseCode: CourseCode,
  rows: readonly ChatUnreadRoom[],
): CourseLatest["byRoom"] {
  const live = useChatHome((s) => Boolean(s.live[courseCode]));
  const { data: entry, refetch } = useQuery({
    ...chatLatestQuery(termId, courseCode),
    enabled: rows.length > 0,
  });
  const behind = latestBehind(entry, rows, live);
  // Asked again as the rows move, even while an earlier ask is out.
  const seqs = rows.map((r) => `${r.room}=${r.lastSeq}`).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the seqs say when to look again
  useEffect(() => {
    if (behind) void refetch({ cancelRefetch: false });
  }, [behind, seqs, refetch]);
  return entry?.byRoom ?? NO_MESSAGES;
}

/** The main plan for the term on screen: your rooms come from it. */
export function useMainPlan(): Plan | null {
  const termId = useChatHome((s) => s.termId);
  const synced = useChatSynced();
  return termId
    ? mainPlanFor(termId, synced.plans, synced.settings?.body.mainPlans ?? {})
    : null;
}

/** The term's plans in tab order, for "Rooms from Plan A, your main plan ▾". */
export function termPlans(
  plans: readonly Plan[],
  termId: TermId | null,
): Plan[] {
  return termId ? tabsInTerm(plans, termId) : [];
}

/** What the list is made of. */
export interface ChatListState {
  termId: TermId | null;
  synced: Synced;
  unread: readonly ChatUnreadRoom[];
  courses: ReadonlyMap<CourseCode, Course>;
  follows: Readonly<Record<TermId, CourseCode[]>>;
  mutes: Readonly<Record<RoomId, boolean>>;
}

/** The list as it shows. Compute in a memo: it's a new array each call. */
export function chatListOf(
  state: ChatListState,
  /** The course whose room is open, listed last if it isn't yours. */
  viewing: CourseCode | null = null,
): ChatListCourse[] {
  if (!state.termId) return [];
  return chatList({
    viewing,
    termId: state.termId,
    mainPlan: mainPlanFor(
      state.termId,
      state.synced.plans,
      state.synced.settings?.body.mainPlans ?? {},
    ),
    follows: state.follows[state.termId] ?? [],
    unread: withMutes(state.unread, state.mutes),
    mutes: state.mutes,
    courses: state.courses,
  });
}

/** The list as it is now, outside React (the join from Schedule). */
export function currentChatList(): ChatListCourse[] {
  const home = useChatHome.getState();
  return chatListOf({
    ...home,
    synced: cachedSynced(),
    unread: cachedUnread(home.termId),
  });
}

/** Unread rows with the mutes set here since they were read. */
export function withMutes(
  unread: readonly ChatUnreadRoom[],
  mutes: Readonly<Record<RoomId, boolean>>,
): ChatUnreadRoom[] {
  return unread.map((r) =>
    r.room in mutes ? { ...r, muted: mutes[r.room] ?? r.muted } : r,
  );
}

/** Whether you muted a room, here or before. */
export function isMuted(
  mutes: Readonly<Record<RoomId, boolean>>,
  unread: readonly ChatUnreadRoom[],
  room: RoomId,
): boolean {
  return mutes[room] ?? unread.find((r) => r.room === room)?.muted ?? false;
}

/**
 * The list's side of every course socket (./session's `LiveListener`),
 * written into the query cache, so the list, the tab's title and Home all
 * see it without asking: a welcome's unread counts, and each message as
 * it lands, which moves its room's newest message and, for one someone
 * else just sent in a room that isn't on screen, its unread count. A
 * muted room updates its line too; the list never shows it as unread.
 */
export const listLive: LiveListener = {
  welcome: (courseCode, rooms) => {
    const counts = new Map(rooms.map((r) => [r.room, r.unread]));
    const { termId, viewing } = useChatHome.getState();
    updateUnread(termId, (rows) => {
      let changed = false;
      const next = rows.map((r) => {
        if (r.courseCode !== courseCode || !counts.has(r.room)) return r;
        const unread = r.room === viewing ? 0 : (counts.get(r.room) ?? 0);
        if (unread === r.unread) return r;
        changed = true;
        return { ...r, unread };
      });
      return changed ? next : rows;
    });
  },
  message: (message, fresh, you) => {
    const latest: ChatLatestMessage = {
      id: message.id,
      room: message.room,
      author: message.author,
      text: message.deleted ? "" : chatPreview(message.text),
      deleted: message.deleted,
      createdAt: message.createdAt,
    };
    if (!fresh || message.author.directoryId === you) {
      writeLatest(latest);
      return;
    }
    const { viewing } = useChatHome.getState();
    const { termId, courseCode } = roomCourse(message.room);
    const seen = viewing === message.room;
    let seq: number | undefined;
    updateUnread(termId, (rows) => {
      const row = rows.find((r) => r.room === message.room);
      const next: ChatUnreadRoom = row
        ? {
            ...row,
            lastSeq: row.lastSeq + 1,
            unread: seen ? 0 : row.unread + 1,
            lastMessageAt: message.createdAt,
          }
        : {
            room: message.room,
            courseCode,
            lastSeq: 1,
            unread: seen ? 0 : 1,
            lastMessageAt: message.createdAt,
            muted: false,
          };
      seq = next.lastSeq;
      return row ? rows.map((r) => (r === row ? next : r)) : [...rows, next];
    });
    // The seq it was asked at moves with it: nothing needs asking again.
    writeLatest(latest, seq);
  },
  status: (courseCode, open) => {
    const { live } = useChatHome.getState();
    if (Boolean(live[courseCode]) === open) return;
    useChatHome.setState({ live: { ...live, [courseCode]: open } });
  },
};
