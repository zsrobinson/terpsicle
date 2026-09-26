import { create } from "zustand";
import type { LocalId, SharePayload } from "~/core/schema";
import {
  coursesFromShare,
  decodeShare,
  type ShareDecodeResult,
} from "~/core/share";
import { deptOf, useCatalog } from "./catalog-store";
import { newLocalId, nowIso } from "./ids";
import { useUi } from "./ui-store";
import { useWorkspace } from "./workspace-store";

// The shared-link view (SPEC §3.11): a plan from `/schedule?plan=…`, shown read-only
// in place of the person's own plan tabs. Nothing of theirs changes until
// "Save a copy". The codec is core's (`~/core/share`).

export type SharedView = { param: string; payload: SharePayload };

export interface ShareState {
  shared: SharedView | null;
  /** Decodes and shows a shared plan. The result says why it failed, if it did. */
  open: (param: string) => ShareDecodeResult;
  close: () => void;
}

export const useShare = create<ShareState>()((set, get) => ({
  shared: null,

  open: (param) => {
    const current = get().shared;
    if (current?.param === param) return { ok: true, payload: current.payload };
    const result = decodeShare(param);
    set({ shared: result.ok ? { param, payload: result.payload } : null });
    return result;
  },

  close: () => set({ shared: null }),
}));

export interface SavedCopy {
  planId: LocalId;
  planName: string;
  /** Sections and courses the current catalog no longer has; they weren't copied. */
  dropped: readonly string[];
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
  const codes = [
    ...payload.sections.map((key) => key.slice(0, key.indexOf("-"))),
    ...(payload.saved ?? []),
  ];
  await useCatalog.getState().ensureDepts(termId, codes.map(deptOf));
  const index = useCatalog.getState().byTerm[termId]?.index;
  const { courses, dropped } = index
    ? coursesFromShare(payload, index)
    : { courses: [], dropped: [...codes] };

  const planId = newLocalId();
  useWorkspace.getState().dispatch(
    {
      type: "plan/create",
      id: planId,
      termId,
      name: payload.name,
      courses,
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
