import { z } from "zod";
import { create } from "zustand";
import {
  LocalIdSchema,
  type SectionKey,
  SectionKeySchema,
} from "~/core/schema";

// Which registration-checklist rows are ticked, per plan. It's a per-browser
// convenience (like a sticky note on the list), not part of the plan: it
// isn't undoable, shared or exported, so it lives in localStorage rather
// than the plans database. Losing it costs a few clicks.

export const CHECKLIST_KEY = "terpsicle:registration-checklist";

const ChecklistSchema = z.record(LocalIdSchema, z.array(SectionKeySchema));
type Checklist = z.infer<typeof ChecklistSchema>;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function load(): Checklist {
  try {
    const raw = storage()?.getItem(CHECKLIST_KEY);
    const parsed = ChecklistSchema.safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function save(checked: Checklist): void {
  try {
    storage()?.setItem(CHECKLIST_KEY, JSON.stringify(checked));
  } catch {
    // Full or blocked storage: the ticks last for this tab.
  }
}

interface ChecklistState {
  checked: Checklist;
  toggle: (planId: string, key: SectionKey, on: boolean) => void;
}

export const useChecklist = create<ChecklistState>()((set, get) => ({
  checked: load(),
  toggle: (planId, key, on) => {
    const current = get().checked[planId] ?? [];
    const next = on
      ? [...new Set([...current, key])]
      : current.filter((k) => k !== key);
    const checked = { ...get().checked, [planId]: next };
    set({ checked });
    save(checked);
  },
}));

const NONE: readonly SectionKey[] = [];

/** The ticked section keys of one plan. */
export function useCheckedSections(planId: string): readonly SectionKey[] {
  return useChecklist((s) => s.checked[planId] ?? NONE);
}
