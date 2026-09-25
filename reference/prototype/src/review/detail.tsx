// PROTOTYPE review: course, connection and suggested-plan details, with their open questions as switches.
import clsx from "clsx";
import { ArrowRight, Bell, BellRing, Bookmark, ChevronDown, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { DAY_NAMES, LEG_WORDS, daysLabel, feetPerMinute, fitOf, fmt, fmtFeet, fmtRange, itemsFor, problems, profRating, type Fit } from "../core";
import { BUILDINGS, COURSES, PROFS, SECTION_BY_ID, sectionsOf, type Section } from "../data";
import { useStore } from "../store";
import { Dot, Rating, btn, usePlanInfo } from "../ui";
import { useUI } from "./calendar";
import { useDesign } from "./design";
import { FitWords, HowWeEstimate, SeatDisplay, Thumb } from "./shell";

const GOOD = ["current", "fits", "tight", "none"];

export function CourseDetailR({ code }: { code: string }) {
  const design = useDesign();
  const ui = useUI();
  const { s, d, active } = useStore();
  const c = COURSES[code];
  const current = active.sections.find((id) => SECTION_BY_ID[id].course === code);
  const secs = sectionsOf(code).map((x) => ({ x, fit: fitOf(x, active.sections, active.blocks, s.travel) }));
  const profs = [...new Set(secs.flatMap(({ x }) => x.profs))];
  const tabs = (design.instructors === "inline" ? ["grades", "about"] : ["instructors", "grades", "about"]) as ("instructors" | "grades" | "about")[];
  const [more, setMore] = useState(tabs[0]);
  const [showAll, setShowAll] = useState(false);

  const good = secs.filter((r) => GOOD.includes(r.fit.kind));
  const bad = secs.filter((r) => !GOOD.includes(r.fit.kind));
  let visible = secs;
  if (design.fitMode === "sorted") visible = [...good, ...bad];
  if (design.fitMode === "filter" && !showAll) visible = good;

  const rowsFor = (list: typeof secs) =>
    design.sectionLayout === "table" ? <SectionTable rows={list} current={current} /> : list.map(({ x, fit }) => <SectionRow key={x.id} sec={x} fit={fit} current={current} />);

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Dot color={c.color} /><span className="font-mono text-[13px] font-semibold">{c.code}</span><span className="tnum text-[11.5px] text-muted">{c.credits} credits</span>
          {c.geneds.map((g) => <span key={g} className="rounded border border-border px-1 font-mono text-[10px] text-muted">{g}</span>)}
        </div>
        <div className="mt-1 text-[15px] leading-snug font-semibold text-balance">{c.title}</div>
        {!ui.shared && (
          <div className="mt-3 flex gap-2">
            {current
              ? <button onClick={() => d({ type: "remove", course: code })} className={btn} data-tip="You can undo this" data-keys="⌘ Z">Remove from {active.name}</button>
              : <button onClick={() => d({ type: "shortlist", course: code, on: !s.shortlist.includes(code) })} className={btn}><Bookmark size={13} className={s.shortlist.includes(code) ? "fill-current" : ""} />{s.shortlist.includes(code) ? "Saved" : "Save for later"}</button>}
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between px-4 pt-2 pb-1.5">
        <span className="text-[11px] font-medium text-muted">Sections · <span className={good.length ? "text-ok" : ""}>{good.filter((r) => r.fit.kind !== "current").length} fit</span></span>
        {design.freshness === "details" ? <span className="flex items-center gap-1.5 text-[11px] text-faint"><span className="size-1.5 rounded-full bg-ok" />Seats as of 2 min ago</span> : <span className="text-[11px] text-faint">hover or use ↑↓ to preview</span>}
      </div>
      <div className="border-y border-border">
        {design.sectionLayout === "byInstructor"
          ? profs.map((p) => {
              const mine = visible.filter((r) => r.x.profs.includes(p));
              if (!mine.length) return null;
              const pr = PROFS[p];
              const g = c.byProf?.[p];
              return (
                <div key={p}>
                  <div className="flex items-center gap-2 border-b border-border bg-panel px-4 py-2 text-[12px]">
                    <span className="font-medium">{p}</span>
                    {pr && <Rating value={pr.rating} reviews={pr.reviews} />}
                    {g && <span className="tnum text-muted">· avg GPA {g.gpa.toFixed(2)}</span>}
                    <span className="ml-auto text-[11px] text-faint">{mine.length} section{mine.length > 1 ? "s" : ""}</span>
                  </div>
                  {rowsFor(mine)}
                </div>
              );
            })
          : design.fitMode === "sorted" ? (
            <>
              {rowsFor(good)}
              {bad.length > 0 && <div className="border-b border-border bg-panel px-4 py-1.5 text-[11px] font-medium text-muted">Don't fit your plan ({bad.length})</div>}
              {rowsFor(bad)}
            </>
          ) : rowsFor(visible)}
        {design.fitMode === "filter" && bad.length > 0 && (
          <button onClick={() => setShowAll(!showAll)} className="w-full px-4 py-2 text-left text-[12px] text-muted hover:bg-hover">
            {showAll ? "Only show sections that fit" : `Show ${bad.length} section${bad.length > 1 ? "s" : ""} that don't fit your plan`}
          </button>
        )}
      </div>

      <div className="mt-3 flex gap-1 px-4">
        {tabs.map((k) => <button key={k} onClick={() => setMore(k)} className={clsx("h-7 rounded-md px-2.5 text-[12px] capitalize", more === k ? "bg-hover font-medium" : "text-muted hover:text-fg")}>{k}</button>)}
      </div>
      <div className="px-4 pt-2 pb-6">
        {more === "instructors" && (design.instructors === "compare" ? <InstructorCompare code={code} profs={profs} /> : profs.map((p) => <ProfCard key={p} name={p} code={code} />))}
        {more === "grades" && <Grades code={code} />}
        {more === "about" && (
          <div className="text-[12.5px] leading-relaxed text-muted">
            <p>{c.desc}</p>
            {c.prereq && <p className="mt-2"><span className="font-medium text-fg">Prerequisite:</span> {c.prereq}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionRow({ sec, fit, current }: { sec: Section; fit: Fit; current?: string }) {
  const design = useDesign();
  const ui = useUI();
  const { s, d } = useStore();
  const [openProf, setOpenProf] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const isCur = sec.id === current;
  const pv = s.preview === sec.id;
  const inline = design.instructors === "inline";
  const watching = s.watching.includes(sec.id);
  return (
    <div onMouseEnter={() => d({ type: "preview", section: sec.id })} onMouseLeave={() => d({ type: "preview", section: null })}
      className={clsx("border-b border-border px-4 py-2.5 last:border-b-0", pv ? "bg-hover" : isCur ? "bg-accent-soft/50" : "")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12.5px] font-semibold">{sec.code}</span>
            {design.sectionLayout !== "byInstructor" && (inline
              ? <button onClick={() => setOpenProf(!openProf)} className="flex items-center gap-1 truncate text-[12.5px] underline decoration-border-strong underline-offset-2 hover:decoration-fg" data-tip="Show what students say">{sec.profs.join(", ")}<ChevronDown size={12} className={clsx("transition-transform", openProf && "rotate-180")} /></button>
              : <span className="truncate text-[12.5px]">{sec.profs.join(", ")}</span>)}
            {design.sectionLayout !== "byInstructor" && <Rating value={profRating(sec)} />}
          </div>
          <div className="tnum mt-0.5 truncate text-[11.5px] text-muted">{sec.meetings.length ? sec.meetings.map((m) => `${daysLabel(m.days)} ${fmtRange(m.start, m.end)} ${m.bldg ?? ""}`).join(" · ") : "Online, no set times"}</div>
          <div className="mt-0.5 flex items-center gap-2"><FitWords kind={fit.kind} label={fit.label} /><SeatWithDot secId={sec.id} /></div>
          {sec.note && <div className="mt-0.5 text-[11.5px] text-warn">{sec.note}</div>}
        </div>
        {(sec.seats.open <= 3) && !ui.shared && (
          <button onClick={() => (watching ? d({ type: "watch", section: sec.id }) : setWatchOpen(!watchOpen))} className={clsx("flex size-7 items-center justify-center rounded-md", watching ? "text-accent" : "text-muted hover:bg-hover hover:text-fg")} data-tip={watching ? "Watching: tap to stop" : "Get notified when a seat opens"}>
            {watching ? <BellRing size={14} /> : <Bell size={14} />}
          </button>
        )}
        {ui.shared ? null : isCur ? <span className="w-[68px] text-center text-[11.5px] font-medium text-accent">Current</span> : (
          <button onClick={() => d({ type: "add", section: sec.id })} data-tip={current ? `Replace ${current.split("-")[1]} with ${sec.code}` : `Add ${sec.code}`} data-keys={pv ? "↵" : undefined}
            className={clsx(btn, "w-[68px] justify-center", (fit.kind === "clash" || fit.kind === "short") && "text-err")}>{current ? "Switch" : "Add"}</button>
        )}
      </div>
      {openProf && sec.profs.map((p) => <div key={p} className="mt-2"><ProfCard name={p} code={sec.course} /></div>)}
      {watchOpen && <WatchDialog secId={sec.id} onDone={() => setWatchOpen(false)} />}
    </div>
  );
}

const SeatWithDot = ({ secId }: { secId: string }) => {
  const design = useDesign();
  const sec = SECTION_BY_ID[secId];
  if (design.seats === "lowOnly" && sec.seats.open > 3) return null;
  return <><span className="text-faint">·</span><SeatDisplay secId={secId} /></>;
};

function SectionTable({ rows, current }: { rows: { x: Section; fit: Fit }[]; current?: string }) {
  const { s, d } = useStore();
  return (
    <table className="w-full text-left text-[11.5px]">
      <tbody>
        {rows.map(({ x, fit }) => {
          const isCur = x.id === current;
          return (
            <tr key={x.id} onMouseEnter={() => d({ type: "preview", section: x.id })} onMouseLeave={() => d({ type: "preview", section: null })} className={clsx("border-b border-border last:border-b-0", s.preview === x.id ? "bg-hover" : isCur && "bg-accent-soft/50")}>
              <td className="py-2 pl-4 font-mono font-semibold">{x.code}</td>
              <td className="max-w-[92px] truncate px-2">{x.profs[0].split(" ").slice(-1)}</td>
              <td className="tnum px-1 whitespace-nowrap text-muted">{x.meetings[0] ? `${daysLabel(x.meetings[0].days)} ${fmt(x.meetings[0].start)}` : "Online"}</td>
              <td className="px-1"><span className={clsx("inline-block size-2 rounded-full", { current: "bg-accent", fits: "bg-ok", tight: "bg-warn", clash: "bg-err", short: "bg-err", none: "bg-faint" }[fit.kind])} data-tip={fit.label} /></td>
              <td className="px-1 text-right"><SeatDisplay secId={x.id} compact /></td>
              <td className="py-1 pr-3 pl-1 text-right">{isCur ? <span className="text-accent">Current</span> : <button onClick={() => d({ type: "add", section: x.id })} className={clsx(btn, "h-6 px-2 text-[11px]")}>{current ? "Switch" : "Add"}</button>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function WatchDialog({ secId, onDone }: { secId: string; onDone: () => void }) {
  const design = useDesign();
  const { d } = useStore();
  const [sent, setSent] = useState(false);
  const sec = SECTION_BY_ID[secId];
  const confirm = () => { d({ type: "watch", section: secId }); setSent(true); setTimeout(onDone, 1400); };
  return (
    <div className="pop-in mt-2 rounded-lg border border-border bg-raised p-3 text-[12.5px] shadow-sm">
      <div className="font-medium">Tell me when {sec.course} {sec.code} has a seat</div>
      {sent ? <p className="mt-1 text-ok">Done. {design.alerts === "push" ? "You'll get a notification." : "Check your email to confirm."}</p> : (
        <>
          {(design.alerts === "email" || design.alerts === "either") && (
            <div className="mt-2 flex gap-1.5">
              <input id={"watch-email-" + secId} placeholder="you@terpmail.umd.edu" className="h-8 flex-1 rounded-md border border-border bg-bg px-2 outline-none focus:border-border-strong" />
              <button onClick={confirm} className="h-8 rounded-md bg-accent px-2.5 font-medium text-accent-fg">Email me</button>
            </div>
          )}
          {design.alerts === "either" && <div className="my-2 text-center text-[11px] text-faint">or</div>}
          {(design.alerts === "push" || design.alerts === "either") && <button onClick={confirm} className={clsx(btn, "mt-2 w-full justify-center")}><Bell size={13} />Send a browser notification</button>}
          <p className="mt-2 text-[11px] text-muted">No account or password. {design.alerts === "push" ? "Works while this browser is allowed to notify you." : "We'll send one confirmation link, then only seat alerts."}</p>
        </>
      )}
    </div>
  );
}

// Summaries are generated the first time anyone opens an instructor, then cached.
const summarized = new Set<string>();
function ProfCard({ name, code }: { name: string; code: string }) {
  const pr = PROFS[name];
  const g = COURSES[code].byProf?.[name];
  const [ready, setReady] = useState(summarized.has(name));
  useEffect(() => { if (ready) return; const t = setTimeout(() => { summarized.add(name); setReady(true); }, 900); return () => clearTimeout(t); }, [name, ready]);
  if (!pr) return null;
  return (
    <div className="mb-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium">{name}</span><Rating value={pr.rating} reviews={pr.reviews} /></div>
      {g && <div className="tnum mt-0.5 text-[11.5px] text-muted">In {code}: average GPA {g.gpa.toFixed(2)}, {g.aOrB}% A or B</div>}
      {ready ? (
        <>
          <p className="fade-in mt-1.5 text-[12px] leading-relaxed text-muted">{pr.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1">{pr.tags.map((t) => <span key={t.label} className={clsx("rounded px-1.5 py-0.5 text-[11px]", t.tone === "good" ? "bg-ok-soft text-ok" : t.tone === "bad" ? "bg-err-soft text-err" : "bg-hover text-muted")}>{t.label}</span>)}</div>
          <div className="mt-2 text-[11px] text-faint">Summary of {pr.reviews} PlanetTerp reviews · <span className="underline">read them</span></div>
        </>
      ) : (
        <div className="mt-2 space-y-1.5"><div className="h-2.5 w-full animate-pulse rounded bg-hover" /><div className="h-2.5 w-4/5 animate-pulse rounded bg-hover" /><div className="text-[11px] text-faint">Summarizing {pr.reviews} reviews…</div></div>
      )}
    </div>
  );
}

function InstructorCompare({ code, profs }: { code: string; profs: string[] }) {
  const c = COURSES[code];
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <table className="w-full text-left text-[12px]">
        <thead><tr className="text-[11px] text-muted"><th className="py-1 font-medium">Instructor</th><th className="font-medium">Rating</th><th className="font-medium">Avg GPA</th><th className="text-right font-medium">A or B</th></tr></thead>
        <tbody className="tnum">
          {profs.map((p) => {
            const pr = PROFS[p]; const g = c.byProf?.[p];
            return (
              <tr key={p} onClick={() => setOpen(open === p ? null : p)} className="cursor-pointer border-t border-border hover:bg-hover" data-tip="Show what students say">
                <td className="py-2 font-medium">{p}</td>
                <td><span className="inline-flex items-center gap-0.5"><Star size={11} className="fill-current text-warn" />{pr?.rating.toFixed(1)}<span className="text-muted">({pr?.reviews})</span></span></td>
                <td>{g ? g.gpa.toFixed(2) : "–"}</td>
                <td className="text-right">{g ? `${g.aOrB}%` : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {open && <div className="mt-2"><ProfCard name={open} code={code} /></div>}
      <p className="mt-2 text-[11px] text-faint">Grades from {code} only, last 4 semesters. Click an instructor to read the review summary.</p>
    </div>
  );
}

function Grades({ code }: { code: string }) {
  const design = useDesign();
  const c = COURSES[code];
  const ab = c.grades[0] + c.grades[1];
  const sentence = <p className="text-[12.5px]"><span className="tnum font-semibold">{ab}%</span> <span className="text-muted">of students got an A or B. Average GPA</span> <span className="tnum font-semibold">{c.avgGpa.toFixed(2)}</span><span className="text-muted">.</span></p>;
  const L = ["A", "B", "C", "D", "F"];
  return (
    <div>
      {sentence}
      {design.grades === "bars" && (
        <div className="mt-3 space-y-1.5">
          {L.map((l, i) => (
            <div key={l} className="grid grid-cols-[14px_1fr_36px] items-center gap-2">
              <span className="font-mono text-[11.5px] text-muted">{l}</span>
              <div className="h-3 rounded-sm bg-hover"><div className="h-3 rounded-sm bg-fg/70" style={{ width: `${c.grades[i]}%` }} /></div>
              <span className="tnum text-right text-[11.5px] text-muted">{c.grades[i]}%</span>
            </div>
          ))}
        </div>
      )}
      {design.grades === "stacked" && (
        <div className="mt-3">
          <div className="flex h-5 overflow-hidden rounded-md">
            {L.map((l, i) => <div key={l} className="flex items-center justify-center text-[10px] font-medium" style={{ width: `${c.grades[i]}%`, background: `color-mix(in oklab, var(--fg) ${70 - i * 14}%, var(--bg))`, color: i < 2 ? "var(--bg)" : "var(--fg)" }}>{c.grades[i] >= 8 ? l : ""}</div>)}
          </div>
          <div className="tnum mt-1.5 flex justify-between text-[11px] text-muted">{L.map((l, i) => <span key={l}>{l} {c.grades[i]}%</span>)}</div>
        </div>
      )}
      {c.byProf && (
        <div className="mt-3 space-y-1 text-[12px]">
          {Object.entries(c.byProf).map(([p, g]) => <div key={p} className="tnum flex justify-between"><span className="text-muted">{p}</span><span>GPA {g.gpa.toFixed(2)} · {g.aOrB}% A or B</span></div>)}
        </div>
      )}
      <p className="mt-2 text-[11px] text-faint">All sections, last 4 semesters.</p>
    </div>
  );
}

export function LegDetailR({ legKey }: { legKey: string }) {
  const design = useDesign();
  const { s, d, active } = useStore();
  const info = usePlanInfo();
  const leg = info.legs.find((l) => l.key === legKey);
  if (!leg) return <div className="p-4 text-[12.5px] text-muted">This connection no longer exists. It changed when the plan did.</div>;
  const A = BUILDINGS[leg.from.bldg!], B = BUILDINGS[leg.to.bldg!];
  const alts = [leg.to, leg.from].flatMap((it) => (it.section ? sectionsOf(it.section.course).filter((x) => x.id !== it.sectionId).map((x) => ({ x, fit: fitOf(x, active.sections, active.blocks, s.travel) })).filter((a) => a.fit.kind === "fits") : []));
  const days = info.legs.filter((l) => l.from.label === leg.from.label && l.to.label === leg.to.label).map((l) => DAY_NAMES[l.day]).join(" and ");
  const max = Math.max(leg.gap, leg.minutes) * 1.15;
  const tone = { ok: "text-ok", tight: "text-warn", short: "text-err" }[leg.status];
  return (
    <div className="p-4">
      <div className="text-[11px] font-medium text-muted">Every {days}</div>
      <div className="mt-1 flex items-center gap-2 text-[15px] font-semibold"><span className="font-mono">{leg.from.label}</span><ArrowRight size={15} className="text-muted" /><span className="font-mono">{leg.to.label}</span></div>
      <div className={clsx("mt-3 rounded-lg p-3", { ok: "bg-ok-soft", tight: "bg-warn-soft", short: "bg-err-soft" }[leg.status])}>
        <div className={clsx("text-[13px] font-semibold", tone)}>{LEG_WORDS[leg.status]}</div>
        <div className="tnum mt-0.5 text-[12.5px]">{leg.minutes} min to get there, {leg.gap} min between classes.{leg.status === "short" && ` You'd be about ${leg.minutes - leg.gap} min late.`}</div>
      </div>
      {design.legViz === "bars" && (
        <div className="mt-4 space-y-2.5">
          {[{ label: "Time between classes", v: leg.gap, c: "bg-fg/25" }, { label: "Time to get there", v: leg.minutes, c: { ok: "bg-ok", tight: "bg-warn", short: "bg-err" }[leg.status] }].map((r) => (
            <div key={r.label}>
              <div className="tnum flex justify-between text-[12px]"><span className="text-muted">{r.label}</span><span className="font-medium">{r.v} min</span></div>
              <div className="mt-1 h-2.5 rounded-full bg-hover"><div className={clsx("h-full rounded-full", r.c)} style={{ width: `${(r.v / max) * 100}%` }} /></div>
            </div>
          ))}
          <div className="tnum text-[11.5px] text-muted">{fmt(leg.from.end)} leave {A.name} → {fmt(leg.to.start)} class starts in {B.name}</div>
        </div>
      )}
      {design.legViz === "map" && <MiniRoute a={leg.from.bldg!} b={leg.to.bldg!} status={leg.status} />}
      {design.legViz !== "bars" && (
        <dl className="tnum mt-3 grid grid-cols-[88px_1fr] gap-y-1.5 text-[12.5px]">
          <dt className="text-muted">Leave</dt><dd>{A.name} at {fmt(leg.from.end)}</dd>
          <dt className="text-muted">Arrive by</dt><dd>{B.name} at {fmt(leg.to.start)}</dd>
          <dt className="text-muted">Distance</dt><dd>{fmtFeet(leg.feet)}{s.travel.stepFree && " (accessible route)"}</dd>
          {design.explain !== "tooltip" && <><dt className="text-muted">Estimate</dt><dd className="font-mono text-[12px]">{fmtFeet(leg.feet)} ÷ {feetPerMinute(s.travel.mph)} ft/min{s.travel.buffer ? ` + ${s.travel.buffer}` : ""} = {leg.minutes} min</dd></>}
        </dl>
      )}
      {design.legViz === "bars" && <div className="-mx-4"><HowWeEstimate /></div>}
      <button onClick={() => (design.travelSettings === "tab" ? d({ type: "tab", tab: "travel" }) : d({ type: "toast", text: "Use “Travel” above the calendar" }))} className="mt-3 text-[12px] text-muted underline hover:text-fg">Change your pace or use accessible routes</button>
      {leg.status !== "ok" && (
        <>
          <div className="mt-5 text-[11px] font-medium text-muted">Sections that fix this</div>
          {alts.length ? alts.map(({ x }) => (
            <div key={x.id} className="mt-1.5 flex items-center gap-3 rounded-lg border border-border p-2.5" onMouseEnter={() => d({ type: "preview", section: x.id })} onMouseLeave={() => d({ type: "preview", section: null })}>
              <div className="min-w-0 flex-1"><div className="text-[12.5px]"><span className="font-mono font-semibold">{x.course} {x.code}</span> · {x.profs.join(", ")}</div><div className="tnum truncate text-[11.5px] text-muted">{x.meetings.map((m) => `${daysLabel(m.days)} ${fmtRange(m.start, m.end)}`).join(" · ")}</div></div>
              <button onClick={() => d({ type: "add", section: x.id })} className={btn}>Switch</button>
            </div>
          )) : <p className="mt-1 text-[12px] text-muted">No other open section avoids this. Try a different course, or ask the instructor if arriving a few minutes late is OK.</p>}
        </>
      )}
    </div>
  );
}

function MiniRoute({ a, b, status }: { a: string; b: string; status: string }) {
  const bs = Object.values(BUILDINGS);
  const lat0 = Math.min(...bs.map((x) => x.lat)), lat1 = Math.max(...bs.map((x) => x.lat));
  const lng0 = Math.min(...bs.map((x) => x.lng)), lng1 = Math.max(...bs.map((x) => x.lng));
  const W = 320, H = 180, pad = 18, kx = Math.cos((38.987 * Math.PI) / 180);
  const k = Math.min((W - 2 * pad) / ((lng1 - lng0) * kx), (H - 2 * pad) / (lat1 - lat0));
  const px = (lng: number) => pad + (lng - lng0) * kx * k, py = (lat: number) => H - pad - (lat - lat0) * k;
  const A = BUILDINGS[a], B = BUILDINGS[b];
  const col = status === "short" ? "var(--err)" : status === "tight" ? "var(--warn)" : "var(--fg)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full rounded-lg border border-border bg-panel">
      {bs.map((x) => <circle key={x.code} cx={px(x.lng)} cy={py(x.lat)} r={2} fill="var(--faint)" />)}
      <line x1={px(A.lng)} y1={py(A.lat)} x2={px(B.lng)} y2={py(B.lat)} stroke={col} strokeWidth={2.5} strokeLinecap="round" />
      {[A, B].map((x, i) => (
        <g key={x.code}><circle cx={px(x.lng)} cy={py(x.lat)} r={6} fill={col} stroke="var(--bg)" strokeWidth={2} /><text x={px(x.lng) + 9} y={py(x.lat) + 4} fontSize={10} fill="var(--fg)" fontFamily="Geist Mono, monospace" fontWeight={600}>{i ? "to " : "from "}{x.code}</text></g>
      ))}
    </svg>
  );
}

export function ResultDetail() {
  const ui = useUI();
  const { s, d, active } = useStore();
  const r = ui.result!;
  const changes = r.sections.filter((x) => !active.sections.includes(x));
  const probs = problems(r.sections, active.blocks, s.travel).filter((p) => p.severity !== "info");
  const before = problems(active.sections, active.blocks, s.travel).filter((p) => p.severity !== "info");
  return (
    <div className="p-4">
      <div className="text-[15px] font-semibold">{r.label}</div>
      <div className="tnum mt-1 text-[12.5px] text-muted">{probs.length} problems (vs {before.length} in {active.name}) · {itemsFor(r.sections).length ? new Set(itemsFor(r.sections).map((i) => i.day)).size : 0} days on campus</div>
      <div className="mt-3 h-[88px]"><Thumb sections={r.sections} changed={new Set(changes)} /></div>
      <div className="mt-4 text-[11px] font-medium text-muted">Changes from {active.name}</div>
      <ul className="mt-1.5 divide-y divide-border rounded-lg border border-border text-[12.5px]">
        {changes.length ? changes.map((id) => {
          const from = active.sections.find((x) => SECTION_BY_ID[x].course === SECTION_BY_ID[id].course);
          return <li key={id} className="px-3 py-2"><span className="font-mono font-semibold">{SECTION_BY_ID[id].course}</span> <span className="text-muted">{from ? `${from.split("-")[1]} → ` : "added: "}</span><span className="font-mono">{id.split("-")[1]}</span> <span className="text-muted">· {SECTION_BY_ID[id].profs.join(", ")}</span></li>;
        }) : <li className="px-3 py-2 text-muted">No changes.</li>}
      </ul>
      <div className="mt-4 flex gap-2">
        <button onClick={() => { d({ type: "planFrom", sections: r.sections, name: "Suggested plan" }); ui.setResult(null); }} className="h-8 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg">Save as new plan</button>
        <button onClick={() => { d({ type: "setSections", sections: r.sections }); ui.setResult(null); }} className={btn}>Replace {active.name}</button>
      </div>
      <p className="mt-2 text-[11px] text-faint">Either way you can undo.</p>
    </div>
  );
}
