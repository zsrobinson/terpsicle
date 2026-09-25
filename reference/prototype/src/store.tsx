// PROTOTYPE state: in-memory only, shared by every variant so switching keeps your plans.
import { createContext, useContext, useReducer, type ReactNode } from "react";
import { DEFAULT_TRAVEL, type TravelSettings } from "./core";
import { DEFAULT_CART, DEFAULT_SCHEDULE, SECTION_BY_ID, type Block } from "./data";

export type Plan = { id: string; name: string; sections: string[]; blocks: Block[] };
export type Tab = "plan" | "search" | "problems" | "travel" | "blocks" | "export";
export type Detail = { kind: "course"; code: string } | { kind: "leg"; key: string } | null;
export type Anchor = { x: number; y: number; w: number; h: number } | null;

export type State = {
  plans: Plan[];
  activeId: string;
  shortlist: string[];
  tab: Tab;
  detail: Detail;
  anchor: Anchor;
  preview: string | null;
  travel: TravelSettings;
  past: { plans: Plan[]; activeId: string; shortlist: string[] }[];
  watching: string[];
  toast: { id: number; text: string; undo?: boolean } | null;
};

export type Action =
  | { type: "add"; section: string }
  | { type: "remove"; course: string }
  | { type: "open"; detail: Detail; anchor?: Anchor }
  | { type: "close" }
  | { type: "preview"; section: string | null }
  | { type: "tab"; tab: Tab }
  | { type: "setActive"; id: string }
  | { type: "newPlan" }
  | { type: "renamePlan"; id: string; name: string }
  | { type: "duplicatePlan"; id: string }
  | { type: "deletePlan"; id: string }
  | { type: "shortlist"; course: string; on: boolean }
  | { type: "travel"; patch: Partial<TravelSettings> }
  | { type: "removeBlock"; id: string }
  | { type: "undo" }
  | { type: "addBlock"; block: Block }
  | { type: "watch"; section: string }
  | { type: "planFrom"; sections: string[]; name: string }
  | { type: "setSections"; sections: string[] }
  | { type: "toast"; text: string };

const init: State = {
  plans: [
    { id: "a", name: "Plan A", ...DEFAULT_SCHEDULE },
    { id: "b", name: "Plan B", sections: ["CMSC351-0301", "CMSC330-0201", "STAT400-0101", "ENGL393-0404", "ECON200-0101"], blocks: DEFAULT_SCHEDULE.blocks },
  ],
  activeId: "a",
  shortlist: DEFAULT_CART,
  tab: "plan",
  detail: null,
  anchor: null,
  preview: null,
  travel: DEFAULT_TRAVEL,
  past: [],
  watching: [],
  toast: null,
};

let toastId = 0;
let planSeq = 3;
const nextName = (plans: Plan[]) => {
  for (const L of "ABCDEFGHIJ") if (!plans.some((p) => p.name === `Plan ${L}`)) return `Plan ${L}`;
  return `Plan ${planSeq++}`;
};

