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
} from "~/core/chat";
import { mainPlanFor, tabsInTerm } from "~/core/plans/main-plan";
import {
  ChatJoinedStoreSchema,
  type ChatLatestMessage,
  type ChatUnreadRoom,
  type Course,
  type CourseCode,
  type CourseSearchRow,
  type Plan,
  type RoomId,
  type Term,
  type TermId,
} from "~/core/schema";
import { newYorkClock } from "~/core/todo/list";
import { api } from "~/server/fns/api";
import { chatApi } from "~/server/fns/chat-api";
import {
  type ChatApi,
  type ChatData,
  fetchChatData,
  pullSynced,
  type Synced,
} from "./chat-data";

// The chat list's state (V2.md §8.6): the term, your synced plans and
// settings, the catalog courses the list shows, unread counts, and courses
// you follow. Loaded once you're signed in; conversations live in their
// own sessions (./session). The term is always Chat's term (`chatTerm`: the
// one in session, or between terms the next to start), never a pick: a
// chat for a term you aren't in yet is confusing (owner, 2026-09-29).

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
  synced: Synced;
  courses: Map<CourseCode, Course>;
  unread: ChatUnreadRoom[];
  /**
   * Each room's newest message, the list's second line (the owner,
   * 2026-09-29), from the course's object: asked again only when a room's
   * `lastSeq` moves, and kept current by the room that's open.
   */
  latest: Record<RoomId, ChatLatestMessage>;
  /** The `lastSeq` each room's `latest` was asked at. */
  latestSeq: Record<RoomId, number>;
  follows: Record<TermId, CourseCode[]>;
  /** Mutes set here, for rooms chat/unread doesn't list yet (no messages). */
  mutes: Record<RoomId, boolean>;
  /** Every course's code and title, for finding any course's room; null until asked for. */
  courseRows: readonly CourseSearchRow[] | null;
  courseRowsState: "idle" | "loading" | "ready" | "error";

  /** Loads everything for Chat's term. */
  load: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  /** Loads `courseRows` once; after an error, asking again tries again. */
  ensureCourseRows: () => Promise<void>;
  /** Makes sure a course's catalog entry is loaded (a room opened by link or Find a course). */
  ensureCourse: (courseCode: CourseCode) => Promise<Course | null>;
  follow: (
    courseCode: CourseCode,
  ) => Promise<"ok" | "too-many" | "other-term" | "failed">;
  unfollow: (courseCode: CourseCode) => Promise<boolean>;
  mute: (
    courseCode: CourseCode,
    room: RoomId,
    muted: boolean,
  ) => Promise<boolean>;
  /** You've seen a room's newest message: its count goes to 0 here at once. */
  markRead: (room: RoomId) => void;
  /** The open room's newest message, as its socket has it. */
  noteLatest: (message: ChatLatestMessage) => void;
  /**
   * Makes a plan the term's main plan, whose sections are your rooms (and
   * which Schedule, Plan, Todo and the calendar feed read); false if it
   * didn't save.
   */
  setMainPlan: (planId: string) => Promise<boolean>;
}

export interface ChatHomeDeps {
  client: ChatApi;
  data: ChatData;
}

let deps: ChatHomeDeps = {
  client: { sync: api.sync, reports: api.reports, chat: chatApi },
  data: fetchChatData(),
};

/** Test hook. */
export function setChatHomeDeps(next: ChatHomeDeps): void {
  deps = next;
}

const EMPTY: Synced = { plans: [], settings: null };

