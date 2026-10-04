import type { QueryClient } from "@tanstack/react-query";
import type {
  AcademicCalendar,
  Course,
  CourseCode,
  Plan,
  SettingsSyncDoc,
  Term,
  TermId,
} from "~/core/schema";
import type { api } from "~/server/fns/api";
import type { chatApi } from "~/server/fns/chat-api";

// What the chat list reads, without the scheduler's stores (so /chat stays
// light): the terms and the courses it shows, from published data through
// the page's query client (./chat-reads, loaded on first use), and your
// synced plans and settings from sync/pull. Rooms come from synced plans
// because that's what the server checks (V2.md §8.2).

export type ChatApi = Pick<typeof api, "sync" | "reports"> & {
  chat: typeof chatApi;
};

export interface Synced {
  /** Live plans, every term. */
  plans: Plan[];
  /** The settings doc and its rev (for changing the chat plan), or null before the first save. */
  settings: SettingsSyncDoc | null;
}

/** Every synced doc, from the start: the chat list needs them all, and there are few. */
export async function pullSynced(client: ChatApi): Promise<Synced> {
  const plans = new Map<string, Plan>();
  let settings: SettingsSyncDoc | null = null;
  let since = 0;
  // A page is at most 200 docs, and an account at most 200 plans.
  for (let page = 0; page < 10; page++) {
    const result = await client.sync.pull({ since });
    if (result.status !== "ok") {
      if (since === 0) break;
      since = 0;
      plans.clear();
      continue;
    }
    for (const doc of result.docs) {
      // Four-year plans (Plan's docs) have nothing to do with rooms.
      if (doc.kind === "settings") settings = doc;
      else if (doc.kind !== "plan") continue;
      else if (doc.body) plans.set(doc.id, doc.body);
      else plans.delete(doc.id);
    }
    since = result.cursor;
    if (!result.more) break;
  }
  return { plans: [...plans.values()], settings };
}

/** The published files the chat list reads. */
export interface ChatData {
  /** Every term, newest first. */
  terms(): Promise<Term[]>;
  /** Some courses of a term, reading only their departments' files. */
  courses(
    termId: TermId,
    codes: Iterable<CourseCode>,
  ): Promise<Map<CourseCode, Course>>;
  /** A term's academic calendar, for Now and Next; null when there's none (yet). */
  calendar(termId: TermId): Promise<AcademicCalendar | null>;
}

/** Loaded on first use: it brings the data layer, which /chat's first load leaves out. */
const reads = () => import("./chat-reads");

/** Published data through the page's query client (./chat-reads). */
export function queryChatData(client: QueryClient): ChatData {
  return {
    terms: async () => (await reads()).readTerms(client),
    courses: async (termId, codes) =>
      (await reads()).readCourses(client, termId, codes),
    calendar: async (termId) => (await reads()).readCalendar(client, termId),
  };
}
