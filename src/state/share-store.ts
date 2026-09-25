import { create } from "zustand";
import {
  type LocalId,
  type PlanCourse,
  parseSectionKey,
  type SectionKey,
  type SharePayload,
} from "~/core/schema";
import { snapshotOf } from "./catalog-helpers";
import { deptOf, useCatalog } from "./catalog-store";
import { newLocalId, nowIso } from "./ids";
import { decodeSharePayload, type ShareDecodeResult } from "./share-codec";
import { useUi } from "./ui-store";
import { useWorkspace } from "./workspace-store";

// The shared-link view (SPEC §3.11): a plan from `/?plan=…`, shown read-only
// in place of the person's own plan tabs. Nothing of theirs changes until
// "Save a copy".

export type SharedView =
  | { status: "loading"; param: string }
  | { status: "ready"; param: string; payload: SharePayload };

export interface ShareState {
  shared: SharedView | null;
  /** Decodes and shows a shared plan. The result says why it failed, if it did. */
  open: (param: string) => Promise<ShareDecodeResult>;
  close: () => void;
}

export const useShare = create<ShareState>()((set, get) => ({
  shared: null,

  open: async (param) => {
    const current = get().shared;
    if (current?.status === "ready" && current.param === param)
      return { ok: true, payload: current.payload };
    set({ shared: { status: "loading", param } });
    const result = await decodeSharePayload(param);
    // A newer open() or a close() won the race.
    if (get().shared?.param !== param) return result;
    set({
      shared: result.ok
        ? { status: "ready", param, payload: result.payload }
        : null,
    });
    return result;
  },

  close: () => set({ shared: null }),
}));

export interface SavedCopy {
  planId: LocalId;
  planName: string;
  /** Sections the current catalog no longer has; they weren't copied. */
  dropped: readonly SectionKey[];
}

/**
 * "Save a copy": a new plan in the payload's term, with fresh snapshots from
 * the current catalog (DATA.md §8). Blocks and colors aren't imported: the
 * person's own are per term and global. Missing sections are dropped and
 * returned so the caller can name them. Opens the new plan and its term.
 */
export async function saveSharedCopy(
  payload: SharePayload,
): Promise<SavedCopy> {
  const { termId } = payload;
  const keys = payload.sections.flatMap((key) => {
    const parsed = parseSectionKey(key);
    return parsed ? [{ key, ...parsed }] : [];
  });
  await useCatalog
    .getState()
    .ensureDepts(termId, [
      ...keys.map((k) => deptOf(k.courseCode)),
      ...(payload.saved ?? []).map(deptOf),
    ]);
  const courses = useCatalog.getState().byTerm[termId]?.courses ?? {};

  const dropped: SectionKey[] = [];
  const planCourses: PlanCourse[] = [];
  for (const { key, courseCode, sectionCode } of keys) {
    const section = courses[courseCode]?.sections.find(
      (s) => s.code === sectionCode,
    );
    if (!section) dropped.push(key);
    else
      planCourses.push({
        courseCode,
        sectionCode,
        snapshot: snapshotOf(section),
      });
  }
  for (const courseCode of payload.saved ?? []) {
    planCourses.push({ courseCode, sectionCode: null, snapshot: null });
  }

  const planId = newLocalId();
  const workspace = useWorkspace.getState();
  workspace.dispatch(
    {
      type: "plan/create",
      id: planId,
      termId,
      name: payload.name,
      courses: planCourses,
      now: nowIso(),
    },
    "Saved a copy of the shared plan",
  );
  const planName =
    useWorkspace.getState().plans.find((p) => p.id === planId)?.name ?? "";
  useUi.getState().setLastTermId(termId);
  useShare.getState().close();
  return { planId, planName, dropped };
}
