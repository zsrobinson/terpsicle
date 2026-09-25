// PROTOTYPE review: the calendar, with every calendar-level open question as a design switch.
import clsx from "clsx";
import { Route } from "lucide-react";
import { createContext, useContext, useMemo, useRef, useState, type CSSProperties } from "react";
import { LEG_WORDS, fmt, fmtFeet, fmtRange, itemsFor, layoutDay, legsFor, seatWords, type Item, type Leg } from "../core";
import { COURSES, DAYS, FINALS_DAYS, SECTION_BY_ID, sectionsOf, type Day } from "../data";
import { useStore } from "../store";
import { Dot, Kbd, rectOf } from "../ui";
import { useDesign } from "./design";

// App-local UI state that isn't part of the shared store.
export type AppUI = {
  hoverCourse: string | null; setHoverCourse: (c: string | null) => void;
  finals: boolean; setFinals: (b: boolean) => void;
  compareId: string | null; setCompareId: (id: string | null) => void;
  result: { sections: string[]; label: string } | null; setResult: (r: { sections: string[]; label: string } | null) => void;
  collapsed: boolean; setCollapsed: (b: boolean) => void;
  shared: boolean;
};
export const AppUICtx = createContext<AppUI>(null!);
export const useUI = () => useContext(AppUICtx);

const FRIEND = ["CMSC330-0201", "MUSC130-0101", "PHIL140-0201", "ECON200-0201"];
export const FRIEND_PLAN = FRIEND;

function blockStyle(colors: string, c: number | undefined, isBlock: boolean): CSSProperties {
  if (isBlock || c == null) return {};
  if (colors === "solid") return { background: `var(--c${c}-dot)`, borderColor: "transparent", color: "white" };
  if (colors === "mono") return { background: "var(--raised)", borderColor: "var(--border-strong)", color: "var(--fg)" };
  return { background: `var(--c${c}-bg)`, borderColor: `var(--c${c}-bd)`, color: `var(--c${c}-fg)` };
}

