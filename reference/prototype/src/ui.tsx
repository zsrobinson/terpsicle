// PROTOTYPE shared pieces. Every variant uses these; variants only decide WHERE details open.
import clsx from "clsx";
import {
  Accessibility, ArrowLeft, ArrowRight, Bookmark, CalendarDays, CheckCircle2, ChevronDown, CircleAlert, CircleX, Copy, Image, Info, Link2,
  Plus, Route, Search, Share2, Square, Star, TriangleAlert, Undo2, X, LayoutList,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DAY_NAMES, LEG_WORDS, PACES, credits, daysLabel, feetPerMinute, fitOf, fmt, fmtFeet, fmtRange, itemsFor, layoutDay, legsFor, problems, profRating, search, seatWords,
  type Fit, type Item, type Leg, type Problem,
} from "./core";
import { BUILDINGS, COURSES, DAYS, PROFS, SECTION_BY_ID, TERM, sectionsOf, type Section } from "./data";
import { useStore, type Anchor, type Tab } from "./store";

// ================= atoms =================
export const Kbd = ({ children, dark }: { children: ReactNode; dark?: boolean }) => (
  <kbd className={clsx("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border px-1 font-mono text-[10px] font-medium", dark ? "border-white/20 text-white/80" : "border-border bg-raised text-muted")}>{children}</kbd>
);
export const Dot = ({ color, className }: { color: number; className?: string }) => (
  <span className={clsx("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: `var(--c${color}-dot)` }} />
);
export const Rating = ({ value, reviews }: { value: number | null; reviews?: number }) =>
  value == null ? <span className="text-[11px] text-faint">No rating</span> : (
    <span className="tnum inline-flex items-center gap-1 text-[11.5px] text-muted">
      <Star size={11} className="fill-current text-warn" /><span className="font-medium text-fg">{value.toFixed(1)}</span>{reviews != null && <span>({reviews})</span>}
    </span>
  );
export const SeatText = ({ s }: { s: Section }) => {
  const w = seatWords(s);
  return <span className={clsx("tnum text-[11.5px] whitespace-nowrap", { err: "text-err", warn: "text-warn", muted: "text-muted" }[w.tone])}>{w.text}</span>;
};
export const btn = "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-raised px-2.5 text-[12px] font-medium hover:border-border-strong disabled:opacity-40";
export const rectOf = (el: HTMLElement): Anchor => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

// ================= tooltips: one global layer, driven by data-tip / data-keys =================
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; sub?: string; keys?: string[]; r: DOMRect } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    let cur: Element | null = null;
    const over = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.("[data-tip]");
      if (el === cur) return;
      cur = el;
      clearTimeout(timer.current);
      setTip(null);
      if (!el) return;
      timer.current = window.setTimeout(() => {
        setTip({ text: el.getAttribute("data-tip")!, sub: el.getAttribute("data-tip-sub") ?? undefined, keys: el.getAttribute("data-keys")?.split(" "), r: el.getBoundingClientRect() });
      }, 380);
    };
    const hide = () => { clearTimeout(timer.current); setTip(null); cur = null; };
    document.addEventListener("mouseover", over);
    document.addEventListener("mousedown", hide);
    document.addEventListener("scroll", hide, true);
    return () => { document.removeEventListener("mouseover", over); document.removeEventListener("mousedown", hide); document.removeEventListener("scroll", hide, true); };
  }, []);
  if (!tip) return null;
  const below = tip.r.top < 80;
  const left = Math.min(Math.max(8, tip.r.left + tip.r.width / 2), window.innerWidth - 8);
  return (
    <div className="fade-in pointer-events-none fixed z-[70] max-w-[280px] -translate-x-1/2 rounded-md bg-[#18181b] px-2 py-1.5 text-[11.5px] text-white shadow-lg"
      style={{ left, top: below ? tip.r.bottom + 6 : tip.r.top - 6, transform: `translate(-50%, ${below ? "0" : "-100%"})` }}>
      <div className="flex items-center gap-2">
        <span>{tip.text}</span>
        {tip.keys && <span className="flex gap-0.5">{tip.keys.map((k) => <Kbd key={k} dark>{k}</Kbd>)}</span>}
      </div>
      {tip.sub && <div className="mt-0.5 text-white/60">{tip.sub}</div>}
    </div>
  );
}

// ================= derived plan info =================
export function usePlanInfo() {
  const { s, active } = useStore();
  return useMemo(() => {
    const items = itemsFor(active.sections, active.blocks);
    const legs = legsFor(items, s.travel);
    const probs = problems(active.sections, active.blocks, s.travel);
    return { items, legs, probs, credits: credits(active.sections) };
  }, [active, s.travel]);
}

