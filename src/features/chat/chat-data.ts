import type { z } from "zod";
import { clientConfig } from "~/app/config";
import { pickTerm } from "~/core/catalog";
import {
  type Course,
  type CourseCode,
  DeptChunkSchema,
  deptChunkKey,
  ManifestSchema,
  manifestKey,
  type Plan,
  type SettingsSyncDoc,
  TERMS_KEY,
  type Term,
  type TermId,
  TermsFileSchema,
} from "~/core/schema";
import type { api } from "~/server/fns/api";
import type { chatApi } from "./chat-api";

// What the chat list reads, without the scheduler's stores (so /chat stays
// light): the terms and the courses it shows, straight from published data
// under /data (in mock mode the Worker serves the mock bucket there too,
// scripts/seed-mock-data.ts), and your synced plans and settings from
// sync/pull. Rooms come from synced plans because that's what the server
// checks (V2.md §8.2).

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
      if (doc.kind === "settings") settings = doc;
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
  /** Some courses of a term, reading only their departments' chunks. */
  courses(
    termId: TermId,
    codes: Iterable<CourseCode>,
  ): Promise<Map<CourseCode, Course>>;
}

/** Published data from `/data/<key>`, validated like everything else read there. */
export function fetchChatData(
  baseUrl: string = clientConfig.dataBaseUrl,
  fetcher: typeof fetch = (...args) => fetch(...args),
): ChatData {
  const base = baseUrl.replace(/\/+$/, "");
  const read = async <S extends z.ZodType>(key: string, schema: S) => {
    const response = await fetcher(`${base}/${key}`);
    if (!response.ok) throw new Error(`${key}: ${response.status}`);
    return schema.parse(await response.json()) as z.infer<S>;
  };
  return {
    terms: async () =>
      [...(await read(TERMS_KEY, TermsFileSchema)).terms].sort((a, b) =>
        b.id.localeCompare(a.id),
      ),
    courses: async (termId, codes) => {
      const manifest = await read(manifestKey(termId), ManifestSchema);
      const wanted = new Set(codes);
      const depts = new Set([...wanted].map((c) => c.slice(0, 4)));
      const out = new Map<CourseCode, Course>();
      await Promise.all(
        manifest.departments
          .filter((d) => depts.has(d.code))
          .map(async (d) => {
            const chunk = await read(
              deptChunkKey(termId, d.code, d.hash),
              DeptChunkSchema,
            );
            for (const course of chunk.courses)
              if (wanted.has(course.code)) out.set(course.code, course);
          }),
      );
      return out;
    },
  };
}

/**
 * The term the chat list opens on: the one asked for, else the scheduler's
 * rule (SPEC §3.0) with the term of your newest synced plan as the last pick.
 */
export function chatTerm(
  terms: readonly Term[],
  asked: TermId | null,
  plans: readonly Plan[],
): Term | undefined {
  const newest = [...plans].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )[0];
  return pickTerm(terms, asked ?? newest?.termId ?? null);
}