export function Calendar() {
  const design = useDesign();
  const ui = useUI();
  const { s, d, active } = useStore();
  const sections = ui.result?.sections ?? (ui.shared && design.shared === "readonly" ? FRIEND : active.sections);
  const highlight = useMemo(() => new Set(ui.result ? ui.result.sections.filter((x) => !active.sections.includes(x)) : []), [ui.result, active.sections]);
  const items = useMemo(() => itemsFor(sections, ui.shared && design.shared === "readonly" ? [] : active.blocks), [sections, active.blocks, ui.shared, design.shared]);
  const legs = useMemo(() => legsFor(items, s.travel), [items, s.travel]);
  const focus = s.detail?.kind === "course" ? s.detail.code : null;
  const ghostSource = focus ?? (design.searchHover === "on" ? ui.hoverCourse : null);
  const ghostIds = useMemo(() => {
    const g = new Set<string>();
    if (ghostSource && design.ghosts !== "hoverOnly") sectionsOf(ghostSource).forEach((x) => !sections.includes(x.id) && x.meetings.length && g.add(x.id));
    if (s.preview && !sections.includes(s.preview)) g.add(s.preview);
    return [...g];
  }, [ghostSource, s.preview, sections, design.ghosts]);
  const ghosts = useMemo(() => itemsFor(ghostIds), [ghostIds]);
  const compareItems = useMemo(() => {
    if (ui.compareId && design.compare === "overlay") {
      const other = s.plans.find((p) => p.id === ui.compareId);
      return other ? itemsFor(other.sections.filter((x) => !sections.includes(x))) : [];
    }
    if (ui.shared && design.shared === "overlay") return itemsFor(FRIEND);
    return [];
  }, [ui.compareId, ui.shared, design.compare, design.shared, s.plans, sections]);

  const hourHeight = 50;
  const all = [...items, ...ghosts, ...compareItems];
  const startH = design.timeRange === "fixed" ? 7 : Math.min(8, ...all.map((i) => Math.floor(i.start / 60)));
  const endH = design.timeRange === "fixed" ? 22 : Math.max(17, ...all.map((i) => Math.ceil(i.end / 60)));
  const y = (m: number) => ((m - startH * 60) / 60) * hourHeight;
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  const asyncSecs = sections.map((id) => SECTION_BY_ID[id]).filter((x) => !x.meetings.length);
  const focusCourse = focus ? COURSES[focus] : null;
  const overlapKeys = useMemo(() => {
    const k = new Set<string>();
    for (const a of items) for (const b of items) if (a !== b && a.day === b.day && a.start < b.end && b.start < a.end) k.add(a.key);
    return k;
  }, [items]);

  // drag to create a block
  const [drag, setDrag] = useState<{ day: Day; a: number; b: number } | null>(null);
  const [pending, setPending] = useState<{ day: Day; start: number; end: number } | null>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const canDrag = (design.blockCreate === "drag" || design.blockCreate === "both") && !ui.result && !ui.shared;
  const minuteAt = (day: number, clientY: number) => {
    const r = colRefs.current[day]!.getBoundingClientRect();
    return Math.round(((clientY - r.top) / hourHeight) * 4) * 15 + startH * 60;
  };

  if (ui.finals) return <FinalsView sections={sections} />;

  return (
    <div className="relative flex min-w-[560px] flex-col pb-20 select-none">
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur">
        {ui.result && (
          <div className="flex items-center gap-2 border-b border-border bg-accent-soft px-3 py-2 text-[12px]">
            <span className="font-medium">Previewing {ui.result.label}.</span><span className="text-muted">Outlined classes are changes from {active.name}.</span>
          </div>
        )}
        {ui.shared && design.shared === "overlay" && (
          <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2 text-[12px]">
            <span className="inline-block h-3 w-5 rounded-sm border-2 border-dashed border-muted" /> Alex's classes · <span className="inline-block h-3 w-5 rounded-sm bg-ok-soft" /> you're both free
          </div>
        )}
        {ui.compareId && design.compare === "overlay" && (
          <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2 text-[12px]">
            <span className="inline-block h-3 w-5 rounded-sm border-2 border-dashed border-muted" />
            <span>Gray outlines are where <b>{s.plans.find((p) => p.id === ui.compareId)?.name}</b> differs from {active.name}.</span>
            <button onClick={() => ui.setCompareId(null)} className="ml-auto text-muted underline">Stop comparing</button>
          </div>
        )}
        {focusCourse && design.ghosts !== "hoverOnly" && !ui.result && (
          <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2 text-[12px]">
            <Dot color={focusCourse.color} />
            <span>Showing every section of <span className="font-mono font-semibold">{focusCourse.code}</span>. Click one to switch.</span>
            <span className="ml-auto flex items-center gap-1 text-muted"><Kbd>↑</Kbd><Kbd>↓</Kbd> preview <Kbd>↵</Kbd> switch <Kbd>esc</Kbd> done</span>
          </div>
        )}
        <div className="grid grid-cols-[48px_repeat(5,1fr)] border-b border-border">
          <div className="flex items-center justify-center">
            {design.finals === "toggle" && <FinalsToggle />}
          </div>
          {DAYS.map((dn) => <div key={dn} className="px-2 py-2 text-[11.5px] font-medium text-muted">{dn}</div>)}
        </div>
        {asyncSecs.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11.5px] text-muted">
            <span>No set time:</span>
            {asyncSecs.map((x) => <span key={x.id} className="rounded px-1.5 py-0.5 font-mono font-medium" style={blockStyle(design.colors, COURSES[x.course].color, false)}>{x.course} {x.code} · online</span>)}
          </div>
        )}
      </div>
      <div className="relative grid grid-cols-[48px_repeat(5,1fr)]" style={{ height: y(endH * 60) }}>
        <div className="relative">
          {hours.slice(1, -1).map((h) => <div key={h} className="tnum absolute right-2 -translate-y-1/2 text-[10.5px] text-faint" style={{ top: y(h * 60) }}>{fmt(h * 60)}</div>)}
        </div>
        {DAYS.map((_, dayN) => {
          const day = dayN as Day;
          const dayItems = items.filter((i) => i.day === day);
          const placed = design.overlap === "stacked" ? dayItems.map((item) => ({ item, col: 0, cols: 1 })) : layoutDay(dayItems);
          const placedGhosts = layoutDay(ghosts.filter((i) => i.day === day));
          const dayCompare = compareItems.filter((i) => i.day === day);
          return (
            <div key={day} ref={(el) => { colRefs.current[day] = el; }} className={clsx("relative border-l border-border", canDrag && "cursor-crosshair")}
              onMouseDown={(e) => { if (!canDrag || e.target !== e.currentTarget) return; const m = minuteAt(day, e.clientY); setDrag({ day, a: m, b: m + 30 }); setPending(null); }}
              onMouseMove={(e) => drag && drag.day === day && setDrag({ ...drag, b: Math.max(drag.a + 15, minuteAt(day, e.clientY)) })}
              onMouseUp={() => { if (drag) { setPending({ day: drag.day, start: drag.a, end: drag.b }); setDrag(null); } }}>
              {hours.slice(1, -1).map((h) => <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ top: y(h * 60) }} />)}
              {ui.shared && design.shared === "overlay" && <BothFree day={day} mine={dayItems} theirs={dayCompare} y={y} />}
              {dayCompare.map((i) => (
                <div key={"cmp" + i.key} className="pointer-events-none absolute inset-x-[3px] z-[5] rounded-md border-2 border-dashed border-muted/70 px-1.5 py-1 text-[10.5px] text-muted"
                  style={{ top: y(i.start) + 1, height: y(i.end) - y(i.start) - 2 }}>
                  <div className="font-mono font-semibold">{i.label}</div>{y(i.end) - y(i.start) > 34 && <div>{fmtRange(i.start, i.end)}</div>}
                </div>
              ))}
              {placed.map(({ item, col, cols }, idx) => {
                const isBlock = item.kind === "block";
                const dim = !!focus && item.course?.code !== focus;
                const sel = !!focus && item.course?.code === focus;
                const h = y(item.end) - y(item.start);
                const conflict = overlapKeys.has(item.key);
                const stackedOffset = design.overlap === "stacked" && conflict ? placed.slice(0, idx).filter((p) => overlapKeys.has(p.item.key) && p.item.start < item.end && item.start < p.item.end).length : 0;
                return (
                  <button key={item.key} onClick={(e) => item.course && !ui.shared && (focus === item.course.code ? d({ type: "close" }) : d({ type: "open", detail: { kind: "course", code: item.course.code }, anchor: rectOf(e.currentTarget) }))}
                    data-tip={item.course ? (conflict ? "Overlaps another class" : sel ? "Your current section" : "Click to see other sections") : "Edit in Blocks"}
                    className={clsx("absolute overflow-hidden rounded-md border px-1.5 py-1 text-left transition-opacity duration-150", dim && "opacity-30", isBlock && "stripes border-border bg-panel text-muted", sel && "ring-2 ring-fg/80", conflict && design.overlap === "stacked" && "ring-2 ring-err", item.sectionId && highlight.has(item.sectionId) && "ring-2 ring-accent")}
                    style={{ top: y(item.start) + 1, height: h - 2, left: stackedOffset ? `${stackedOffset * 14 + 2}px` : `calc(${(col / cols) * 100}% + 2px)`, width: stackedOffset ? `calc(100% - ${stackedOffset * 14 + 4}px)` : `calc(${100 / cols}% - 4px)`, zIndex: stackedOffset ? 2 : undefined, ...blockStyle(design.colors, item.course?.color, isBlock) }}>
                    <BlockBody item={item} h={h} />
                  </button>
                );
              })}
              {design.overlap === "stacked" && <OverlapZones items={dayItems} y={y} />}
              {placedGhosts.map(({ item, col, cols }) => <Ghost key={"g" + item.key} item={item} col={col} cols={cols} y={y} dayItems={dayItems} />)}
              {legs.filter((l) => l.day === day).map((l) => <TravelMark key={l.key} leg={l} y={y} />)}
              {drag && drag.day === day && <div className="pointer-events-none absolute inset-x-[3px] z-20 rounded-md border-2 border-accent bg-accent-soft" style={{ top: y(drag.a), height: y(drag.b) - y(drag.a) }}><div className="p-1 text-[10.5px] text-accent">{fmtRange(drag.a, drag.b)}</div></div>}
              {pending && pending.day === day && <PendingBlock p={pending} y={y} onDone={() => setPending(null)} />}
            </div>
          );
        })}
      </div>
      {canDrag && !focus && <div className="px-3 pt-3 text-[11.5px] text-faint">Tip: drag on an empty part of the calendar to block off time.</div>}
    </div>
  );
}

