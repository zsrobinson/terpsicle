// PROTOTYPE review: the Drill-in app (round 2, variant 1) with each open question as a design switch.
import clsx from "clsx";
import {
  Accessibility, ArrowLeft, Bell, Bookmark, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleAlert, CircleX, Copy, Image, Info,
  Layers, LayoutList, Link2, Plus, Route, Search, Settings2, Share2, SlidersHorizontal, Sparkles, Square, TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DAY_NAMES, LEG_WORDS, PACES, daysLabel, feetPerMinute, fitOf, fmt, fmtFeet, fmtRange, itemsFor, legsFor, problems as findProblems, search, type Problem } from "../core";
import { COURSES, DAYS, SECTION_BY_ID, TERM, sectionsOf, type Day } from "../data";
import { useStore, type Tab } from "../store";
import { Dot, Kbd, LegRow, Logo, SeatText, btn, useAppKeys, usePlanInfo } from "../ui";
import { AppUICtx, Calendar, FRIEND_PLAN, useUI, type AppUI } from "./calendar";
import { useDesign } from "./design";
import { CourseDetailR, LegDetailR, ResultDetail } from "./detail";
import { generatePlans } from "./gen";

type RTab = Tab | "generate";

export function ReviewApp({ shared = false }: { shared?: boolean }) {
  const design = useDesign();
  const { s } = useStore();
  const [hoverCourse, setHoverCourse] = useState<string | null>(null);
  const [finals, setFinals] = useState(!!design._startFinals);
  const [compareId, setCompareId] = useState<string | null>(design._startCompare ? "b" : null);
  const [result, setResult] = useState<AppUI["result"]>(null);
  const [collapsed, setCollapsed] = useState(false);
  const tabs = useTabs();
  useAppKeys(tabs.map((t) => t.id));
  useEffect(() => {
    if (!design.collapsible) return;
    const h = (e: KeyboardEvent) => { if (e.key === "[" && !(e.target as HTMLElement).closest("input,textarea")) setCollapsed((c) => !c); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [design.collapsible]);
  const ui: AppUI = { hoverCourse, setHoverCourse, finals, setFinals, compareId, setCompareId, result, setResult, collapsed, setCollapsed, shared };
  return (
    <AppUICtx.Provider value={ui}>
      <div className={clsx("flex h-full flex-col bg-bg text-fg", `accent-${design.accent}`)} style={design.density === "comfortable" ? { zoom: 1.1 } : undefined}>
        <TopBar />
        {shared && <SharedBanner />}
        <div className="flex min-h-0 flex-1">
          {design.rail !== "top" && <Rail />}
          {!collapsed && (
            <aside className="flex w-[360px] shrink-0 flex-col border-r border-border">
              {design.rail === "top" && <TopTabs />}
              <Sidebar />
            </aside>
          )}
          <main className="scroll-thin relative min-w-0 flex-1 overflow-auto">
            {design.travelSettings === "header" && <TravelHeader />}
            {design.compare === "split" && compareId ? <SplitCompare /> : <Calendar />}
          </main>
        </div>
      </div>
      {s.toast && null}
    </AppUICtx.Provider>
  );
}

// ---------------- top bar ----------------
function TopBar() {
  const design = useDesign();
  const ui = useUI();
  const { s, d, active } = useStore();
  const info = usePlanInfo();
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const errs = info.probs.filter((p) => p.severity !== "info").length;
  const planActions = (id: string) => [
    { label: "Rename", run: () => setEditing(id) },
    { label: "Duplicate", run: () => d({ type: "duplicatePlan", id }) },
    ...(design.compare !== "none" ? s.plans.filter((p) => p.id !== id).map((p) => ({ label: `Compare with ${p.name}`, run: () => ui.setCompareId(p.id) })) : []),
    { label: "Delete", danger: true, disabled: s.plans.length === 1, run: () => d({ type: "deletePlan", id }) },
  ];
  const newPlan = (
    <NewPlanButton />
  );
  return (
    <header className="relative flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <Logo />
      <span className="ml-2 text-faint">/</span>
      <button className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] text-muted hover:bg-hover hover:text-fg" data-tip="Switch term">{TERM.name}<ChevronDown size={12} /></button>
      <span className="text-faint">/</span>
      {design.planNav === "tabs" && (
        <nav className="flex min-w-0 items-center gap-0.5">
          {s.plans.map((p) => {
            const on = p.id === s.activeId;
            return (
              <div key={p.id} className={clsx("relative flex h-8 shrink-0 items-center rounded-md", on ? "bg-hover" : "hover:bg-hover/60")}>
                {editing === p.id ? <RenameInput id={p.id} name={p.name} onDone={() => setEditing(null)} /> : (
                  <button onClick={() => d({ type: "setActive", id: p.id })} onDoubleClick={() => setEditing(p.id)} data-tip={on ? "Double-click to rename" : `Open ${p.name}`}
                    className={clsx("h-8 pl-2.5 text-[12.5px]", on ? "pr-1 font-medium" : "pr-2.5 text-muted")}>{p.name}</button>
                )}
                {on && editing !== p.id && <button onClick={() => setMenu(menu === p.id ? null : p.id)} className="mr-1 flex size-6 items-center justify-center rounded text-muted hover:bg-raised hover:text-fg" data-tip="Plan options"><ChevronDown size={13} /></button>}
                {menu === p.id && <Menu onClose={() => setMenu(null)} items={planActions(p.id)} />}
              </div>
            );
          })}
          {newPlan}
        </nav>
      )}
      {design.planNav === "dropdown" && (
        <div className="relative">
          <button onClick={() => setMenu(menu ? null : "dd")} className="flex h-8 items-center gap-1.5 rounded-md bg-hover px-2.5 text-[12.5px] font-medium">{active.name}<span className="font-normal text-muted">· {s.plans.length} plans</span><ChevronDown size={13} className="text-muted" /></button>
          {menu === "dd" && (
            <Menu onClose={() => setMenu(null)} width={240} items={[
              ...s.plans.map((p) => ({ label: p.name, check: p.id === s.activeId, hint: `${p.sections.length} courses`, run: () => d({ type: "setActive", id: p.id }) })),
              { sep: true, label: "", run: () => {} },
              { label: "New empty plan", run: () => d({ type: "newPlan" }) },
              ...planActions(s.activeId).map((a) => ({ ...a, label: a.label === "Rename" ? `Rename ${active.name}` : a.label === "Duplicate" ? `Duplicate ${active.name}` : a.label === "Delete" ? `Delete ${active.name}` : a.label })),
            ]} />
          )}
          {editing && <div className="absolute top-0 left-0"><RenameInput id={editing} name={active.name} onDone={() => setEditing(null)} /></div>}
        </div>
      )}
      {design.planNav === "panel" && <span className="text-[12.5px] font-medium">{active.name}</span>}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {design.freshness === "topbar" && <span className="hidden items-center gap-1.5 text-[11.5px] text-muted md:flex" data-tip="Seat counts refresh every few minutes"><span className="size-1.5 animate-pulse rounded-full bg-ok" />Seats as of 2 min ago</span>}
        <span className="tnum hidden text-[12.5px] text-muted sm:inline"><span className="font-medium text-fg">{info.credits}</span> credits</span>
        <button onClick={() => d({ type: "tab", tab: design.problems === "inline" ? "plan" : "problems" })} data-tip="See what needs attention"
          className={clsx("flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px]", errs ? "bg-err-soft text-err" : "text-ok")}>
          {errs ? <CircleAlert size={14} /> : <CheckCircle2 size={14} />}{errs ? `${errs} problem${errs > 1 ? "s" : ""}` : "No problems"}
        </button>
      </div>
    </header>
  );
}

function NewPlanButton() {
  const design = useDesign();
  const { s, d } = useStore();
  const [open, setOpen] = useState(false);
  const click = () => (design.newPlan === "empty" ? d({ type: "newPlan" }) : design.newPlan === "copy" ? d({ type: "duplicatePlan", id: s.activeId }) : setOpen(!open));
  return (
    <div className="relative">
      <button onClick={click} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg" data-tip={design.newPlan === "copy" ? "New plan (copy of this one)" : "New plan"}><Plus size={15} /></button>
      {open && <Menu onClose={() => setOpen(false)} width={220} items={[
        { label: "Start empty", hint: "No courses yet", run: () => d({ type: "newPlan" }) },
        { label: `Copy ${s.plans.find((p) => p.id === s.activeId)!.name}`, hint: "Try changes without losing this one", run: () => d({ type: "duplicatePlan", id: s.activeId }) },
        ...(design.generate === "tab" ? [{ label: "Generate plans…", hint: "From a list of courses", run: () => d({ type: "tab", tab: "generate" as Tab }) }] : []),
      ]} />}
    </div>
  );
}

function RenameInput({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const { d } = useStore();
  return (
    <input autoFocus defaultValue={name} id={"rn-" + id}
      onBlur={(e) => { d({ type: "renamePlan", id, name: e.target.value }); onDone(); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onDone(); }}
      className="h-8 w-32 rounded border border-border-strong bg-raised px-2 text-[12.5px] outline-none" />
  );
}

type MenuItem = { label: string; run: () => void; danger?: boolean; disabled?: boolean; hint?: string; check?: boolean; sep?: boolean };
function Menu({ items, onClose, width = 180, align = "left" }: { items: MenuItem[]; onClose: () => void; width?: number; align?: "left" | "right" }) {
  useEffect(() => {
    const h = () => onClose();
    const t = setTimeout(() => document.addEventListener("click", h), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", h); };
  }, [onClose]);
  return (
    <div className={clsx("pop-in absolute top-9 z-50 rounded-lg border border-border bg-raised p-1 shadow-[var(--shadow)]", align === "left" ? "left-0" : "right-0")} style={{ width }}>
      {items.map((it, i) => it.sep ? <div key={i} className="my-1 h-px bg-border" /> : (
        <button key={i} disabled={it.disabled} onClick={() => { it.run(); onClose(); }}
          className={clsx("flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-hover disabled:opacity-40", it.danger && "text-err")}>
          {it.check !== undefined && <span className={clsx("size-1.5 rounded-full", it.check ? "bg-fg" : "bg-transparent")} />}
          <span className="flex-1">{it.label}{it.hint && <span className="block text-[11px] text-muted">{it.hint}</span>}</span>
        </button>
      ))}
    </div>
  );
}

function SharedBanner() {
  const design = useDesign();
  const { d } = useStore();
  const text = { readonly: "You're viewing Alex's plan from a shared link. Nothing here changes your plans.", newPlan: "Alex's plan was added to your plans. You can edit it or delete it.", overlay: "Alex's classes are shown on top of your plan." }[design.shared];
  return (
    <div className="flex items-center gap-3 border-b border-border bg-accent-soft px-4 py-2 text-[12.5px]">
      <Share2 size={14} className="text-accent" /><span>{text}</span>
      <div className="ml-auto flex gap-2">
        {design.shared === "readonly" && <><button className={btn} onClick={() => d({ type: "planFrom", sections: FRIEND_PLAN, name: "Alex's plan" })}>Save a copy</button><button className={btn}>Overlay on my plan</button></>}
        {design.shared === "overlay" && <button className={btn}>Hide Alex's classes</button>}
      </div>
    </div>
  );
}

// ---------------- rail / tabs ----------------
function useTabs() {
  const design = useDesign();
  const tabs: { id: RTab; label: string; icon: ReactNode }[] = [
    { id: "plan", label: design.firstTab, icon: <LayoutList size={17} /> },
    { id: "search", label: "Search", icon: <Search size={17} /> },
    ...(design.problems !== "inline" ? [{ id: "problems" as RTab, label: "Problems", icon: <CircleAlert size={17} /> }] : []),
    { id: "travel", label: "Travel", icon: <Route size={17} /> },
    { id: "blocks", label: "Blocks", icon: <Square size={17} /> },
    ...(design.generate === "tab" ? [{ id: "generate" as RTab, label: "Generate", icon: <Layers size={17} /> }] : []),
    { id: "export", label: "Export", icon: <Share2 size={17} /> },
  ];
  return tabs;
}

function Rail() {
  const design = useDesign();
  const ui = useUI();
  const { s, d } = useStore();
  const tabs = useTabs();
  const info = usePlanInfo();
  const errs = info.probs.filter((p) => p.severity !== "info").length;
  const icons = design.rail === "icons";
  return (
    <aside className={clsx("flex shrink-0 flex-col items-center gap-0.5 border-r border-border bg-panel py-2", icons ? "w-[52px]" : "w-[62px]")}>
      {tabs.map((t, i) => (
        <button key={t.id} onClick={() => { if (design.collapsible && s.tab === t.id && !s.detail && !ui.result && !ui.collapsed) { ui.setCollapsed(true); return; } ui.setCollapsed(false); ui.setResult(null); d({ type: "tab", tab: t.id as Tab }); }} data-tip={design.collapsible && s.tab === t.id && !ui.collapsed ? `${t.label} (click again to hide the sidebar)` : t.label} data-keys={String(i + 1)}
          className={clsx("relative flex flex-col items-center gap-1 rounded-lg", icons ? "size-10 justify-center" : "w-[54px] py-2", s.tab === t.id ? "bg-raised text-fg shadow-sm ring-1 ring-border" : "text-muted hover:bg-hover hover:text-fg")}>
          {t.icon}
          {!icons && <span className="text-[10px] font-medium">{t.label}</span>}
          {t.id === "problems" && errs > 0 && <span className="tnum absolute top-1 right-1.5 min-w-[15px] rounded-full bg-err px-1 text-center font-mono text-[9px] leading-[15px] text-white">{errs}</span>}
        </button>
      ))}
    </aside>
  );
}

function TopTabs() {
  const { s, d } = useStore();
  const ui = useUI();
  const tabs = useTabs();
  return (
    <div className="scroll-thin flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-2 pt-2">
      {tabs.map((t, i) => (
        <button key={t.id} onClick={() => { ui.setResult(null); d({ type: "tab", tab: t.id as Tab }); }} data-keys={String(i + 1)} data-tip={t.label}
          className={clsx("-mb-px h-9 shrink-0 border-b-2 px-2 text-[12.5px]", s.tab === t.id ? "border-fg font-medium" : "border-transparent text-muted hover:text-fg")}>{t.label}</button>
      ))}
    </div>
  );
}

// ---------------- sidebar with drill-in ----------------
function Sidebar() {
  const design = useDesign();
  const ui = useUI();
  const { s, d, active } = useStore();
  const tabs = useTabs();
  const from = tabs.find((t) => t.id === s.tab)?.label ?? "Back";
  if (ui.result) {
    return <Drilled label={from} onBack={() => ui.setResult(null)} title="Suggested plan"><ResultDetail /></Drilled>;
  }
  if (s.detail) {
    const code = s.detail.kind === "course" ? s.detail.code : null;
    const planCourses = active.sections.map((id) => SECTION_BY_ID[id].course);
    const idx = code ? planCourses.indexOf(code) : -1;
    return (
      <Drilled key={JSON.stringify(s.detail)} label={from} onBack={() => d({ type: "close" })} title={code ?? "Connection"}
        nav={design.drillHeader === "backNav" && idx >= 0 ? { i: idx, n: planCourses.length, go: (k: number) => d({ type: "open", detail: { kind: "course", code: planCourses[(k + planCourses.length) % planCourses.length] } }) } : undefined}>
        {s.detail.kind === "course" ? <CourseDetailR code={s.detail.code} /> : <LegDetailR legKey={s.detail.key} />}
      </Drilled>
    );
  }
  const tab = s.tab as RTab;
  return (
    <>
      {tab === "plan" && <PlanPanel />}
      {tab === "search" && <SearchPanel />}
      {tab === "problems" && <ProblemsPanel />}
      {tab === "travel" && <TravelPanel />}
      {tab === "blocks" && <BlocksPanel />}
      {tab === "export" && <ExportPanel />}
      {tab === ("generate" as Tab) && <GeneratePanel />}
    </>
  );
}

function Drilled({ label, onBack, title, children, nav }: { label: string; onBack: () => void; title: string; children: ReactNode; nav?: { i: number; n: number; go: (k: number) => void } }) {
  const design = useDesign();
  return (
    <div className="slide-in flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        {design.drillHeader === "breadcrumb" ? (
          <div className="flex items-center gap-1 px-1 text-[12.5px]">
            <button onClick={onBack} className="rounded px-1 text-muted hover:bg-hover hover:text-fg" data-tip="Go back" data-keys="esc">{label}</button>
            <ChevronRight size={13} className="text-faint" /><span className="font-mono font-medium">{title}</span>
          </div>
        ) : (
          <button onClick={onBack} className="flex h-7 items-center gap-1 rounded-md pr-2 pl-1 text-[12.5px] text-muted hover:bg-hover hover:text-fg" data-tip="Go back" data-keys="esc"><ArrowLeft size={14} />{label}</button>
        )}
        {nav && (
          <div className="ml-auto flex items-center gap-1 text-[11.5px] text-muted">
            <button onClick={() => nav.go(nav.i - 1)} className="flex size-7 items-center justify-center rounded-md hover:bg-hover" data-tip="Previous course in your plan"><ChevronLeft size={15} /></button>
            <span className="tnum">{nav.i + 1} of {nav.n}</span>
            <button onClick={() => nav.go(nav.i + 1)} className="flex size-7 items-center justify-center rounded-md hover:bg-hover" data-tip="Next course in your plan"><ChevronRight size={15} /></button>
          </div>
        )}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

export function PanelHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-4 py-2">
      <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold">{title}</div>{sub && <div className="truncate text-[11.5px] text-muted">{sub}</div>}</div>
      {right}
    </div>
  );
}
export const Label = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="flex items-baseline justify-between px-4 pt-4 pb-1.5 text-[11px] font-medium text-muted"><span>{children}</span>{right}</div>;

// ---------------- panels ----------------
function PlanPanel() {
  const design = useDesign();
  const ui = useUI();
  const { s, d, active } = useStore();
  const info = usePlanInfo();
  const probCourses = new Set(info.probs.filter((p) => p.severity !== "info").map((p) => p.course));
  const errs = info.probs.filter((p) => p.severity !== "info");
  const shownSections = ui.shared && design.shared === "readonly" ? FRIEND_PLAN : active.sections;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title={ui.shared && design.shared === "readonly" ? "Alex's plan" : active.name} sub={`${shownSections.length} courses · ${info.credits} credits`} />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {design.planNav === "panel" && (
          <>
            <Label right={<button onClick={() => d({ type: "newPlan" })} className="text-[11.5px] text-muted hover:text-fg">+ New</button>}>Your plans</Label>
            <div className="px-2">
              {s.plans.map((p) => (
                <button key={p.id} onClick={() => d({ type: "setActive", id: p.id })} className={clsx("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]", p.id === s.activeId ? "bg-hover font-medium" : "text-muted hover:bg-hover/60")}>
                  <span className={clsx("size-1.5 rounded-full", p.id === s.activeId ? "bg-fg" : "bg-transparent")} />{p.name}<span className="ml-auto text-[11px] text-faint">{p.sections.length} courses</span>
                </button>
              ))}
            </div>
            <Label>In {active.name}</Label>
          </>
        )}
        {design.problems === "banner" && errs.length > 0 && (
          <button onClick={() => d({ type: "tab", tab: "problems" })} className="mx-3 mt-3 flex w-[calc(100%-24px)] items-start gap-2 rounded-lg bg-err-soft p-3 text-left text-[12.5px] text-err">
            <CircleAlert size={15} className="mt-px shrink-0" /><span><b>{errs.length} problems.</b> {errs[0].title}{errs.length > 1 && ` and ${errs.length - 1} more`}.<span className="mt-0.5 block underline">See all</span></span>
          </button>
        )}
        {design.problems === "inline" && info.probs.length > 0 && (
          <div className="mx-3 mt-3 overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2 text-[12px] font-medium"><CircleAlert size={14} className="text-err" />Needs attention</div>
            <ProblemList probs={info.probs} />
          </div>
        )}
        {!shownSections.length && <FirstRun />}
        {s.plans.find((p) => p.id === s.activeId)?.name === "Example plan" && (
          <div className="mx-3 mt-3 rounded-lg border border-border bg-panel p-3 text-[12.5px]">
            <b>This is an example plan</b> so you can look around. <span className="text-muted">Edit it freely, or</span>
            <button onClick={() => d({ type: "newPlan" })} className={clsx(btn, "mt-2")}>Start my own plan</button>
          </div>
        )}
        <ul>
          {shownSections.map((id) => {
            const sec = SECTION_BY_ID[id];
            const c = COURSES[sec.course];
            return (
              <li key={id}>
                <button onClick={() => d({ type: "open", detail: { kind: "course", code: c.code } })} className="w-full border-b border-border px-4 py-2.5 text-left hover:bg-hover" data-tip="See sections and details">
                  <div className="flex items-center gap-2">
                    <Dot color={c.color} /><span className="font-mono text-[12.5px] font-semibold">{c.code}</span><span className="font-mono text-[11.5px] text-muted">{sec.code}</span>
                    {probCourses.has(c.code) && <TriangleAlert size={12} className="text-warn" />}
                    <span className="ml-auto"><SeatDisplay secId={id} /></span>
                  </div>
                  <div className="mt-0.5 truncate pl-4 text-[12px] text-muted">{c.title}</div>
                  <div className="mt-0.5 truncate pl-4 text-[11.5px] text-muted">{sec.profs.join(", ")} · {sec.meetings.length ? sec.meetings.map((m) => daysLabel(m.days)).join(" + ") : "Online"}</div>
                </button>
              </li>
            );
          })}
        </ul>
        {shownSections.length > 0 && (
          <>
            <Label>Saved for later</Label>
            {s.shortlist.length ? s.shortlist.map((code) => (
              <button key={code} onClick={() => d({ type: "open", detail: { kind: "course", code } })} className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-hover">
                <Bookmark size={12} className="text-muted" /><span className="font-mono text-[12.5px] font-semibold">{code}</span><span className="truncate text-[12px] text-muted">{COURSES[code].title}</span>
              </button>
            )) : <p className="px-4 text-[12px] text-faint">Courses you save from search show up here.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function FirstRun() {
  const design = useDesign();
  const { d } = useStore();
  if (design.firstRun !== "guide") return null;
  const steps = [
    ["Find your courses", "Search by course code, title or instructor."],
    ["Pick sections on the calendar", "Every section shows up at once. Click the one that fits."],
    ["Fix anything flagged", "Overlaps, tight connections and full sections show up in Problems."],
    ["Export for registration", "Copy your section codes into Testudo."],
  ];
  return (
    <div className="m-3 rounded-xl border border-border p-4">
      <div className="text-[14px] font-semibold">Build your {TERM.name} schedule</div>
      <ol className="mt-3 space-y-3">
        {steps.map(([a, b], i) => (
          <li key={a} className="flex gap-3">
            <span className={clsx("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", i === 0 ? "bg-fg text-bg" : "bg-hover text-muted")}>{i + 1}</span>
            <span><span className="block text-[12.5px] font-medium">{a}</span><span className="block text-[12px] text-muted">{b}</span></span>
          </li>
        ))}
      </ol>
      <button onClick={() => { d({ type: "tab", tab: "search" }); setTimeout(() => document.getElementById("r-search")?.focus(), 0); }} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[12.5px] font-medium text-accent-fg"><Search size={14} />Search for a course</button>
      {design.generate === "tab" && <button onClick={() => d({ type: "tab", tab: "generate" as Tab })} className="mt-2 w-full text-center text-[12px] text-muted underline hover:text-fg">Or generate plans from a list of courses</button>}
    </div>
  );
}

export function SeatDisplay({ secId, compact }: { secId: string; compact?: boolean }) {
  const design = useDesign();
  const sec = SECTION_BY_ID[secId];
  const { open, total } = sec.seats;
  if (design.seats === "lowOnly" && open > 3) return null;
  if (design.seats === "meter") {
    const pct = Math.round(((total - open) / total) * 100);
    return (
      <span className="inline-flex items-center gap-2">
        {!compact && <span className="h-1.5 w-12 overflow-hidden rounded-full bg-hover"><span className={clsx("block h-full", open === 0 ? "bg-err" : open <= 3 ? "bg-warn" : "bg-fg/40")} style={{ width: `${pct}%` }} /></span>}
        <SeatText s={sec} />
      </span>
    );
  }
  return <SeatText s={sec} />;
}

const GENEDS = ["DSHU", "DSNS", "DSSP", "DSHS", "SCIS", "DVUP", "FSPW"];
function SearchPanel() {
  const design = useDesign();
  const ui = useUI();
  const { s, d, active } = useStore();
  const [q, setQ] = useState("");
  const [ge, setGe] = useState<string[]>([]);
  const [fitsOnly, setFitsOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [pop, setPop] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["CMSC131"]));
  const fitKind = (id: string) => fitOf(SECTION_BY_ID[id], active.sections, active.blocks, s.travel).kind;
  const good = (k: string) => ["fits", "tight", "current", "none"].includes(k);
  const hits = useMemo(() => search(q, ge).map((h) => ({ ...h, sections: h.sections.filter((x) => (!openOnly || x.seats.open > 0) && (!fitsOnly || good(fitKind(x.id)))) })).filter((h) => h.sections.length), [q, ge, fitsOnly, openOnly, active, s.travel]);
  const nFilters = ge.length + (fitsOnly ? 1 : 0) + (openOnly ? 1 : 0);
  const hoverProps = (code: string) => design.searchHover === "on" ? { onMouseEnter: () => ui.setHoverCourse(code), onMouseLeave: () => ui.setHoverCourse(null) } : {};
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <div className="flex gap-2">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border bg-raised px-2.5 focus-within:border-border-strong">
            <Search size={14} className="text-muted" />
            <input id="r-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Course, title or instructor" className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
            <span data-tip="Jump to search from anywhere" data-keys="/"><Kbd>/</Kbd></span>
          </div>
          {design.filters === "popover" && (
            <div className="relative">
              <button onClick={() => setPop(!pop)} className={clsx(btn, "h-9")}><SlidersHorizontal size={14} />Filters{nFilters > 0 && <span className="tnum rounded bg-fg px-1 text-[10.5px] text-bg">{nFilters}</span>}</button>
              {pop && (
                <div className="pop-in absolute top-10 right-0 z-50 w-64 rounded-lg border border-border bg-raised p-3 shadow-[var(--shadow)]">
                  <div className="text-[11px] font-medium text-muted">Gen-eds</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">{GENEDS.map((g) => <GenedChip key={g} g={g} on={ge.includes(g)} toggle={() => setGe((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]))} />)}</div>
                  <label className="mt-3 flex items-center gap-2 text-[12.5px]"><input type="checkbox" id="pf-fits" checked={fitsOnly} onChange={(e) => setFitsOnly(e.target.checked)} />Fits my plan</label>
                  <label className="mt-1.5 flex items-center gap-2 text-[12.5px]"><input type="checkbox" id="pf-open" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />Has open seats</label>
                  <div className="mt-3 text-[11px] font-medium text-muted">Credits</div>
                  <div className="mt-1.5 flex gap-1">{["1–2", "3", "4+"].map((c) => <span key={c} className="h-6 rounded border border-border px-2 text-[11px] leading-6 text-muted">{c}</span>)}</div>
                </div>
              )}
            </div>
          )}
        </div>
        {design.filters !== "popover" && <div className="mt-2.5 flex flex-wrap gap-1">{GENEDS.map((g) => <GenedChip key={g} g={g} on={ge.includes(g)} toggle={() => setGe((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]))} />)}</div>}
        {design.filters === "inline" && (
          <div className="mt-2 flex gap-1.5">
            <Toggle on={fitsOnly} onClick={() => setFitsOnly(!fitsOnly)}>Fits my plan</Toggle>
            <Toggle on={openOnly} onClick={() => setOpenOnly(!openOnly)}>Has open seats</Toggle>
          </div>
        )}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {!q && !ge.length && design.firstRun === "search" && !active.sections.length && <div className="px-4 pt-3 text-[11px] font-medium text-muted">Popular this term</div>}
        {design.searchResults === "sections"
          ? hits.flatMap(({ course: c, sections }) => [
              <div key={c.code} className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-panel px-4 py-1.5 text-[11.5px]"><span className="font-mono font-semibold">{c.code}</span><span className="truncate text-muted">{c.title}</span></div>,
              ...sections.map((x) => <SectionLine key={x.id} id={x.id} />),
            ])
          : hits.map(({ course: c, sections }) => {
              const fits = sections.filter((x) => good(fitKind(x.id))).length;
              const inPlan = active.sections.some((id) => SECTION_BY_ID[id].course === c.code);
              const open = expanded.has(c.code);
              return (
                <div key={c.code} className="border-b border-border" {...hoverProps(c.code)}>
                  <div className="flex">
                    {design.searchResults === "expand" && (
                      <button onClick={() => setExpanded((x) => { const n = new Set(x); n.has(c.code) ? n.delete(c.code) : n.add(c.code); return n; })} className="pl-3 text-muted" data-tip={open ? "Hide sections" : "Show sections"}>
                        <ChevronRight size={14} className={clsx("transition-transform", open && "rotate-90")} />
                      </button>
                    )}
                    <button onClick={() => d({ type: "open", detail: { kind: "course", code: c.code } })} className="block min-w-0 flex-1 px-4 py-2.5 text-left hover:bg-hover">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12.5px] font-semibold">{c.code}</span><span className="tnum text-[11px] text-faint">{c.credits} cr</span>
                        {c.geneds.map((g) => <span key={g} className="rounded border border-border px-1 font-mono text-[10px] text-muted">{g}</span>)}
                        {inPlan && <span className="ml-auto text-[11px] text-accent">In plan</span>}
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px]">{c.title}</div>
                      <div className="tnum mt-0.5 text-[11.5px] text-muted">{sections.length} section{sections.length > 1 ? "s" : ""} · <span className={fits ? "text-ok" : "text-faint"}>{fits} fit your plan</span></div>
                    </button>
                  </div>
                  {design.searchResults === "expand" && open && <div className="pb-1">{sections.map((x) => <SectionLine key={x.id} id={x.id} indent />)}</div>}
                </div>
              );
            })}
        {!hits.length && <div className="p-4 text-[12.5px] text-muted">Nothing matches. Try a course code like CMSC351, or clear a filter.</div>}
      </div>
    </div>
  );
}

function SectionLine({ id, indent }: { id: string; indent?: boolean }) {
  const { s, d, active } = useStore();
  const x = SECTION_BY_ID[id];
  const fit = fitOf(x, active.sections, active.blocks, s.travel);
  return (
    <div onMouseEnter={() => d({ type: "preview", section: id })} onMouseLeave={() => d({ type: "preview", section: null })} className={clsx("flex items-center gap-2 py-1.5 pr-3 hover:bg-hover", indent ? "pl-10" : "pl-4")}>
      <div className="min-w-0 flex-1">
        <div className="text-[12px]"><span className="font-mono font-semibold">{x.code}</span> · {x.profs.join(", ")}</div>
        <div className="tnum truncate text-[11px] text-muted">{x.meetings.length ? x.meetings.map((m) => `${daysLabel(m.days)} ${fmtRange(m.start, m.end)}`).join(" · ") : "Online"}</div>
        <FitWords kind={fit.kind} label={fit.label} />
      </div>
      {fit.kind === "current" ? <span className="text-[11px] text-accent">Current</span> : <button onClick={() => d({ type: "add", section: id })} className={clsx(btn, "h-6 px-2 text-[11px]")}>Add</button>}
    </div>
  );
}
export const FitWords = ({ kind, label }: { kind: string; label: string }) => (
  <span className={clsx("text-[11px]", { current: "text-accent", fits: "text-ok", tight: "text-warn", clash: "text-err", short: "text-err", none: "text-muted" }[kind])}>{label}</span>
);
const GenedChip = ({ g, on, toggle }: { g: string; on: boolean; toggle: () => void }) => (
  <button onClick={toggle} data-tip={`Only courses that count for ${g}`} className={clsx("h-6 rounded-md border px-1.5 font-mono text-[10.5px]", on ? "border-transparent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}>{g}</button>
);
const Toggle = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} className={clsx("flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px]", on ? "border-transparent bg-fg text-bg" : "border-border text-muted hover:text-fg")}>
    <span className={clsx("size-1.5 rounded-full", on ? "bg-ok" : "bg-faint")} />{children}
  </button>
);

function ProblemsPanel() {
  const design = useDesign();
  const info = usePlanInfo();
  const { d } = useStore();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Problems" sub="Everything in this plan that needs a look" />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <ProblemList probs={info.probs} />
        {design.generate === "fromProblems" && info.probs.some((p) => p.severity === "error") && (
          <div className="m-4 rounded-lg border border-border p-3">
            <div className="text-[12.5px] font-medium">Can't fix these one at a time?</div>
            <p className="mt-0.5 text-[12px] text-muted">We'll look at every combination of sections for your courses and suggest plans without these problems.</p>
            <button onClick={() => d({ type: "tab", tab: "generate" as Tab })} className={clsx(btn, "mt-2")}><Layers size={13} />Suggest better plans</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProblemList({ probs }: { probs: Problem[] }) {
  const design = useDesign();
  const { d } = useStore();
  if (!probs.length) return <div className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-muted"><CheckCircle2 size={15} className="text-ok" />Nothing to fix. This plan works.</div>;
  const groups: { title: string; items: Problem[] }[] =
    design.problemGroup === "course"
      ? [...new Set(probs.map((p) => p.course ?? "Other"))].map((c) => ({ title: c, items: probs.filter((p) => (p.course ?? "Other") === c) }))
      : design.problemGroup === "day"
        ? [...DAY_NAMES.map((dn) => ({ title: dn, items: probs.filter((p) => p.detail.includes(dn)) })), { title: "Any day", items: probs.filter((p) => !DAY_NAMES.some((dn) => p.detail.includes(dn))) }].filter((g) => g.items.length)
        : [{ title: "", items: probs }];
  return (
    <div>
      {groups.map((g) => (
        <div key={g.title}>
          {g.title && <div className="border-b border-border bg-panel px-4 py-1.5 font-mono text-[11px] font-semibold">{g.title}</div>}
          <ul className="divide-y divide-border">
            {g.items.map((p) => (
              <li key={g.title + p.id} className="flex gap-3 px-4 py-3 hover:bg-hover">
                {p.severity === "error" ? <CircleX size={15} className="mt-px shrink-0 text-err" /> : p.severity === "warning" ? <TriangleAlert size={15} className="mt-px shrink-0 text-warn" /> : <Info size={15} className="mt-px shrink-0 text-muted" />}
                <div className="min-w-0 flex-1">
                  <button className="text-left" onClick={() => (p.legKey ? d({ type: "open", detail: { kind: "leg", key: p.legKey } }) : p.course && d({ type: "open", detail: { kind: "course", code: p.course } }))}>
                    <div className="text-[12.5px] leading-snug font-medium">{p.title}</div>
                    <div className="tnum mt-0.5 text-[12px] text-muted">{p.detail}</div>
                  </button>
                  {p.fix && <button onClick={() => d({ type: "add", section: p.fix!.swapTo })} className={clsx(btn, "mt-2")}>{p.fix.label}</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function TravelSettings({ compact }: { compact?: boolean }) {
  const { s, d } = useStore();
  const t = s.travel;
  return (
    <div className={compact ? "" : "px-4"}>
      <div className="text-[11px] font-medium text-muted">Your pace</div>
      <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-border p-1">
        {PACES.map((p) => (
          <button key={p.mph} onClick={() => d({ type: "travel", patch: { mph: p.mph } })} className={clsx("rounded-md py-1.5 text-center", t.mph === p.mph ? "bg-hover font-medium" : "text-muted hover:text-fg")}>
            <div className="text-[12.5px]">{p.label}</div><div className="tnum text-[10.5px] text-muted">{p.hint}</div>
          </button>
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
        <input type="checkbox" id={"sf" + (compact ? "c" : "")} className="mt-0.5" checked={t.stepFree} onChange={(e) => d({ type: "travel", patch: { stepFree: e.target.checked } })} />
        <span><span className="flex items-center gap-1.5 text-[12.5px] font-medium"><Accessibility size={13} />Accessible routes</span><span className="mt-0.5 block text-[11.5px] text-muted">Avoid stairs. Uses ramps, elevators and accessible entrances.</span></span>
      </label>
      <div className="mt-3 text-[11px] font-medium text-muted">Extra time per trip</div>
      <div className="mt-1.5 flex gap-1">
        {[0, 2, 5].map((b) => <button key={b} onClick={() => d({ type: "travel", patch: { buffer: b } })} className={clsx("h-7 flex-1 rounded-md border text-[12px]", t.buffer === b ? "border-border-strong bg-hover font-medium" : "border-border text-muted")}>{b ? `+${b} min` : "None"}</button>)}
      </div>
    </div>
  );
}

export function HowWeEstimate() {
  const design = useDesign();
  const { s } = useStore();
  const info = usePlanInfo();
  const [open, setOpen] = useState(false);
  const ex = info.legs[0];
  const body = (
    <>
      We measure the {s.travel.stepFree ? "accessible " : ""}path between the closest entrances of each building, then divide by your pace.
      {ex && <div className="tnum mt-2 font-mono text-[11px] text-fg">{ex.from.bldg} → {ex.to.bldg}: {fmtFeet(ex.feet)} ÷ {feetPerMinute(s.travel.mph)} ft/min{s.travel.buffer ? ` + ${s.travel.buffer}` : ""} = {ex.minutes} min</div>}
      <div className="mt-2">It doesn't know about crowds, weather or a slow elevator, so leave some slack.</div>
    </>
  );
  if (design.explain === "tooltip") return null;
  if (design.explain === "disclosure")
    return (
      <div className="mx-4 mt-3 text-[12px] text-muted">
        Estimates use campus paths at your pace. <button onClick={() => setOpen(!open)} className="underline hover:text-fg">{open ? "Hide details" : "How?"}</button>
        {open && <div className="fade-in mt-2 rounded-lg bg-panel p-3 leading-relaxed">{body}</div>}
      </div>
    );
  return <div className="mx-4 mt-4 rounded-lg bg-panel p-3 text-[12px] leading-relaxed text-muted"><div className="mb-1 font-medium text-fg">How we estimate</div>{body}</div>;
}

function TravelPanel() {
  const design = useDesign();
  const { d } = useStore();
  const info = usePlanInfo();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Travel time" sub="Time to get between back-to-back classes" />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-4">
        {design.travelSettings === "tab" ? <div className="pt-4"><TravelSettings /></div> : <p className="px-4 pt-4 text-[12px] text-muted">Change your pace or turn on accessible routes from <b>Travel</b> above the calendar.</p>}
        <HowWeEstimate />
        <Label>Connections</Label>
        {[0, 1, 2, 3, 4].map((day) => {
          const ls = info.legs.filter((l) => l.day === day);
          if (!ls.length) return null;
          return (
            <div key={day} className="px-4 pb-2">
              <div className="pb-1 text-[11.5px] font-medium text-muted">{DAY_NAMES[day]}</div>
              {ls.map((l) => <div key={l.key} data-tip={design.explain === "tooltip" ? `${fmtFeet(l.feet)} ÷ your pace = ${l.minutes} min` : undefined}><LegRow leg={l} onClick={() => d({ type: "open", detail: { kind: "leg", key: l.key } })} /></div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TravelHeader() {
  const { s } = useStore();
  const [open, setOpen] = useState(false);
  const pace = PACES.find((p) => p.mph === s.travel.mph)!;
  return (
    <div className="sticky top-0 z-40 flex h-9 items-center gap-2 border-b border-border bg-bg/95 px-3 text-[12px] backdrop-blur">
      <div className="relative">
        <button onClick={() => setOpen(!open)} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 hover:border-border-strong" data-tip="How travel time is estimated for you">
          <Route size={13} className="text-muted" />Travel: {pace.label} pace{s.travel.stepFree && " · accessible"}{s.travel.buffer ? ` · +${s.travel.buffer} min` : ""}<ChevronDown size={12} className="text-muted" />
        </button>
        {open && <div className="pop-in absolute top-9 left-0 z-50 w-72 rounded-lg border border-border bg-raised p-3 shadow-[var(--shadow)]"><TravelSettings compact /></div>}
      </div>
    </div>
  );
}

function BlocksPanel() {
  const design = useDesign();
  const { d, active } = useStore();
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<Day[]>([0, 2]);
  const [start, setStart] = useState(12 * 60);
  const [end, setEnd] = useState(13 * 60);
  const times = Array.from({ length: 29 }, (_, i) => 7 * 60 + i * 30);
  const form = design.blockCreate !== "drag";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Blocks" sub="Time you want to keep free" />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
        {active.blocks.map((b) => (
          <div key={b.id} className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-raised p-3">
            <span className="stripes size-5 shrink-0 rounded border border-border" />
            <div className="flex-1"><div className="text-[12.5px] font-medium">{b.label}</div><div className="tnum text-[11.5px] text-muted">{b.days.map((x) => DAYS[x]).join(", ")} · {fmtRange(b.start, b.end)}</div></div>
            <button onClick={() => d({ type: "removeBlock", id: b.id })} className="text-[12px] text-muted hover:text-fg" data-keys="⌘ Z" data-tip="You can undo this">Remove</button>
          </div>
        ))}
        {design.blockCreate === "drag" && <div className="mt-3 rounded-lg border border-dashed border-border p-4 text-center text-[12.5px] text-muted">Drag on an empty part of the calendar to add a block.</div>}
        {form && (
          <div className="mt-3 rounded-lg border border-border p-3">
            <div className="text-[12.5px] font-medium">Add a block</div>
            <div className="mt-2 flex flex-wrap gap-1">{["Lunch", "Work", "Gym", "Commute"].map((x) => <button key={x} onClick={() => setLabel(x)} className={clsx("h-6 rounded border px-1.5 text-[11px]", label === x ? "border-border-strong bg-hover" : "border-border text-muted")}>{x}</button>)}</div>
            <input id="blk-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="mt-2 h-8 w-full rounded-md border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-border-strong" />
            <div className="mt-2 flex gap-1">{DAYS.map((dn, i) => <button key={dn} onClick={() => setDays((x) => (x.includes(i as Day) ? x.filter((y) => y !== i) : [...x, i as Day]))} className={clsx("h-7 flex-1 rounded border text-[11.5px]", days.includes(i as Day) ? "border-border-strong bg-hover font-medium" : "border-border text-muted")}>{dn}</button>)}</div>
            <div className="mt-2 flex items-center gap-2 text-[12px]">
              <select id="blk-start" value={start} onChange={(e) => setStart(+e.target.value)} className="h-8 flex-1 rounded-md border border-border bg-bg px-1">{times.map((m) => <option key={m} value={m}>{fmt(m)}</option>)}</select>
              <span className="text-muted">to</span>
              <select id="blk-end" value={end} onChange={(e) => setEnd(+e.target.value)} className="h-8 flex-1 rounded-md border border-border bg-bg px-1">{times.map((m) => <option key={m} value={m}>{fmt(m)}</option>)}</select>
            </div>
            <select id="blk-place" className="mt-2 h-8 w-full rounded-md border border-border bg-bg px-1 text-[12px]" defaultValue=""><option value="">No place (doesn't affect travel time)</option><option>Stamp Student Union</option><option>McKeldin Library</option><option>Eppley Recreation Center</option></select>
            <button disabled={!label || !days.length || end <= start} onClick={() => { d({ type: "addBlock", block: { id: "b" + Date.now(), label, days, start, end } }); setLabel(""); }} className="mt-3 h-8 w-full rounded-md bg-accent text-[12.5px] font-medium text-accent-fg disabled:opacity-40">Add block</button>
            {design.blockCreate === "both" && <p className="mt-2 text-[11.5px] text-faint">Or drag on the calendar.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportPanel() {
  const design = useDesign();
  const { s, d, active } = useStore();
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
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="p-2">{rows.map((r) => (
          <button key={r.label} onClick={r.run} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-hover">
            <span className="text-muted">{r.icon}</span><span><span className="block text-[12.5px] font-medium">{r.label}</span><span className="block text-[11.5px] text-muted">{r.hint}</span></span>
          </button>
        ))}</div>
        {design.regHelper === "codes" ? (
          <><Label>Your codes</Label><pre className="tnum mx-4 rounded-lg border border-border bg-panel p-3 font-mono text-[12px] leading-relaxed">{codes}</pre></>
        ) : (
          <>
            <Label>Registration checklist</Label>
            <p className="px-4 pb-2 text-[12px] text-muted">Register in this order: the sections most likely to fill go first. If one is full, try its backup.</p>
            <ol className="mx-4 overflow-hidden rounded-lg border border-border">
              {[...active.sections].sort((a, b) => SECTION_BY_ID[a].seats.open / SECTION_BY_ID[a].seats.total - SECTION_BY_ID[b].seats.open / SECTION_BY_ID[b].seats.total).map((id, i) => {
                const sec = SECTION_BY_ID[id];
                const backup = sectionsOf(sec.course).find((x) => x.id !== id && x.seats.open > 0 && ["fits", "tight"].includes(fitOf(x, active.sections, active.blocks, s.travel).kind));
                return (
                  <li key={id} className="flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                    <input type="checkbox" id={"reg-" + id} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="tnum w-4 text-[11px] text-faint">{i + 1}</span><span className="font-mono text-[12.5px] font-semibold">{sec.course} {sec.code}</span><span className="ml-auto"><SeatText s={sec} /></span></div>
                      <div className="pl-6 text-[11.5px] text-muted">{backup ? <>Backup: <span className="font-mono">{backup.code}</span> ({backup.profs.join(", ")}, fits your plan)</> : "No backup section fits this plan"}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- generate ----------------
function GeneratePanel() {
  const ui = useUI();
  const { s, active } = useStore();
  const courses = [...active.sections.map((id) => SECTION_BY_ID[id].course), ...s.shortlist];
  const [req, setReq] = useState<Set<string>>(new Set(active.sections.map((id) => SECTION_BY_ID[id].course)));
  const [noBefore, setNoBefore] = useState<number | null>(null);
  const [daysOff, setDaysOff] = useState<Day[]>([]);
  const [travelOk, setTravelOk] = useState(true);
  const [sort, setSort] = useState<"compact" | "late" | "profs">("compact");
  const results = useMemo(() => generatePlans([...req], courses.filter((c) => !req.has(c)), active.blocks, { noBefore, daysOff, travelOk, sort }, s.travel), [req, noBefore, daysOff, travelOk, sort, active.blocks, s.travel]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Generate" sub="Every combination of sections, ranked" />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-4">
        <Label>Courses</Label>
        <div className="flex flex-wrap gap-1 px-4">
          {courses.map((c) => (
            <button key={c} onClick={() => setReq((x) => { const n = new Set(x); n.has(c) ? n.delete(c) : n.add(c); return n; })} data-tip={req.has(c) ? "Required: every result includes it" : "Optional: added only if it fits"}
              className={clsx("flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[11.5px]", req.has(c) ? "border-border-strong bg-hover font-semibold" : "border-dashed border-border text-muted")}>
              <Dot color={COURSES[c].color} />{c}
            </button>
          ))}
        </div>
        <p className="px-4 pt-1.5 text-[11px] text-faint">Solid = required, dashed = optional. Click to switch.</p>
        <Label>Must have</Label>
        <div className="space-y-2 px-4">
          <div className="flex items-center gap-2 text-[12.5px]"><span className="w-24 text-muted">Start after</span>
            <select id="gen-start" value={noBefore ?? ""} onChange={(e) => setNoBefore(e.target.value ? +e.target.value : null)} className="h-7 flex-1 rounded-md border border-border bg-bg px-1 text-[12px]"><option value="">Any time</option>{[9, 10, 11].map((h) => <option key={h} value={h * 60}>{fmt(h * 60)}</option>)}</select>
          </div>
          <div className="flex items-center gap-2 text-[12.5px]"><span className="w-24 text-muted">Days off</span>
            <div className="flex flex-1 gap-1">{DAYS.map((dn, i) => <button key={dn} onClick={() => setDaysOff((x) => (x.includes(i as Day) ? x.filter((y) => y !== i) : [...x, i as Day]))} className={clsx("h-7 flex-1 rounded border text-[11px]", daysOff.includes(i as Day) ? "border-transparent bg-accent-soft text-accent" : "border-border text-muted")}>{dn.slice(0, 2)}</button>)}</div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" id="gen-travel" checked={travelOk} onChange={(e) => setTravelOk(e.target.checked)} />Enough time to get between classes</label>
        </div>
        <Label right={<select id="gen-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded border border-border bg-bg text-[11px]"><option value="compact">Compact days</option><option value="late">Later starts</option><option value="profs">Best rated</option></select>}>{results.length} plans</Label>
        {!results.length && <p className="px-4 text-[12.5px] text-muted">Nothing fits all of that. Try allowing an earlier start or fewer days off.</p>}
        {results.map((r, i) => {
          const changes = r.sections.filter((x) => !active.sections.includes(x));
          return (
            <button key={r.sections.join()} onClick={() => ui.setResult({ sections: r.sections, label: `Suggestion ${i + 1}` })} className="flex w-full gap-3 border-b border-border px-4 py-2.5 text-left hover:bg-hover">
              <div className="h-[56px] w-[76px] shrink-0"><Thumb sections={r.sections} changed={new Set(changes)} /></div>
              <div className="tnum min-w-0 flex-1 text-[11.5px]">
                <div className="font-medium">{r.days} days · first class {fmt(r.earliest)}</div>
                <div className="text-muted">{r.courses} courses · ★ {r.rating.toFixed(1)} average</div>
                <div className="text-accent">{changes.length ? `${changes.length} change${changes.length > 1 ? "s" : ""} from ${active.name}` : `Same as ${active.name}`}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Thumb({ sections, changed }: { sections: string[]; changed?: Set<string> }) {
  const items = itemsFor(sections);
  const p = (m: number) => ((Math.min(Math.max(m, 480), 1080) - 480) / 600) * 100;
  return (
    <div className="grid h-full grid-cols-5 gap-[2px]">
      {[0, 1, 2, 3, 4].map((dd) => (
        <div key={dd} className="relative rounded-[2px] bg-panel">
          {items.filter((i) => i.day === dd).map((i) => <div key={i.key} className={clsx("absolute inset-x-[1px] rounded-[1px]", i.sectionId && changed?.has(i.sectionId) && "ring-1 ring-accent")} style={{ top: `${p(i.start)}%`, height: `${p(i.end) - p(i.start)}%`, background: `var(--c${i.course!.color}-dot)` }} />)}
        </div>
      ))}
    </div>
  );
}

function SplitCompare() {
  const ui = useUI();
  const { s, active } = useStore();
  const other = s.plans.find((p) => p.id === ui.compareId)!;
  const onlyA = active.sections.filter((x) => !other.sections.includes(x));
  const onlyB = other.sections.filter((x) => !active.sections.includes(x));
  const probs = (p: typeof active) => findProblems(p.sections, p.blocks, s.travel).filter((x) => x.severity !== "info").length;
  const legs = (p: typeof active) => legsFor(itemsFor(p.sections, p.blocks), s.travel).filter((l) => l.status === "short").length;
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2"><span className="text-[13px] font-semibold">{active.name} vs {other.name}</span><button onClick={() => ui.setCompareId(null)} className="ml-auto text-[12px] text-muted underline">Stop comparing</button></div>
      <div className="grid grid-cols-2 gap-4">
        {[active, other].map((p) => (
          <div key={p.id} className="rounded-xl border border-border p-3">
            <div className="flex items-baseline justify-between"><span className="text-[12.5px] font-semibold">{p.name}</span><span className="tnum text-[11.5px] text-muted">{probs(p)} problems · {legs(p)} short connections</span></div>
            <div className="mt-2 h-[220px]"><Thumb sections={p.sections} changed={new Set(p.id === active.id ? onlyA : onlyB)} /></div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-[11px] font-medium text-muted">Differences</div>
      <ul className="mt-1.5 divide-y divide-border rounded-lg border border-border text-[12.5px]">
        {[...new Set([...onlyA, ...onlyB].map((x) => SECTION_BY_ID[x].course))].map((c) => (
          <li key={c} className="grid grid-cols-[90px_1fr_1fr] gap-3 px-3 py-2">
            <span className="font-mono font-semibold">{c}</span>
            <span className="text-muted">{active.sections.find((x) => SECTION_BY_ID[x].course === c)?.split("-")[1] ?? "–"} · {SECTION_BY_ID[active.sections.find((x) => SECTION_BY_ID[x].course === c) ?? ""]?.profs.join(", ") ?? "not in plan"}</span>
            <span className="text-muted">{other.sections.find((x) => SECTION_BY_ID[x].course === c)?.split("-")[1] ?? "–"} · {SECTION_BY_ID[other.sections.find((x) => SECTION_BY_ID[x].course === c) ?? ""]?.profs.join(", ") ?? "not in plan"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { Settings2, Bell, LEG_WORDS };
