import { create } from "zustand";
import {
  type ChatListCourse,
  chatList,
  chatListCourseCodes,
  chatPlanFor,
} from "~/core/chat";
import type {
  ChatUnreadRoom,
  Course,
  CourseCode,
  Plan,
  RoomId,
  Term,
  TermId,
} from "~/core/schema";
import { api } from "~/server/fns/api";
import { chatApi } from "./chat-api";
import {
  type ChatApi,
  type ChatData,
  chatTerm,
  fetchChatData,
  pullSynced,
  type Synced,
} from "./chat-data";

// The chat list's state (V2.md §8.6): the term, your synced plans and
// settings, the catalog courses the list shows, unread counts, and courses
// you follow. Loaded once you're signed in; conversations live in their
// own sessions (./session).

export type ChatHomeStatus = "idle" | "loading" | "ready" | "error";

/** Course rooms followed from this browser, per term (the server keeps them too). */
const FOLLOWS_KEY = "terpsicle:chat-follows";

function readFollows(): Record<TermId, CourseCode[]> {
  try {
    const raw = localStorage.getItem(FOLLOWS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<TermId, CourseCode[]> = {};
    for (const [term, codes] of Object.entries(parsed))
      if (Array.isArray(codes))
        out[term] = codes.filter((c): c is string => typeof c === "string");
    return out;
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
  termId: TermId | null;
  synced: Synced;
  courses: Map<CourseCode, Course>;
  unread: ChatUnreadRoom[];
  follows: Record<TermId, CourseCode[]>;
  /** Mutes set here, for rooms chat/unread doesn't list yet (no messages). */
  mutes: Record<RoomId, boolean>;

  /** Loads everything for a term (the asked one, or the usual pick). */
  load: (term: TermId | null) => Promise<void>;
  setTerm: (termId: TermId) => Promise<void>;
  refreshUnread: () => Promise<void>;
  /** Makes sure a course's catalog entry is loaded (a course space opened by link). */
  ensureCourse: (courseCode: CourseCode) => Promise<Course | null>;
  follow: (courseCode: CourseCode) => Promise<"ok" | "too-many" | "failed">;
  unfollow: (courseCode: CourseCode) => Promise<boolean>;
  mute: (
    courseCode: CourseCode,
    room: RoomId,
    muted: boolean,
  ) => Promise<boolean>;
  /** You've seen a room's newest message: its count goes to 0 here at once. */
  markRead: (room: RoomId) => void;
  /** Picks the plan whose sections are your rooms this term; false if it didn't save. */
  setChatPlan: (planId: string) => Promise<boolean>;
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
      chatPlan: chatPlanFor(
        termId,
        synced.plans,
        synced.settings?.body.chatPlans ?? {},
      ),
      follows: get().follows[termId] ?? [],
      unread,
    });

  const open = async (termId: TermId, synced: Synced) => {
    const { rooms } = await deps.client.chat.unread({ termId });
    const courses = await coursesFor(termId, listCodes(termId, synced, rooms));
    set({ termId, synced, unread: rooms, courses, status: "ready" });
  };

  return {
    status: "idle",
    terms: [],
    termId: null,
    synced: EMPTY,
    courses: new Map(),
    unread: [],
    follows: typeof window === "undefined" ? {} : readFollows(),
    mutes: {},

    load: async (term) => {
      set({ status: "loading" });
      try {
        const [terms, synced] = await Promise.all([
          deps.data.terms(),
          pullSynced(deps.client),
        ]);
        const picked = chatTerm(terms, term, synced.plans);
        set({ terms });
        if (!picked) {
          set({ status: "ready", synced });
          return;
        }
        await open(picked.id, synced);
      } catch {
        set({ status: "error" });
      }
    },

    setTerm: async (termId) => {
      set({ status: "loading", courses: new Map(), unread: [] });
      try {
        await open(termId, get().synced);
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
      } catch {
        // Keep the counts we have; the next refresh tries again.
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
        if (result.status === "too-many") return "too-many";
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
          (r) => r.courseCode !== courseCode || inChatPlan(get(), courseCode),
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

    markRead: (room) =>
      set({
        unread: get().unread.map((r) =>
          r.room === room ? { ...r, unread: 0 } : r,
        ),
      }),

    setChatPlan: async (planId) => {
      const { termId, synced } = get();
      if (!termId || !synced.settings) return false;
      let settings = synced.settings;
      // Saved with the rev we have; after a conflict, once more on the server's copy.
      for (let attempt = 0; attempt < 2; attempt++) {
        const body = {
          ...settings.body,
          chatPlans: { ...settings.body.chatPlans, [termId]: planId },
        };
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

function inChatPlan(state: ChatHomeState, courseCode: CourseCode): boolean {
  if (!state.termId) return false;
  const plan = chatPlanFor(
    state.termId,
    state.synced.plans,
    state.synced.settings?.body.chatPlans ?? {},
  );
  return plan?.courses.some((c) => c.courseCode === courseCode) ?? false;
}

/** The chat plan for the term on screen. */
export function useChatPlan(): Plan | null {
  return useChatHome((s) =>
    s.termId
      ? chatPlanFor(
          s.termId,
          s.synced.plans,
          s.synced.settings?.body.chatPlans ?? {},
        )
      : null,
  );
}

/** The term's plans in tab order, for "Rooms from Plan A ▾". */
export function termPlans(
  plans: readonly Plan[],
  termId: TermId | null,
): Plan[] {
  return plans
    .filter((p) => p.termId === termId)
    .sort(
      (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
    );
}

/** The list as it shows. Compute in a memo: it's a new array each call. */
export function chatListOf(
  state: Pick<
    ChatHomeState,
    "termId" | "synced" | "unread" | "courses" | "follows" | "mutes"
  >,
): ChatListCourse[] {
  if (!state.termId) return [];
  return chatList({
    termId: state.termId,
    chatPlan: chatPlanFor(
      state.termId,
      state.synced.plans,
      state.synced.settings?.body.chatPlans ?? {},
    ),
    follows: state.follows[state.termId] ?? [],
    unread: withMutes(state.unread, state.mutes),
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