function BlockBody({ item, h }: { item: Item; h: number }) {
  const design = useDesign();
  const isBlock = item.kind === "block";
  const kind = item.meeting?.kind && item.meeting.kind !== "Lec" ? (item.meeting.kind === "Dis" ? "discussion" : "lab") : null;
  return (
    <>
      <div className="flex items-center gap-1 text-[11.5px] leading-tight">
        {design.colors === "mono" && item.course && <Dot color={item.course.color} />}
        <span className={clsx("truncate font-semibold", !isBlock && "font-mono")}>{item.label}</span>
        {kind && design.blockContent !== "compact" && <span className="text-[10px] opacity-70">{kind}</span>}
      </div>
      {design.blockContent === "detailed" && item.course && h > 34 && <div className="truncate text-[10.5px] opacity-80">{item.course.title}</div>}
      {design.blockContent !== "compact" && h > 34 && <div className="tnum truncate text-[10.5px] opacity-75">{fmtRange(item.start, item.end)}</div>}
      {design.blockContent !== "compact" && h > 50 && item.bldg && <div className="truncate text-[10.5px] opacity-75">{item.bldg} {item.room}</div>}
      {design.blockContent === "detailed" && h > 64 && item.section && <div className="truncate text-[10.5px] opacity-70">{item.section.profs.join(", ")}</div>}
    </>
  );
}