function reducer(s: State, a: Action): State {
  const active = s.plans.find((x) => x.id === s.activeId)!;
  // Every change to plans is undoable; that's how we avoid "are you sure?" dialogs.
  const commit = (next: Partial<State>, text: string): State => ({
    ...s, ...next,
    past: [...s.past.slice(-30), { plans: s.plans, activeId: s.activeId, shortlist: s.shortlist }],
    toast: { id: ++toastId, text, undo: true },
  });
  const patchActive = (fn: (p: Plan) => Plan) => s.plans.map((x) => (x.id === s.activeId ? fn(x) : x));
  switch (a.type) {
    case "add": {
      const sec = SECTION_BY_ID[a.section];
      const had = active.sections.find((id) => SECTION_BY_ID[id].course === sec.course);
      return {
        ...commit({ plans: patchActive((p) => ({ ...p, sections: [...p.sections.filter((id) => SECTION_BY_ID[id].course !== sec.course), a.section] })), shortlist: s.shortlist.filter((c) => c !== sec.course) },
          had ? `Switched ${sec.course} to section ${sec.code}` : `Added ${sec.course} ${sec.code} to ${active.name}`),
        preview: null,
      };
    }
    case "remove":
      return { ...commit({ plans: patchActive((p) => ({ ...p, sections: p.sections.filter((id) => SECTION_BY_ID[id].course !== a.course) })), shortlist: [...new Set([...s.shortlist, a.course])] }, `Removed ${a.course} from ${active.name}`), detail: null };
    case "removeBlock":
      return commit({ plans: patchActive((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== a.id) })) }, "Removed block");
    case "open":
      return { ...s, detail: a.detail, anchor: a.anchor ?? null, preview: null };
    case "close":
      return { ...s, detail: null, anchor: null, preview: null };
    case "preview":
      return s.preview === a.section ? s : { ...s, preview: a.section };
    case "tab":
      return { ...s, tab: a.tab, detail: null, anchor: null };
    case "setActive":
      return { ...s, activeId: a.id, detail: null, anchor: null };
    case "newPlan": {
      const id = "p" + planSeq++;
      return { ...commit({ plans: [...s.plans, { id, name: nextName(s.plans), sections: [], blocks: [] }], activeId: id }, "Created an empty plan"), detail: null };
    }
    case "duplicatePlan": {
      const src = s.plans.find((p) => p.id === a.id)!;
      const id = "p" + planSeq++;
      const i = s.plans.indexOf(src);
      const plans = [...s.plans.slice(0, i + 1), { ...src, id, name: `${src.name} copy` }, ...s.plans.slice(i + 1)];
      return commit({ plans, activeId: id }, `Duplicated ${src.name}`);
    }
    case "renamePlan":
      return { ...s, plans: s.plans.map((p) => (p.id === a.id ? { ...p, name: a.name.trim() || p.name } : p)) };
    case "deletePlan": {
      if (s.plans.length === 1) return s;
      const i = s.plans.findIndex((p) => p.id === a.id);
      const plans = s.plans.filter((p) => p.id !== a.id);
      return { ...commit({ plans, activeId: s.activeId === a.id ? plans[Math.max(0, i - 1)].id : s.activeId }, `Deleted ${s.plans[i].name}`), detail: null };
    }
    case "shortlist":
      return commit({ shortlist: a.on ? [...new Set([...s.shortlist, a.course])] : s.shortlist.filter((c) => c !== a.course) }, a.on ? `Saved ${a.course} for later` : `Removed ${a.course} from saved`);
    case "travel":
      return { ...s, travel: { ...s.travel, ...a.patch } };
    case "undo": {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { ...s, ...prev, past: s.past.slice(0, -1), toast: { id: ++toastId, text: "Undone" } };
    }
    case "toast":
      return { ...s, toast: { id: ++toastId, text: a.text } };
    case "addBlock":
      return commit({ plans: patchActive((p) => ({ ...p, blocks: [...p.blocks, a.block] })) }, `Added “${a.block.label}”`);
    case "watch":
      return { ...s, watching: s.watching.includes(a.section) ? s.watching.filter((x) => x !== a.section) : [...s.watching, a.section], toast: { id: ++toastId, text: s.watching.includes(a.section) ? "Stopped watching" : "We'll email you when a seat opens" } };
    case "setSections":
      return { ...commit({ plans: patchActive((p) => ({ ...p, sections: a.sections })) }, `Updated ${active.name}`), detail: null };
    case "planFrom": {
      const id = "p" + planSeq++;
      return { ...commit({ plans: [...s.plans, { id, name: a.name, sections: a.sections, blocks: active.blocks }], activeId: id }, `Saved as ${a.name}`), detail: null };
    }
  }
}

const Ctx = createContext<{ s: State; d: (a: Action) => void; active: Plan } | null>(null);
export function StoreProvider({ children, initial }: { children: ReactNode; initial?: Partial<State> }) {
  const [s, d] = useReducer(reducer, { ...init, ...initial });
  const active = s.plans.find((x) => x.id === s.activeId)!;
  return <Ctx.Provider value={{ s, d, active }}>{children}</Ctx.Provider>;
}
export const useStore = () => useContext(Ctx)!;
