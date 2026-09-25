// PROTOTYPE review: what the phone version shows first.
import clsx from "clsx";
import { MapPin, Route } from "lucide-react";
import { useState } from "react";
import { LEG_WORDS, fmt, fmtRange, itemsFor, legsFor } from "../core";
import { DAYS, DEFAULT_SCHEDULE, type Day } from "../data";
import { DEFAULT_TRAVEL } from "../core";

const items = itemsFor(DEFAULT_SCHEDULE.sections, DEFAULT_SCHEDULE.blocks);
const legs = legsFor(items, DEFAULT_TRAVEL);
const color = (c?: number) => (c == null ? {} : { background: `var(--c${c}-bg)`, color: `var(--c${c}-fg)`, borderColor: `var(--c${c}-bd)` });

export function MobilePreview({ mode }: { mode: "today" | "week" | "list" }) {
  return (
    <div className="flex h-full items-center justify-center gap-8 bg-panel p-6">
      <div className="relative aspect-[1/2] h-[min(600px,100%)] shrink-0 overflow-hidden rounded-[40px] border-[10px] border-[#111] bg-bg shadow-xl">
        <div className="flex h-7 items-center justify-between px-5 pt-1 text-[10px] font-semibold"><span>12:02</span><span className="h-4 w-16 rounded-full bg-[#111]" /><span>100%</span></div>
        <div className="scroll-thin h-[calc(100%-28px)] overflow-y-auto">{mode === "today" ? <Today /> : mode === "week" ? <Week /> : <Agenda />}</div>
      </div>
      <p className="max-w-[240px] text-[12.5px] text-muted">On a phone, people mostly check their schedule and seat alerts rather than build one. Editing opens the full layout on a bigger screen.</p>
    </div>
  );
}

function Today() {
  const [day, setDay] = useState<Day>(1);
  const today = items.filter((i) => i.day === day).sort((a, b) => a.start - b.start);
  const next = today.find((i) => i.start >= 12 * 60 + 2) ?? today[0];
  const legBefore = (i: typeof today[0]) => legs.find((l) => l.to.key === i.key);
  return (
    <div className="px-4 pb-6">
      <div className="flex gap-1 pt-2">{DAYS.map((n, i) => <button key={n} onClick={() => setDay(i as Day)} className={clsx("h-7 flex-1 rounded-full text-[11px]", day === i ? "bg-fg font-medium text-bg" : "text-muted")}>{n}</button>)}</div>
      {next && (
        <div className="mt-3 rounded-2xl border p-3" style={color(next.course?.color)}>
          <div className="text-[10.5px] font-medium opacity-70">NEXT</div>
          <div className="font-mono text-[16px] font-semibold">{next.label}</div>
          <div className="text-[12px]">{fmtRange(next.start, next.end)} · {next.bldg} {next.room}</div>
          {legBefore(next) && <div className="mt-2 flex items-center gap-1 text-[11.5px]"><Route size={11} />Leave {next.bldg && legBefore(next)!.from.bldg} by {fmt(next.start - legBefore(next)!.minutes)}</div>}
        </div>
      )}
      <div className="mt-4 text-[11px] font-medium text-muted">{DAYS[day]}'s classes</div>
      {today.map((i) => (
        <div key={i.key}>
          {legBefore(i) && <div className={clsx("tnum flex items-center gap-1 py-1 pl-3 text-[10.5px]", { ok: "text-muted", tight: "text-warn", short: "text-err" }[legBefore(i)!.status])}><Route size={10} />{legBefore(i)!.minutes} min · {LEG_WORDS[legBefore(i)!.status].toLowerCase()}</div>}
          <div className="mt-1 flex gap-3 rounded-xl border border-border p-2.5">
            <div className="tnum w-12 text-[11px] text-muted">{fmt(i.start)}</div>
            <div><div className={clsx("text-[12.5px] font-semibold", i.course && "font-mono")}>{i.label}</div><div className="flex items-center gap-1 text-[11px] text-muted"><MapPin size={10} />{i.bldg} {i.room}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Week() {
  const y = (m: number) => ((m - 8 * 60) / 60) * 44;
  return (
    <div className="grid grid-cols-5 gap-[2px] px-1 pt-2" style={{ height: y(17 * 60) + 30 }}>
      {DAYS.map((n, d) => (
        <div key={n} className="relative">
          <div className="text-center text-[10px] text-muted">{n[0]}</div>
          {items.filter((i) => i.day === d).map((i) => (
            <div key={i.key} className={clsx("absolute inset-x-0 overflow-hidden rounded border px-0.5 text-[8.5px] leading-tight", !i.course && "stripes border-border bg-panel text-muted")} style={{ top: y(i.start) + 16, height: y(i.end) - y(i.start) - 1, ...color(i.course?.color) }}>
              <div className="font-mono font-semibold">{i.course ? i.label.slice(4) : "Work"}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Agenda() {
  return (
    <div className="px-4 pb-6">
      {DAYS.map((n, d) => (
        <div key={n}>
          <div className="sticky top-0 bg-bg py-2 text-[11px] font-semibold">{n}</div>
          {items.filter((i) => i.day === d).sort((a, b) => a.start - b.start).map((i) => (
            <div key={i.key} className="flex items-center gap-2 border-b border-border py-1.5 text-[12px]">
              <span className="tnum w-14 text-[11px] text-muted">{fmt(i.start)}</span>
              <span className="size-2 rounded-full" style={{ background: i.course ? `var(--c${i.course.color}-dot)` : "var(--faint)" }} />
              <span className={clsx("font-semibold", i.course && "font-mono")}>{i.label}</span>
              <span className="ml-auto text-[11px] text-muted">{i.bldg}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