// ================= global keys =================
export function useAppKeys(tabOrder?: string[]) {
  const { s, d } = useStore();
  const ref = useRef(s);
  ref.current = s;
  const order = (tabOrder ?? ["plan", "search", "problems", "travel", "blocks", "export"]).join(",");
  useEffect(() => {
    const tabs = order.split(",") as Tab[];
    const h = (e: KeyboardEvent) => {
      const s = ref.current;
      const typing = (e.target as HTMLElement).closest("input, textarea, [contenteditable]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); d({ type: "undo" }); return; }
      if (e.key === "Escape") { (e.target as HTMLElement).blur?.(); d({ type: "close" }); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); d({ type: "tab", tab: "search" }); setTimeout(() => document.getElementById("search-input")?.focus(), 0); return; }
      if (/^[1-9]$/.test(e.key) && tabs[+e.key - 1]) { d({ type: "tab", tab: tabs[+e.key - 1] }); return; }
      if (s.detail?.kind === "course" && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const secs = sectionsOf(s.detail.code).filter((x) => x.meetings.length);
        const active = s.plans.find((p) => p.id === s.activeId)!;
        const cur = s.preview ?? active.sections.find((id) => SECTION_BY_ID[id].course === (s.detail as { code: string }).code) ?? secs[0].id;
        const i = secs.findIndex((x) => x.id === cur);
        const n = secs[(i + (e.key === "ArrowDown" ? 1 : -1) + secs.length) % secs.length];
        d({ type: "preview", section: n.id });
      }
      if (e.key === "Enter" && s.preview) { const active = s.plans.find((p) => p.id === s.activeId)!; if (!active.sections.includes(s.preview)) d({ type: "add", section: s.preview }); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [d, order]);
}

// ================= top bar with plans =================
export function TopBar() {
  const { s, d } = useStore();
  const info = usePlanInfo();
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const errs = info.probs.filter((p) => p.severity !== "info").length;
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <Logo />
      <span className="ml-2 text-faint">/</span>
      <button className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] text-muted hover:bg-hover hover:text-fg" data-tip="Switch term">{TERM.name}<ChevronDown size={12} /></button>
      <span className="text-faint">/</span>
      <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {s.plans.map((p) => {
          const on = p.id === s.activeId;
          return (
            <div key={p.id} className={clsx("relative flex h-8 shrink-0 items-center rounded-md", on ? "bg-hover" : "hover:bg-hover/60")}>
              {editing === p.id ? (
                <input autoFocus defaultValue={p.name} id={"rename-" + p.id}
                  onBlur={(e) => { d({ type: "renamePlan", id: p.id, name: e.target.value }); setEditing(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
                  className="h-7 w-28 rounded border border-border-strong bg-raised px-2 text-[12.5px] outline-none" />
              ) : (
                <button onClick={() => d({ type: "setActive", id: p.id })} onDoubleClick={() => setEditing(p.id)} data-tip={on ? "Double-click to rename" : `Open ${p.name}`}
                  className={clsx("h-8 pl-2.5 text-[12.5px]", on ? "pr-1 font-medium" : "pr-2.5 text-muted")}>{p.name}</button>
              )}
              {on && editing !== p.id && (
                <button onClick={() => setMenu(menu === p.id ? null : p.id)} className="mr-1 flex size-6 items-center justify-center rounded text-muted hover:bg-raised hover:text-fg" data-tip="Plan options"><ChevronDown size={13} /></button>
              )}
              {menu === p.id && (
                <Menu onClose={() => setMenu(null)} items={[
                  { label: "Rename", run: () => setEditing(p.id) },
                  { label: "Duplicate", run: () => d({ type: "duplicatePlan", id: p.id }) },
                  { label: "Delete", danger: true, disabled: s.plans.length === 1, run: () => d({ type: "deletePlan", id: p.id }) },
                ]} />
              )}
            </div>
          );
        })}
        <button onClick={() => d({ type: "newPlan" })} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg" data-tip="New plan"><Plus size={15} /></button>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <span className="tnum hidden text-[12.5px] text-muted sm:inline"><span className="font-medium text-fg">{info.credits}</span> credits</span>
        <button onClick={() => d({ type: "tab", tab: "problems" })} data-tip="See what needs attention" data-keys="3"
          className={clsx("flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px]", errs ? "bg-err-soft text-err" : "text-ok")}>
          {errs ? <CircleAlert size={14} /> : <CheckCircle2 size={14} />}{errs ? `${errs} problem${errs > 1 ? "s" : ""}` : "No problems"}
        </button>
      </div>
    </header>
  );
}

function Menu({ items, onClose }: { items: { label: string; run: () => void; danger?: boolean; disabled?: boolean }[]; onClose: () => void }) {
  useEffect(() => {
    const h = () => onClose();
    setTimeout(() => document.addEventListener("click", h), 0);
    return () => document.removeEventListener("click", h);
  }, [onClose]);
  return (
    <div className="pop-in absolute top-9 left-0 z-50 w-40 rounded-lg border border-border bg-raised p-1 shadow-[var(--shadow)]">
      {items.map((it) => (
        <button key={it.label} disabled={it.disabled} onClick={() => { it.run(); onClose(); }}
          className={clsx("flex h-8 w-full items-center rounded-md px-2 text-left text-[12.5px] hover:bg-hover disabled:opacity-40", it.danger && "text-err")}>{it.label}</button>
      ))}
    </div>
  );
}

export const Logo = () => (
  <div className="flex items-center gap-2">
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="1" y="1" width="16" height="16" rx="4.5" fill="var(--accent)" />
      <rect x="5" y="4.5" width="3" height="5" rx="1" fill="var(--accent-fg)" />
      <rect x="10" y="7.5" width="3" height="6" rx="1" fill="var(--accent-fg)" opacity=".7" />
    </svg>
    <span className="text-[13.5px] font-semibold tracking-tight">terpsicle</span>
  </div>
);

// ================= rail (labeled tabs) =================
export const TABS: { id: Tab; label: string; icon: ReactNode; key: string }[] = [
  { id: "plan", label: "Plan", icon: <LayoutList size={17} />, key: "1" },
  { id: "search", label: "Search", icon: <Search size={17} />, key: "2" },
  { id: "problems", label: "Problems", icon: <CircleAlert size={17} />, key: "3" },
  { id: "travel", label: "Travel", icon: <Route size={17} />, key: "4" },
  { id: "blocks", label: "Blocks", icon: <Square size={17} />, key: "5" },
  { id: "export", label: "Export", icon: <Share2 size={17} />, key: "6" },
];
export function Rail() {
  const { s, d } = useStore();
  const info = usePlanInfo();
  const errs = info.probs.filter((p) => p.severity !== "info").length;
  return (
    <aside className="flex w-[60px] shrink-0 flex-col items-center gap-0.5 border-r border-border bg-panel py-2">
      {TABS.map((t) => (
        <button key={t.id} onClick={() => d({ type: "tab", tab: t.id })} data-tip={t.label} data-keys={t.key}
          className={clsx("relative flex w-[52px] flex-col items-center gap-1 rounded-lg py-2", s.tab === t.id && !s.detail ? "bg-raised text-fg shadow-sm ring-1 ring-border" : s.tab === t.id ? "text-fg" : "text-muted hover:bg-hover hover:text-fg")}>
          {t.icon}
          <span className="text-[10px] font-medium">{t.label}</span>
          {t.id === "problems" && errs > 0 && <span className="tnum absolute top-1 right-2 min-w-[15px] rounded-full bg-err px-1 text-center font-mono text-[9px] leading-[15px] text-white">{errs}</span>}
        </button>
      ))}
    </aside>
  );
}

// ================= panels =================
export function PanelHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{title}</div>
        {sub && <div className="truncate text-[11.5px] text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
export const Label = ({ children }: { children: ReactNode }) => <div className="px-4 pt-4 pb-1.5 text-[11px] font-medium text-muted">{children}</div>;

type OpenFn = (detail: { kind: "course"; code: string } | { kind: "leg"; key: string }, el?: HTMLElement) => void;
export const useOpen = (): OpenFn => {
  const { d } = useStore();
  return (detail, el) => d({ type: "open", detail, anchor: el ? rectOf(el) : null });
};

export function TabPanel() {
  const { s } = useStore();
  return (
    <>
      {s.tab === "plan" && <PlanPanel />}
      {s.tab === "search" && <SearchPanel />}
      {s.tab === "problems" && <ProblemsPanel />}
      {s.tab === "travel" && <TravelPanel />}
      {s.tab === "blocks" && <BlocksPanel />}
      {s.tab === "export" && <ExportPanel />}
    </>
  );
}

function PlanPanel() {
  const { s, active } = useStore();
  const info = usePlanInfo();
  const open = useOpen();
  const probCourses = new Set(info.probs.filter((p) => p.severity !== "info").map((p) => p.course));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title={active.name} sub={`${active.sections.length} courses · ${info.credits} credits`} />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {!active.sections.length && (
          <div className="m-4 rounded-lg border border-dashed border-border p-4 text-[12.5px] text-muted">
            This plan is empty. Search for a course, or pick one you saved below, then choose a section on the calendar.
          </div>
        )}
        <ul>
          {active.sections.map((id) => {
            const sec = SECTION_BY_ID[id];
            const c = COURSES[sec.course];
            const sel = s.detail?.kind === "course" && s.detail.code === c.code;
            return (
              <li key={id}>
                <button onClick={(e) => open({ kind: "course", code: c.code }, e.currentTarget)} data-tip="See sections and details"
                  className={clsx("w-full border-b border-border px-4 py-2.5 text-left hover:bg-hover", sel && "bg-hover")}>
                  <div className="flex items-center gap-2">
                    <Dot color={c.color} />
                    <span className="font-mono text-[12.5px] font-semibold">{c.code}</span>
                    <span className="font-mono text-[11.5px] text-muted">{sec.code}</span>
                    {probCourses.has(c.code) && <TriangleAlert size={12} className="text-warn" />}
                    <span className="ml-auto"><SeatText s={sec} /></span>
                  </div>
                  <div className="mt-0.5 truncate pl-4 text-[12px] text-muted">{c.title}</div>
                  <div className="mt-0.5 truncate pl-4 text-[11.5px] text-muted">{sec.profs.join(", ")} · {sec.meetings.length ? sec.meetings.map((m) => daysLabel(m.days)).join(" + ") : "Online"}</div>
                </button>
              </li>
            );
          })}
        </ul>
        <Label>Saved for later</Label>
        {s.shortlist.length ? s.shortlist.map((code) => (
          <button key={code} onClick={(e) => open({ kind: "course", code }, e.currentTarget)} data-tip="Pick a section on the calendar"
            className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-hover">
            <Bookmark size={12} className="text-muted" />
            <span className="font-mono text-[12.5px] font-semibold">{code}</span>
            <span className="truncate text-[12px] text-muted">{COURSES[code].title}</span>
          </button>
        )) : <p className="px-4 text-[12px] text-faint">Courses you save from search show up here.</p>}
      </div>
    </div>
  );
}

const GENEDS = ["DSHU", "DSNS", "DSSP", "DSHS", "SCIS", "DVUP", "FSPW"];
function SearchPanel() {
  const { s, active } = useStore();
  const open = useOpen();
  const [q, setQ] = useState("");
  const [ge, setGe] = useState<string[]>([]);
  const hits = useMemo(() => search(q, ge), [q, ge]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-raised px-2.5 focus-within:border-border-strong">
          <Search size={14} className="text-muted" />
          <input id="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Course, title or instructor" className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
          <span data-tip="Jump to search from anywhere" data-keys="/"><Kbd>/</Kbd></span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {GENEDS.map((g) => (
            <button key={g} onClick={() => setGe((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]))} data-tip={`Only courses that count for ${g}`}
              className={clsx("h-6 rounded-md border px-1.5 font-mono text-[10.5px]", ge.includes(g) ? "border-transparent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}>{g}</button>
          ))}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {hits.map(({ course: c, sections }) => {
          const fits = sections.filter((x) => ["fits", "tight", "current", "none"].includes(fitOf(x, active.sections, active.blocks, s.travel).kind)).length;
          const inPlan = active.sections.some((id) => SECTION_BY_ID[id].course === c.code);
          const sel = s.detail?.kind === "course" && s.detail.code === c.code;
          return (
            <button key={c.code} onClick={(e) => open({ kind: "course", code: c.code }, e.currentTarget)}
              className={clsx("block w-full border-b border-border px-4 py-2.5 text-left hover:bg-hover", sel && "bg-hover")}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12.5px] font-semibold">{c.code}</span>
                <span className="tnum text-[11px] text-faint">{c.credits} cr</span>
                {c.geneds.map((g) => <span key={g} className="rounded border border-border px-1 font-mono text-[10px] text-muted">{g}</span>)}
                {inPlan && <span className="ml-auto text-[11px] text-accent">In plan</span>}
              </div>
              <div className="mt-0.5 truncate text-[12.5px]">{c.title}</div>
              <div className="tnum mt-0.5 text-[11.5px] text-muted">
                {sections.length} section{sections.length > 1 ? "s" : ""} · <span className={fits ? "text-ok" : "text-faint"}>{fits} fit your plan</span>
              </div>
            </button>
          );
        })}
        {!hits.length && <div className="p-4 text-[12.5px] text-muted">Nothing matches “{q}”. Try a course code like CMSC351.</div>}
      </div>
    </div>
  );
}

function ProblemsPanel() {
  const info = usePlanInfo();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Problems" sub="Everything in this plan that needs a look" />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto"><ProblemList probs={info.probs} /></div>
    </div>
  );
}

export function ProblemList({ probs }: { probs: Problem[] }) {
  const { d } = useStore();
  const open = useOpen();
  if (!probs.length) return <div className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-muted"><CheckCircle2 size={15} className="text-ok" />Nothing to fix. This plan works.</div>;
  return (
    <ul className="divide-y divide-border">
      {probs.map((p) => (
        <li key={p.id} className="flex gap-3 px-4 py-3 hover:bg-hover">
          {p.severity === "error" ? <CircleX size={15} className="mt-px shrink-0 text-err" /> : p.severity === "warning" ? <TriangleAlert size={15} className="mt-px shrink-0 text-warn" /> : <Info size={15} className="mt-px shrink-0 text-muted" />}
          <div className="min-w-0 flex-1">
            <button className="text-left" onClick={(e) => (p.legKey ? open({ kind: "leg", key: p.legKey }, e.currentTarget) : p.course && open({ kind: "course", code: p.course }, e.currentTarget))} data-tip={p.legKey ? "See the travel details" : "See this course"}>
              <div className="text-[12.5px] leading-snug font-medium">{p.title}</div>
              <div className="tnum mt-0.5 text-[12px] text-muted">{p.detail}</div>
            </button>
            {p.fix && <button onClick={() => d({ type: "add", section: p.fix!.swapTo })} className={clsx(btn, "mt-2")} data-tip="Fixes this without new problems">{p.fix.label}</button>}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- travel ----------
function TravelPanel() {
  const { s, d } = useStore();
  const info = usePlanInfo();
  const open = useOpen();
  const t = s.travel;
  const ex = info.legs[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Travel time" sub="Time to get between back-to-back classes" />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <Label>Your pace</Label>
        <div className="mx-4 grid grid-cols-3 gap-1 rounded-lg border border-border p-1">
          {PACES.map((p) => (
            <button key={p.mph} onClick={() => d({ type: "travel", patch: { mph: p.mph } })}
              className={clsx("rounded-md py-1.5 text-center", t.mph === p.mph ? "bg-hover font-medium" : "text-muted hover:text-fg")}>
              <div className="text-[12.5px]">{p.label}</div><div className="tnum text-[10.5px] text-muted">{p.hint}</div>
            </button>
          ))}
        </div>
        <label className="mx-4 mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
          <input type="checkbox" id="step-free" className="mt-0.5" checked={t.stepFree} onChange={(e) => d({ type: "travel", patch: { stepFree: e.target.checked } })} />
          <span><span className="flex items-center gap-1.5 text-[12.5px] font-medium"><Accessibility size={13} />Step-free routes</span><span className="mt-0.5 block text-[11.5px] text-muted">Avoid stairs. Uses ramps, elevators and accessible entrances, which can be longer.</span></span>
        </label>
        <Label>Extra time per trip</Label>
        <div className="mx-4 flex gap-1">
          {[0, 2, 5].map((b) => (
            <button key={b} onClick={() => d({ type: "travel", patch: { buffer: b } })} className={clsx("h-7 flex-1 rounded-md border text-[12px]", t.buffer === b ? "border-border-strong bg-hover font-medium" : "border-border text-muted")}>{b ? `+${b} min` : "None"}</button>
          ))}
        </div>
        <div className="mx-4 mt-4 rounded-lg bg-panel p-3 text-[12px] leading-relaxed text-muted">
          <div className="mb-1 font-medium text-fg">How we estimate</div>
          We measure the {t.stepFree ? "step-free " : ""}path between the closest entrances of each building, then divide by your pace.
          {ex && <div className="tnum mt-2 font-mono text-[11px] text-fg">{ex.from.bldg} → {ex.to.bldg}: {fmtFeet(ex.feet)} ÷ {feetPerMinute(t.mph)} ft/min{t.buffer ? ` + ${t.buffer}` : ""} = {ex.minutes} min</div>}
          <div className="mt-2">It doesn't know about crowds, weather or a slow elevator, so leave some slack.</div>
        </div>
        <Label>Connections in {s.plans.find((p) => p.id === s.activeId)!.name}</Label>
        {[0, 1, 2, 3, 4].map((day) => {
          const ls = info.legs.filter((l) => l.day === day);
          if (!ls.length) return null;
          return (
            <div key={day} className="px-4 pb-2">
              <div className="pb-1 text-[11.5px] font-medium text-muted">{DAY_NAMES[day]}</div>
              {ls.map((l) => <LegRow key={l.key} leg={l} onClick={(e) => open({ kind: "leg", key: l.key }, e)} />)}
            </div>
          );
        })}
        {!info.legs.length && <p className="px-4 text-[12px] text-faint">No back-to-back classes in different buildings.</p>}
      </div>
    </div>
  );
}

export function LegRow({ leg, onClick }: { leg: Leg; onClick?: (el: HTMLElement) => void }) {
  const { s } = useStore();
  const sel = s.detail?.kind === "leg" && s.detail.key === leg.key;
  return (
    <button onClick={(e) => onClick?.(e.currentTarget)} className={clsx("mb-1 flex w-full items-center gap-3 rounded-md border border-border px-2.5 py-2 text-left hover:border-border-strong", sel && "border-border-strong bg-hover")}>
      <StatusDot status={leg.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px]"><span className="font-mono font-medium">{leg.from.label}</span> → <span className="font-mono font-medium">{leg.to.label}</span></div>
        <div className="tnum text-[11.5px] text-muted">{leg.minutes} min needed · {leg.gap} min between</div>
      </div>
      <span className={clsx("text-[11.5px]", { ok: "text-muted", tight: "text-warn", short: "text-err" }[leg.status])}>{LEG_WORDS[leg.status]}</span>
    </button>
  );
}
const StatusDot = ({ status }: { status: Leg["status"] }) => <span className={clsx("size-2 shrink-0 rounded-full", { ok: "bg-ok", tight: "bg-warn", short: "bg-err" }[status])} />;

function BlocksPanel() {
  const { d, active } = useStore();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Blocks" sub="Time you want to keep free" />
      <div className="p-4">
        {active.blocks.map((b) => (
          <div key={b.id} className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-raised p-3">
            <span className="stripes size-5 shrink-0 rounded border border-border" />
            <div className="flex-1">
              <div className="text-[12.5px] font-medium">{b.label}</div>
              <div className="tnum text-[11.5px] text-muted">{b.days.map((x) => DAYS[x]).join(", ")} · {fmtRange(b.start, b.end)}{b.bldg && ` · counts for travel time`}</div>
            </div>
            <button onClick={() => d({ type: "removeBlock", id: b.id })} className="text-[12px] text-muted hover:text-fg" data-tip="You can undo this" data-keys="⌘ Z">Remove</button>
          </div>
        ))}
        <button className="h-9 w-full rounded-lg border border-dashed border-border text-[12.5px] text-muted hover:border-border-strong hover:text-fg">+ Add a block</button>
        <p className="mt-2 text-[11.5px] text-faint">Tip: give a block a place (like your dorm or job) and we'll include it in travel time.</p>
      </div>
    </div>
  );
}

function ExportPanel() {
  const { d, active } = useStore();
  const codes = active.sections.map((id) => id.replace("-", " ")).join("\n");
  const rows = [
    { icon: <Copy size={15} />, label: "Copy course and section codes", hint: "Paste them into Testudo when you register", run: () => { navigator.clipboard?.writeText(codes).catch(() => {}); d({ type: "toast", text: `Copied ${active.sections.length} codes` }); } },
    { icon: <Link2 size={15} />, label: "Copy share link", hint: "Friends can view it or overlay it on their plan", run: () => d({ type: "toast", text: "Share link copied (prototype)" }) },
    { icon: <CalendarDays size={15} />, label: "Add to your calendar", hint: ".ics file with breaks skipped and finals included", run: () => d({ type: "toast", text: "Would download an .ics file" }) },
    { icon: <Image size={15} />, label: "Save as image", hint: "A picture of your week", run: () => d({ type: "toast", text: "Would save a PNG" }) },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Export" sub={active.name} />
      <div className="p-2">
        {rows.map((r) => (
          <button key={r.label} onClick={r.run} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-hover">
            <span className="text-muted">{r.icon}</span>
            <span><span className="block text-[12.5px] font-medium">{r.label}</span><span className="block text-[11.5px] text-muted">{r.hint}</span></span>
          </button>
        ))}
      </div>
      <Label>Your codes</Label>
      <pre className="tnum mx-4 rounded-lg border border-border bg-panel p-3 font-mono text-[12px] leading-relaxed">{codes}</pre>
    </div>
  );
}

// ================= details =================
export function DetailView({ compact }: { compact?: boolean }) {
  const { s } = useStore();
  if (s.detail?.kind === "course") return <CourseDetail code={s.detail.code} compact={compact} />;
  if (s.detail?.kind === "leg") return <LegDetail legKey={s.detail.key} />;
  return null;
}
export const detailTitle = (d: NonNullable<ReturnType<typeof useStore>["s"]["detail"]>) => (d.kind === "course" ? d.code : "Connection");

function FitLabel({ fit }: { fit: Fit }) {
  const tone = { current: "text-accent", fits: "text-ok", tight: "text-warn", clash: "text-err", short: "text-err", none: "text-muted" }[fit.kind];
  return <span className={clsx("text-[11.5px]", tone)}>{fit.label}</span>;
}

export function CourseDetail({ code, compact }: { code: string; compact?: boolean }) {
  const { s, d, active } = useStore();
  const c = COURSES[code];
  const secs = sectionsOf(code);
  const current = active.sections.find((id) => SECTION_BY_ID[id].course === code);
  const profs = [...new Set(secs.flatMap((x) => x.profs))];
  const [more, setMore] = useState<"instructors" | "grades" | "about">("instructors");
  return (
    <div className="flex flex-col">
      <div className={clsx("px-4 pt-4 pb-3", compact && "pr-12")}>
        <div className="flex items-center gap-2">
          <Dot color={c.color} />
          <span className="font-mono text-[13px] font-semibold">{c.code}</span>
          <span className="tnum text-[11.5px] text-muted">{c.credits} credits</span>
          {c.geneds.map((g) => <span key={g} className="rounded border border-border px-1 font-mono text-[10px] text-muted">{g}</span>)}
        </div>
        <div className="mt-1 text-[15px] leading-snug font-semibold text-balance">{c.title}</div>
        <div className="mt-3 flex gap-2">
          {current
            ? <button onClick={() => d({ type: "remove", course: code })} className={btn} data-tip="You can undo this" data-keys="⌘ Z">Remove from {active.name}</button>
            : <button onClick={() => d({ type: "shortlist", course: code, on: !s.shortlist.includes(code) })} className={btn}><Bookmark size={13} className={s.shortlist.includes(code) ? "fill-current" : ""} />{s.shortlist.includes(code) ? "Saved" : "Save for later"}</button>}
        </div>
      </div>

      <div className="flex items-baseline justify-between px-4 pt-2 pb-1.5">
        <span className="text-[11px] font-medium text-muted">Sections</span>
        <span className="text-[11px] text-faint" data-tip="Preview sections on the calendar" data-keys="↑ ↓">hover or use ↑↓ to preview</span>
      </div>
      <ul className="border-y border-border">
        {secs.map((sec) => {
          const fit = fitOf(sec, active.sections, active.blocks, s.travel);
          const isCur = sec.id === current;
          const pv = s.preview === sec.id;
          return (
            <li key={sec.id} onMouseEnter={() => d({ type: "preview", section: sec.id })} onMouseLeave={() => d({ type: "preview", section: null })}
              className={clsx("flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0", pv ? "bg-hover" : isCur ? "bg-accent-soft/50" : "")}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12.5px] font-semibold">{sec.code}</span>
                  <span className="truncate text-[12.5px]">{sec.profs.join(", ")}</span>
                  <Rating value={profRating(sec)} />
                </div>
                <div className="tnum mt-0.5 truncate text-[11.5px] text-muted">
                  {sec.meetings.length ? sec.meetings.map((m) => `${daysLabel(m.days)} ${fmtRange(m.start, m.end)} ${m.bldg ?? ""}`).join(" · ") : "Online, no set times"}
                </div>
                <div className="mt-0.5 flex items-center gap-2"><FitLabel fit={fit} /><span className="text-faint">·</span><SeatText s={sec} /></div>
                {sec.note && !compact && <div className="mt-0.5 text-[11.5px] text-warn">{sec.note}</div>}
              </div>
              {isCur ? <span className="w-[68px] text-center text-[11.5px] font-medium text-accent">Current</span> : (
                <button onClick={() => d({ type: "add", section: sec.id })} data-tip={current ? `Replace ${current.split("-")[1]} with ${sec.code}` : `Add ${sec.code} to ${active.name}`} data-keys={pv ? "↵" : undefined}
                  className={clsx(btn, "w-[68px] justify-center", (fit.kind === "clash" || fit.kind === "short") && "text-err")}>{current ? "Switch" : "Add"}</button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex gap-1 px-4">
        {(["instructors", "grades", "about"] as const).map((k) => (
          <button key={k} onClick={() => setMore(k)} className={clsx("h-7 rounded-md px-2.5 text-[12px] capitalize", more === k ? "bg-hover font-medium" : "text-muted hover:text-fg")}>{k}</button>
        ))}
      </div>
      <div className="px-4 pt-2 pb-5">
        {more === "instructors" && profs.map((p) => <ProfCard key={p} name={p} />)}
        {more === "grades" && <Grades code={code} />}
        {more === "about" && (
          <div className="text-[12.5px] leading-relaxed text-muted">
            <p>{c.desc}</p>
            {c.prereq && <p className="mt-2"><span className="font-medium text-fg">Prerequisite:</span> {c.prereq}</p>}
            {c.exam && <p className="mt-2"><span className="font-medium text-fg">Final exam:</span> {c.exam}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// Review summaries are generated on the server the first time anyone opens an instructor, then cached.
const summarized = new Set<string>();
function ProfCard({ name }: { name: string }) {
  const pr = PROFS[name];
  const [ready, setReady] = useState(summarized.has(name));
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => { summarized.add(name); setReady(true); }, 900);
    return () => clearTimeout(t);
  }, [name, ready]);
  if (!pr) return null;
  return (
    <div className="mb-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium">{name}</span>
        <Rating value={pr.rating} reviews={pr.reviews} />
      </div>
      {ready ? (
        <>
          <p className="fade-in mt-1.5 text-[12px] leading-relaxed text-muted">{pr.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {pr.tags.map((t) => <span key={t.label} className={clsx("rounded px-1.5 py-0.5 text-[11px]", t.tone === "good" ? "bg-ok-soft text-ok" : t.tone === "bad" ? "bg-err-soft text-err" : "bg-hover text-muted")}>{t.label}</span>)}
          </div>
          <div className="mt-2 text-[11px] text-faint">Summary of {pr.reviews} PlanetTerp reviews · <span className="underline">read them</span></div>
        </>
      ) : (
        <div className="mt-2 space-y-1.5" data-tip="Summaries are made the first time someone opens an instructor, then saved for everyone">
          <div className="h-2.5 w-full animate-pulse rounded bg-hover" /><div className="h-2.5 w-4/5 animate-pulse rounded bg-hover" />
          <div className="text-[11px] text-faint">Summarizing {pr.reviews} reviews…</div>
        </div>
      )}
    </div>
  );
}

function Grades({ code }: { code: string }) {
  const c = COURSES[code];
  const ab = c.grades[0] + c.grades[1];
  return (
    <div>
      <p className="text-[12.5px]"><span className="tnum font-semibold">{ab}%</span> <span className="text-muted">of students got an A or B. Average GPA</span> <span className="tnum font-semibold">{c.avgGpa.toFixed(2)}</span><span className="text-muted">.</span></p>
      <div className="mt-3 space-y-1.5">
        {["A", "B", "C", "D", "F"].map((l, i) => (
          <div key={l} className="grid grid-cols-[14px_1fr_36px] items-center gap-2">
            <span className="font-mono text-[11.5px] text-muted">{l}</span>
            <div className="h-3 rounded-sm bg-hover"><div className="h-3 rounded-sm bg-fg/70" style={{ width: `${c.grades[i]}%` }} /></div>
            <span className="tnum text-right text-[11.5px] text-muted">{c.grades[i]}%</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">All sections, last 4 semesters.</p>
    </div>
  );
}

export function LegDetail({ legKey }: { legKey: string }) {
  const { s, d, active } = useStore();
  const info = usePlanInfo();
  const leg = info.legs.find((l) => l.key === legKey);
  if (!leg) return <div className="p-4 text-[12.5px] text-muted">This connection no longer exists. It changed when the plan did.</div>;
  const A = BUILDINGS[leg.from.bldg!], B = BUILDINGS[leg.to.bldg!];
  const alts = [leg.to, leg.from].flatMap((it) =>
    it.section ? sectionsOf(it.section.course).filter((x) => x.id !== it.sectionId).map((x) => ({ x, fit: fitOf(x, active.sections, active.blocks, s.travel) })).filter((a) => a.fit.kind === "fits") : [],
  );
  return (
    <div className="p-4">
      <div className="text-[11px] font-medium text-muted">Every {info.legs.filter((l) => l.from.label === leg.from.label && l.to.label === leg.to.label).map((l) => DAY_NAMES[l.day]).join(" and ")}</div>
      <div className="mt-1 flex items-center gap-2 text-[15px] font-semibold"><span className="font-mono">{leg.from.label}</span><ArrowRight size={15} className="text-muted" /><span className="font-mono">{leg.to.label}</span></div>
      <div className={clsx("mt-3 rounded-lg p-3", { ok: "bg-ok-soft", tight: "bg-warn-soft", short: "bg-err-soft" }[leg.status])}>
        <div className={clsx("text-[13px] font-semibold", { ok: "text-ok", tight: "text-warn", short: "text-err" }[leg.status])}>{LEG_WORDS[leg.status]}</div>
        <div className="tnum mt-0.5 text-[12.5px]">{leg.minutes} min to get there, {leg.gap} min between classes.{leg.status === "short" && ` You'd be about ${leg.minutes - leg.gap} min late.`}</div>
      </div>
      <dl className="tnum mt-3 grid grid-cols-[88px_1fr] gap-y-1.5 text-[12.5px]">
        <dt className="text-muted">Leave</dt><dd>{A.name} at {fmt(leg.from.end)}</dd>
        <dt className="text-muted">Arrive by</dt><dd>{B.name} at {fmt(leg.to.start)}</dd>
        <dt className="text-muted">Distance</dt><dd>{fmtFeet(leg.feet)}{s.travel.stepFree && " (step-free)"}</dd>
        <dt className="text-muted">Estimate</dt><dd className="font-mono text-[12px]">{fmtFeet(leg.feet)} ÷ {feetPerMinute(s.travel.mph)} ft/min{s.travel.buffer ? ` + ${s.travel.buffer}` : ""} = {leg.minutes} min</dd>
      </dl>
      <button onClick={() => d({ type: "tab", tab: "travel" })} className="mt-2 text-[12px] text-muted underline hover:text-fg">Change your pace or use step-free routes</button>
      {leg.status !== "ok" && (
        <>
          <div className="mt-5 text-[11px] font-medium text-muted">Sections that fix this</div>
          {alts.length ? alts.map(({ x }) => (
            <div key={x.id} className="mt-1.5 flex items-center gap-3 rounded-lg border border-border p-2.5" onMouseEnter={() => d({ type: "preview", section: x.id })} onMouseLeave={() => d({ type: "preview", section: null })}>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px]"><span className="font-mono font-semibold">{x.course} {x.code}</span> · {x.profs.join(", ")}</div>
                <div className="tnum truncate text-[11.5px] text-muted">{x.meetings.map((m) => `${daysLabel(m.days)} ${fmtRange(m.start, m.end)}`).join(" · ")}</div>
              </div>
              <button onClick={() => d({ type: "add", section: x.id })} className={btn}>Switch</button>
            </div>
          )) : <p className="mt-1 text-[12px] text-muted">No other open section avoids this. Try a different course or an extra block of time.</p>}
        </>
      )}
    </div>
  );
}

// ================= calendar =================
export function Calendar({ onItem, onLeg, hourHeight = 54 }: { onItem?: (i: Item, el: HTMLElement) => void; onLeg?: (l: Leg, el: HTMLElement) => void; hourHeight?: number }) {
  const { s, d, active } = useStore();
  const info = usePlanInfo();
  const focus = s.detail?.kind === "course" ? s.detail.code : null;
  const focusLeg = s.detail?.kind === "leg" ? s.detail.key : null;
  const ghostIds = useMemo(() => {
    const g = new Set<string>();
    if (focus) sectionsOf(focus).forEach((x) => !active.sections.includes(x.id) && x.meetings.length && g.add(x.id));
    if (s.preview && !active.sections.includes(s.preview)) g.add(s.preview);
    return [...g];
  }, [focus, s.preview, active.sections]);
  const ghosts = useMemo(() => itemsFor(ghostIds), [ghostIds]);
  const items = info.items;
  const all = [...items, ...ghosts];
  const startH = Math.min(8, ...all.map((i) => Math.floor(i.start / 60)));
  const endH = Math.max(17, ...all.map((i) => Math.ceil(i.end / 60)));
  const y = (m: number) => ((m - startH * 60) / 60) * hourHeight;
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  const asyncSecs = active.sections.map((id) => SECTION_BY_ID[id]).filter((x) => !x.meetings.length);
  const focusCourse = focus ? COURSES[focus] : null;

  return (
    <div className="relative flex min-w-[560px] flex-col pb-20">
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur">
        {focusCourse && (
          <div className="fade-in flex items-center gap-2 border-b border-border bg-panel px-3 py-2 text-[12px]">
            <Dot color={focusCourse.color} />
            <span>Showing every section of <span className="font-mono font-semibold">{focusCourse.code}</span>. Click one to switch.</span>
            <span className="ml-auto flex items-center gap-1 text-muted"><Kbd>↑</Kbd><Kbd>↓</Kbd> preview <Kbd>↵</Kbd> switch <Kbd>esc</Kbd> done</span>
          </div>
        )}
        <div className="grid grid-cols-[48px_repeat(5,1fr)] border-b border-border">
          <div />
          {DAYS.map((dn) => <div key={dn} className="px-2 py-2 text-[11.5px] font-medium text-muted">{dn}</div>)}
        </div>
        {asyncSecs.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11.5px] text-muted">
            <span>No set time:</span>
            {asyncSecs.map((x) => <span key={x.id} className="rounded px-1.5 py-0.5 font-mono font-medium" style={{ background: `var(--c${COURSES[x.course].color}-bg)`, color: `var(--c${COURSES[x.course].color}-fg)` }}>{x.course} {x.code} · online</span>)}
          </div>
        )}
      </div>
      <div className="relative grid grid-cols-[48px_repeat(5,1fr)]" style={{ height: y(endH * 60) }}>
        <div className="relative">
          {hours.slice(1, -1).map((h) => <div key={h} className="tnum absolute right-2 -translate-y-1/2 text-[10.5px] text-faint" style={{ top: y(h * 60) }}>{fmt(h * 60)}</div>)}
        </div>
        {DAYS.map((_, day) => {
          const dayItems = items.filter((i) => i.day === day);
          const placed = layoutDay(dayItems);
          const placedGhosts = layoutDay(ghosts.filter((i) => i.day === day));
          return (
            <div key={day} className="relative border-l border-border">
              {hours.slice(1, -1).map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: y(h * 60) }} />)}
              {placed.map(({ item, col, cols }) => {
                const c = item.course?.color;
                const isBlock = item.kind === "block";
                const dim = !!focus && item.course?.code !== focus;
                const sel = !!focus && item.course?.code === focus;
                const h = y(item.end) - y(item.start);
                return (
                  <button key={item.key} data-keep-popover onClick={(e) => (item.course ? onItem?.(item, e.currentTarget) : d({ type: "tab", tab: "blocks" }))}
                    data-tip={item.course ? (sel ? "This is your current section" : "Click to see other sections") : "Edit in Blocks"}
                    className={clsx("absolute overflow-hidden rounded-md border px-1.5 py-1 text-left transition-opacity duration-150", dim && "opacity-30", isBlock && "stripes border-border bg-panel text-muted", sel && "ring-2 ring-fg/80")}
                    style={{ top: y(item.start) + 1, height: h - 2, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, ...(isBlock ? {} : { background: `var(--c${c}-bg)`, borderColor: `var(--c${c}-bd)`, color: `var(--c${c}-fg)` }) }}>
                    <div className="flex items-center gap-1 text-[11.5px] leading-tight">
                      <span className={clsx("truncate font-semibold", !isBlock && "font-mono")}>{item.label}</span>
                      {item.meeting?.kind && item.meeting.kind !== "Lec" && <span className="text-[10px] opacity-70">{item.meeting.kind === "Dis" ? "discussion" : "lab"}</span>}
                    </div>
                    {h > 34 && <div className="tnum truncate text-[10.5px] opacity-75">{fmtRange(item.start, item.end)}</div>}
                    {h > 50 && item.bldg && <div className="truncate text-[10.5px] opacity-75">{item.bldg} {item.room}</div>}
                  </button>
                );
              })}
              {placedGhosts.map(({ item, col, cols }) => {
                const clash = dayItems.some((o) => o.course?.code !== item.course?.code && o.start < item.end && item.start < o.end);
                const pv = s.preview === item.sectionId;
                const full = item.section!.seats.open === 0;
                const cc = item.course!.color;
                return (
                  <button key={"g" + item.key} data-keep-popover onClick={() => d({ type: "add", section: item.sectionId! })}
                    onMouseEnter={() => d({ type: "preview", section: item.sectionId! })} onMouseLeave={() => d({ type: "preview", section: null })}
                    data-tip={`Switch to ${item.section!.code}`} data-tip-sub={`${item.section!.profs.join(", ")} · ${seatWords(item.section!).text}${clash ? " · overlaps another class" : ""}`} data-keys="↵"
                    className={clsx("fade-in absolute z-10 overflow-hidden rounded-md border-2 border-dashed px-1.5 py-1 text-left", pv && "z-20 border-solid shadow-md")}
                    style={{ top: y(item.start) + 1, height: y(item.end) - y(item.start) - 2, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`,
                      borderColor: clash ? "var(--err)" : `var(--c${cc}-bd)`, color: clash ? "var(--err)" : `var(--c${cc}-fg)`,
                      background: pv ? `var(--c${cc}-bg)` : clash ? "var(--err-soft)" : `color-mix(in oklab, var(--c${cc}-bg) 45%, transparent)` }}>
                    <div className="font-mono text-[11.5px] font-semibold">{item.section!.code}</div>
                    <div className="truncate text-[10.5px] opacity-80">{item.section!.profs.join(", ")}</div>
                    {full ? <div className="text-[10.5px] font-medium">Full</div> : clash ? <div className="text-[10.5px] font-medium">Overlaps</div> : null}
                  </button>
                );
              })}
              {info.legs.filter((l) => l.day === day).map((l) => (
                <button key={l.key} data-keep-popover onClick={(e) => onLeg?.(l, e.currentTarget)}
                  data-tip={`${LEG_WORDS[l.status]}: ${l.minutes} min to get from ${l.from.bldg} to ${l.to.bldg}`} data-tip-sub={`${l.gap} min between classes · ${fmtFeet(l.feet)} at ${s.travel.mph} mph · click for details`}
                  className={clsx("tnum absolute left-1/2 z-20 flex h-[19px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border bg-raised px-1.5 text-[10.5px] whitespace-nowrap shadow-sm",
                    { ok: "border-border text-muted", tight: "border-warn/50 text-warn", short: "border-err/60 text-err" }[l.status], focusLeg === l.key && "ring-2 ring-fg/70")}
                  style={{ top: y(l.from.end + l.gap / 2) }}>
                  <Route size={10} />{l.minutes} min
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= toast with undo =================
export function Toast() {
  const { s, d } = useStore();
  const [shown, setShown] = useState(s.toast);
  useEffect(() => {
    if (!s.toast) return;
    setShown(s.toast);
    const t = setTimeout(() => setShown(null), 4000);
    return () => clearTimeout(t);
  }, [s.toast]);
  if (!shown) return null;
  return (
    <div key={shown.id} data-keep-popover className="pop-in fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-raised py-2 pr-2 pl-3 text-[12.5px] shadow-[var(--shadow)]">
      {shown.text}
      {shown.undo && <button onClick={() => { d({ type: "undo" }); setShown(null); }} className={btn} data-tip="Undo" data-keys="⌘ Z"><Undo2 size={13} />Undo</button>}
    </div>
  );
}

// ================= floating card (for the popover variant) =================
export function Popover({ anchor, children, onClose, width = 380 }: { anchor: Anchor; children: ReactNode; onClose: () => void; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor ?? { x: window.innerWidth / 2 - width / 2, y: 120, w: 0, h: 0 };
    const h = Math.min(ref.current?.offsetHeight ?? 400, window.innerHeight - 24);
    let left = a.x + a.w + 10;
    if (left + width > window.innerWidth - 12) left = a.x - width - 10;
    if (left < 12) left = Math.min(window.innerWidth - width - 12, a.x + 20);
    const top = Math.max(60, Math.min(a.y - 16, window.innerHeight - h - 12));
    setPos({ left, top });
  }, [anchor, width, children]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest("[data-keep-popover]")) return;
      onClose();
    };
    const id = setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", h); };
  }, [onClose]);
  return (
    <div ref={ref} className="pop-in scroll-thin fixed z-40 max-h-[calc(100%-80px)] overflow-y-auto rounded-xl border border-border bg-raised shadow-[var(--shadow)]"
      style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
      {children}
    </div>
  );
}

export const CloseButton = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg" data-tip="Close" data-keys="esc"><X size={15} /></button>
);
export const BackButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button onClick={onClick} className="flex h-7 items-center gap-1 rounded-md pr-2 pl-1 text-[12.5px] text-muted hover:bg-hover hover:text-fg" data-tip="Go back" data-keys="esc"><ArrowLeft size={14} />{label}</button>
);