export const useChatHome = create<ChatHomeState>()((set, get) => {
  const coursesFor = async (termId: TermId, codes: CourseCode[]) => {
    const have = get().termId === termId ? get().courses : new Map();
    const missing = codes.filter((c) => !have.has(c));
    if (missing.length === 0) return have;
    const loaded = await deps.data.courses(termId, missing);
    return new Map([...have, ...loaded]);
  };

  const listCodes = (
    termId: TermId,
    synced: Synced,
    unread: ChatUnreadRoom[],
  ) =>
    chatListCourseCodes({
      termId,
      mainPlan: mainPlanFor(
        termId,
        synced.plans,
        synced.settings?.body.mainPlans ?? {},
      ),
      follows: get().follows[termId] ?? [],
      unread,
    });

  /** Asks the courses' objects for the rooms whose newest message moved. */
  const refreshLatest = async (termId: TermId, rooms: ChatUnreadRoom[]) => {
    const asked = get().latestSeq;
    const stale = rooms.filter((r) => asked[r.room] !== r.lastSeq);
    if (stale.length === 0) return;
    const byCourse = new Map<CourseCode, ChatUnreadRoom[]>();
    for (const r of stale)
      byCourse.set(r.courseCode, [...(byCourse.get(r.courseCode) ?? []), r]);
    await Promise.all(
      [...byCourse].map(async ([courseCode, list]) => {
        try {
          const { latest } = await deps.client.chat.latest({
            termId,
            courseCode,
            rooms: list.map((r) => r.room),
          });
          set({
            latest: {
              ...get().latest,
              ...Object.fromEntries(latest.map((m) => [m.room, m])),
            },
            latestSeq: {
              ...get().latestSeq,
              ...Object.fromEntries(list.map((r) => [r.room, r.lastSeq])),
            },
          });
        } catch {
          // The rows keep what they had; the next refresh asks again.
        }
      }),
    );
  };

  const open = async (termId: TermId, synced: Synced) => {
    const { rooms } = await deps.client.chat.unread({ termId });
    const courses = await coursesFor(termId, listCodes(termId, synced, rooms));
    set({ termId, synced, unread: rooms, courses, status: "ready" });
    await refreshLatest(termId, rooms);
  };

  return {
    status: "idle",
    terms: [],
    tags: { now: null, next: null },
    termId: null,
    synced: EMPTY,
    courses: new Map(),
    unread: [],
    latest: {},
    latestSeq: {},
    follows: typeof window === "undefined" ? {} : readFollows(),
    mutes: {},
    courseRows: null,
    courseRowsState: "idle",

    load: async () => {
      set({ status: "loading" });
      try {
        const today = newYorkClock(Date.now()).date;
        const [terms, synced, calendars] = await Promise.all([
          deps.data.terms(),
          pullSynced(deps.client),
          Promise.all(
            termTagCandidates(today).map((id) => deps.data.calendar(id)),
          ),
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
          set({ status: "ready", synced });
          return;
        }
        await open(picked, synced);
      } catch {
        set({ status: "error" });
      }
    },

    refreshUnread: async () => {
      const { termId } = get();
      if (!termId) return;
      try {
        const { rooms } = await deps.client.chat.unread({ termId });
        const courses = await coursesFor(
          termId,
          listCodes(termId, get().synced, rooms),
        );
        set({ unread: rooms, courses });
        await refreshLatest(termId, rooms);
      } catch {
        // Keep the counts we have; the next refresh tries again.
      }
    },

    ensureCourseRows: async () => {
      const state = get().courseRowsState;
      if (state === "loading" || state === "ready") return;
      set({ courseRowsState: "loading" });
      try {
        set({
          courseRows: await deps.data.courseSearch(),
          courseRowsState: "ready",
        });
      } catch {
        set({ courseRowsState: "error" });
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

    follow: async (courseCode) => {
      const { termId } = get();
      if (!termId) return "failed";
      try {
        const result = await deps.client.chat.follow({ termId, courseCode });
        if (result.status !== "ok") return result.status;
      } catch {
        return "failed";
      }
      const follows = { ...get().follows };
      follows[termId] = [...new Set([...(follows[termId] ?? []), courseCode])];
      writeFollows(follows);
      set({ follows });
      return "ok";
    },

    unfollow: async (courseCode) => {
      const { termId } = get();
      if (!termId) return false;
      try {
        await deps.client.chat.unfollow({ termId, courseCode });
      } catch {
        return false;
      }
      const follows = { ...get().follows };
      follows[termId] = (follows[termId] ?? []).filter((c) => c !== courseCode);
      writeFollows(follows);
      set({
        follows,
        // Its rooms leave the list now; unread would bring them back until refreshed.
        unread: get().unread.filter(
          (r) => r.courseCode !== courseCode || inMainPlan(get(), courseCode),
        ),
      });
      return true;
    },

    mute: async (courseCode, room, muted) => {
      const { termId } = get();
      if (!termId) return false;
      const before = get().mutes;
      set({ mutes: { ...before, [room]: muted } });
      try {
        await deps.client.chat.mute({
          termId,
          courseCode,
          roomId: room,
          muted,
        });
        return true;
      } catch {
        set({ mutes: before });
        return false;
      }
    },

    noteLatest: (message) => {
      const before = get().latest[message.room];
      if (
        before &&
        before.createdAt === message.createdAt &&
        before.text === message.text &&
        before.deleted === message.deleted
      )
        return;
      set({ latest: { ...get().latest, [message.room]: message } });
    },

    markRead: (room) =>
      set({
        unread: get().unread.map((r) =>
          r.room === room ? { ...r, unread: 0 } : r,
        ),
      }),

    setMainPlan: async (planId) => {
      const { termId, synced } = get();
      if (!termId || !synced.settings) return false;
      let settings = synced.settings;
      // Saved with the rev we have; after a conflict, once more on the server's copy.
      for (let attempt = 0; attempt < 2; attempt++) {
        const mainPlans = { ...settings.body.mainPlans, [termId]: planId };
        // With its old name too, as every push has it (settingsDocOf).
        const body = { ...settings.body, mainPlans, chatPlans: mainPlans };
        try {
          const { results } = await deps.client.sync.push({
            docs: [
              { kind: "settings", id: "settings", baseRev: settings.rev, body },
            ],
          });
          const result = results[0];
          if (result?.status === "ok") {
            const next = {
              ...synced,
              settings: { ...settings, rev: result.rev, body },
            };
            set({ synced: next });
            await open(termId, next);
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

function inMainPlan(state: ChatHomeState, courseCode: CourseCode): boolean {
  if (!state.termId) return false;
  const plan = mainPlanFor(
    state.termId,
    state.synced.plans,
    state.synced.settings?.body.mainPlans ?? {},
  );
  return plan?.courses.some((c) => c.courseCode === courseCode) ?? false;
}

/** The main plan for the term on screen: your rooms come from it. */
export function useMainPlan(): Plan | null {
  return useChatHome((s) =>
    s.termId
      ? mainPlanFor(
          s.termId,
          s.synced.plans,
          s.synced.settings?.body.mainPlans ?? {},
        )
      : null,
  );
}

/** The term's plans in tab order, for "Rooms from Plan A, your main plan ▾". */
export function termPlans(
  plans: readonly Plan[],
  termId: TermId | null,
): Plan[] {
  return termId ? tabsInTerm(plans, termId) : [];
}

/** The list as it shows. Compute in a memo: it's a new array each call. */
export function chatListOf(
  state: Pick<
    ChatHomeState,
    "termId" | "synced" | "unread" | "courses" | "follows" | "mutes"
  >,
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
export function isMuted(state: ChatHomeState, room: RoomId): boolean {
  return (
    state.mutes[room] ??
    state.unread.find((r) => r.room === room)?.muted ??
    false
  );
}