function Ghost({ item, col, cols, y, dayItems }: { item: Item; col: number; cols: number; y: (m: number) => number; dayItems: Item[] }) {
  const design = useDesign();
  const { s, d } = useStore();
  const clash = dayItems.some((o) => o.course?.code !== item.course?.code && o.start < item.end && item.start < o.end);
  const pv = s.preview === item.sectionId;
  const full = item.section!.seats.open === 0;
  const cc = item.course!.color;
  const faded = design.ghosts === "faded";
  return (
    <button data-keep-popover onClick={() => d({ type: "add", section: item.sectionId! })}
      onMouseEnter={() => d({ type: "preview", section: item.sectionId! })} onMouseLeave={() => d({ type: "preview", section: null })}
      data-tip={`Switch to ${item.section!.code}`} data-tip-sub={`${item.section!.profs.join(", ")} · ${seatWords(item.section!).text}${clash ? " · overlaps another class" : ""}`} data-keys="↵"
      className={clsx("fade-in absolute z-10 overflow-hidden rounded-md px-1.5 py-1 text-left", faded ? "border" : "border-2 border-dashed", pv && "z-20 shadow-md", pv && !faded && "border-solid")}
      style={{ top: y(item.start) + 1, height: y(item.end) - y(item.start) - 2, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`,
        borderColor: clash ? "var(--err)" : `var(--c${cc}-bd)`, color: clash ? "var(--err)" : `var(--c${cc}-fg)`,
        background: pv ? `var(--c${cc}-bg)` : clash ? "var(--err-soft)" : faded ? `color-mix(in oklab, var(--c${cc}-bg) 70%, transparent)` : `color-mix(in oklab, var(--c${cc}-bg) 45%, transparent)`,
        opacity: faded && !pv ? 0.75 : 1 }}>
      {faded ? <span className="rounded bg-raised px-1 font-mono text-[10.5px] font-semibold shadow-sm">{item.section!.code}</span> : <div className="font-mono text-[11.5px] font-semibold">{item.section!.code}</div>}
      <div className="truncate text-[10.5px] opacity-80">{item.section!.profs.join(", ")}</div>
      {full ? <div className="text-[10.5px] font-medium">Full</div> : clash ? <div className="text-[10.5px] font-medium">Overlaps</div> : null}
    </button>
  );
}

function TravelMark({ leg: l, y }: { leg: Leg; y: (m: number) => number }) {
  const design = useDesign();
  const { s, d } = useStore();
  if (design.pills === "problems" && l.status === "ok") return null;
  const tone = { ok: "border-border text-muted", tight: "border-warn/50 text-warn", short: "border-err/60 text-err" }[l.status];
  const tip = { "data-tip": `${LEG_WORDS[l.status]}: ${l.minutes} min to get from ${l.from.bldg} to ${l.to.bldg}`, "data-tip-sub": `${l.gap} min between classes · ${fmtFeet(l.feet)} at ${s.travel.mph} mph · click for details` };
  const open = () => d({ type: "open", detail: { kind: "leg", key: l.key } });
  if (design.pills === "edge") {
    return (
      <button {...tip} onClick={open} className="absolute right-1 z-20 flex items-center gap-0.5" style={{ top: y(l.from.end) - 6, height: y(l.to.start) - y(l.from.end) + 12 }}>
        <span className={clsx("h-full w-[3px] rounded-full", { ok: "bg-border-strong", tight: "bg-warn", short: "bg-err" }[l.status])} />
        <span className={clsx("tnum rounded bg-raised px-1 text-[10px] shadow-sm", { ok: "text-muted", tight: "text-warn", short: "text-err" }[l.status])}>{l.minutes}m</span>
      </button>
    );
  }
  return (
    <button {...tip} onClick={open}
      className={clsx("tnum absolute left-1/2 z-20 flex h-[19px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border bg-raised px-1.5 text-[10.5px] whitespace-nowrap shadow-sm", tone, s.detail?.kind === "leg" && s.detail.key === l.key && "ring-2 ring-fg/70")}
      style={{ top: y(l.from.end + l.gap / 2) }}>
      <Route size={10} />{l.minutes} min
    </button>
  );
}

function OverlapZones({ items, y }: { items: Item[]; y: (m: number) => number }) {
  const zones: { a: number; b: number }[] = [];
  for (const i of items) for (const j of items) if (i.key < j.key && i.start < j.end && j.start < i.end) zones.push({ a: Math.max(i.start, j.start), b: Math.min(i.end, j.end) });
  return <>{zones.map((z, k) => <div key={k} className="pointer-events-none absolute inset-x-0 z-[3]" style={{ top: y(z.a), height: y(z.b) - y(z.a), background: "repeating-linear-gradient(135deg, color-mix(in oklab, var(--err) 35%, transparent) 0 4px, transparent 4px 8px)" }} />)}</>;
}

function BothFree({ day, mine, theirs, y }: { day: Day; mine: Item[]; theirs: Item[]; y: (m: number) => number }) {
  const busy = [...mine, ...theirs].map((i) => [i.start, i.end]).sort((a, b) => a[0] - b[0]);
  const free: [number, number][] = [];
  let t = 10 * 60;
  for (const [a, b] of busy) { if (a - t >= 60 && t < 17 * 60) free.push([t, Math.min(a, 17 * 60)]); t = Math.max(t, b); }
  if (17 * 60 - t >= 60) free.push([t, 17 * 60]);
  return <>{free.map(([a, b]) => <div key={a} className="pointer-events-none absolute inset-x-0 bg-ok-soft" style={{ top: y(a), height: y(b) - y(a) }} data-day={day} />)}</>;
}

function PendingBlock({ p, y, onDone }: { p: { day: Day; start: number; end: number }; y: (m: number) => number; onDone: () => void }) {
  const { d } = useStore();
  const [label, setLabel] = useState("");
  const save = (l: string) => { d({ type: "addBlock", block: { id: "b" + Date.now(), label: l || "Busy", days: [p.day], start: p.start, end: p.end } }); onDone(); };
  return (
    <>
      <div className="pointer-events-none absolute inset-x-[3px] z-20 rounded-md border-2 border-accent bg-accent-soft" style={{ top: y(p.start), height: y(p.end) - y(p.start) }} />
      <div className="pop-in absolute left-[calc(100%+6px)] z-40 w-56 rounded-lg border border-border bg-raised p-2.5 shadow-[var(--shadow)]" style={{ top: y(p.start) }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="tnum text-[11.5px] text-muted">{DAYS[p.day]} {fmtRange(p.start, p.end)}</div>
        <input autoFocus id="new-block-label" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save(label)} placeholder="What's this time for?" className="mt-1.5 h-8 w-full rounded-md border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-border-strong" />
        <div className="mt-2 flex flex-wrap gap-1">{["Lunch", "Work", "Gym", "Club"].map((x) => <button key={x} onClick={() => save(x)} className="h-6 rounded border border-border px-1.5 text-[11px] text-muted hover:text-fg">{x}</button>)}</div>
        <div className="mt-2 flex justify-end gap-1"><button onClick={onDone} className="h-7 px-2 text-[12px] text-muted">Cancel</button><button onClick={() => save(label)} className="h-7 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg">Add block</button></div>
      </div>
    </>
  );
}

function FinalsToggle() {
  const ui = useUI();
  return (
    <button onClick={() => ui.setFinals(!ui.finals)} data-tip={ui.finals ? "Back to your weekly classes" : "See your final exams"} className={clsx("rounded px-1 text-[10px] font-medium", ui.finals ? "bg-fg text-bg" : "text-muted hover:bg-hover")}>
      Finals
    </button>
  );
}

function FinalsView({ sections }: { sections: string[] }) {
  const ui = useUI();
  const courses = [...new Set(sections.map((id) => SECTION_BY_ID[id].course))].map((c) => COURSES[c]);
  const y = (m: number) => ((m - 8 * 60) / 60) * 36;
  const exams = courses.filter((c) => c.final && c.final !== "none");
  return (
    <div className="min-w-[560px] pb-20">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-bg/95 px-3 py-2 backdrop-blur">
        <span className="text-[12.5px] font-semibold">Final exams · Spring 2027</span>
        {(() => { const none = courses.filter((c) => c.final === "none").map((c) => c.code); return none.length ? <span className="text-[12px] text-muted">{none.join(", ")} {none.length > 1 ? "have" : "has"} no final exam.</span> : null; })()}
        <button onClick={() => ui.setFinals(false)} className="ml-auto h-7 rounded-md border border-border px-2 text-[12px]">Back to classes</button>
      </div>
      <div className="grid grid-cols-[48px_repeat(6,1fr)] border-b border-border">
        <div />{FINALS_DAYS.map((dn) => <div key={dn} className="px-2 py-2 text-[11.5px] font-medium text-muted">{dn}</div>)}
      </div>
      <div className="relative grid grid-cols-[48px_repeat(6,1fr)]" style={{ height: y(22 * 60) }}>
        <div className="relative">{[9, 12, 15, 18, 21].map((h) => <div key={h} className="tnum absolute right-2 -translate-y-1/2 text-[10.5px] text-faint" style={{ top: y(h * 60) }}>{fmt(h * 60)}</div>)}</div>
        {FINALS_DAYS.map((_, di) => {
          const here = exams.filter((c) => c.final !== "none" && c.final!.day === di);
          return (
            <div key={di} className="relative border-l border-border">
              {here.map((c, k) => {
                const f = c.final as { start: number; end: number };
                const clash = here.filter((o) => o !== c && (o.final as { start: number }).start === f.start).length > 0;
                return (
                  <div key={c.code} className={clsx("absolute rounded-md border px-1.5 py-1 text-[11px]", clash && "ring-2 ring-err")} style={{ top: y(f.start), height: y(f.end) - y(f.start), left: clash ? `${k * 50}%` : 2, width: clash ? "50%" : "calc(100% - 4px)", ...blockStyle("pastel", c.color, false) }}>
                    <div className="font-mono font-semibold">{c.code}</div><div className="tnum opacity-75">{fmtRange(f.start, f.end)}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { FRIEND as FRIEND_SECTIONS };
