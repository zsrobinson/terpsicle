import {
  Bell,
  BellRing,
  Check,
  CircleCheck,
  CircleX,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { type PreviewProps, SampleTag, type Tint, tint, vars } from "./preview";

// A mini scheduler with sample sections: add a section, see it on the week
// and in the problems, fix a problem, watch a full section, undo. It
// mirrors the real one's words (Problems, Seat watch) but none of its code.

type SectionKey = "cmsc330" | "stat400" | "econ200";

interface SampleSection {
  label: string;
  meets: string;
  /** Day (0 = Mon), start and end hour. */
  blocks: [number, number, number][];
  room: string;
  seats: string;
  seatTone?: "low" | "full";
}

const COURSES: Record<
  SectionKey,
  { code: string; name: string; tint: Tint; sections: SampleSection[] }
> = {
  cmsc330: {
    code: "CMSC330",
    name: "Organization of Programming Languages",
    tint: "lime",
    sections: [
      {
        label: "0101",
        meets: "MWF 11:00–11:50, IRB 2107",
        blocks: [
          [0, 11, 11.83],
          [2, 11, 11.83],
          [4, 11, 11.83],
        ],
        room: "IRB 2107",
        seats: "22 of 150 open",
      },
      {
        label: "0205",
        meets: "MWF 9:00–9:50, IRB 2107",
        blocks: [
          [0, 9, 9.83],
          [2, 9, 9.83],
          [4, 9, 9.83],
        ],
        room: "IRB 2107",
        seats: "40 of 150 open",
      },
    ],
  },
  stat400: {
    code: "STAT400",
    name: "Applied Probability and Statistics I",
    tint: "amber",
    sections: [
      {
        label: "0101",
        meets: "TuTh 11:00–12:15, MTH 0101",
        blocks: [
          [1, 11, 12.25],
          [3, 11, 12.25],
        ],
        room: "MTH 0101",
        seats: "6 of 60 open",
        seatTone: "low",
      },
      {
        label: "0301",
        meets: "TuTh 12:30–1:45, MTH 0101",
        blocks: [
          [1, 12.5, 13.75],
          [3, 12.5, 13.75],
        ],
        room: "MTH 0101",
        seats: "19 of 60 open",
      },
    ],
  },
  econ200: {
    code: "ECON200",
    name: "Principles of Micro-Economics",
    tint: "teal",
    sections: [
      {
        label: "0101",
        meets: "TuTh 2:00–3:15, VMH 1330",
        blocks: [
          [1, 14, 15.25],
          [3, 14, 15.25],
        ],
        room: "VMH 1330",
        seats: "Full, 12 waitlisted",
        seatTone: "full",
      },
    ],
  },
};

/** What's in the plan before you touch anything. */
const ALREADY: {
  day: number;
  s: number;
  e: number;
  code: string;
  room: string;
  tint: Tint;
}[] = [
  { day: 1, s: 11, e: 12.25, code: "CMSC351", room: "IRB 0318", tint: "blue" },
  { day: 3, s: 11, e: 12.25, code: "CMSC351", room: "IRB 0318", tint: "blue" },
  { day: 2, s: 10, e: 10.83, code: "CMSC351", room: "IRB 1207", tint: "blue" },
  {
    day: 0,
    s: 12,
    e: 13.25,
    code: "ENGL393",
    room: "TWS 1100",
    tint: "violet",
  },
  {
    day: 2,
    s: 12,
    e: 13.25,
    code: "ENGL393",
    room: "TWS 1100",
    tint: "violet",
  },
];

interface State {
  /** The chosen section's index, or null when the course isn't added. */
  cmsc330: number | null;
  stat400: number | null;
  econ200: number | null;
  watching: boolean;
}

const START: State = {
  cmsc330: 0,
  stat400: null,
  econ200: null,
  watching: false,
};

type Tone = "error" | "warn" | "ok";

interface Problem {
  id: string;
  tone: Tone;
  title: string;
  detail: string;
  fix?: {
    label: string;
    tip: string;
    next: Partial<State>;
    icon?: "bell" | "ring";
  };
  note?: string;
}

function problemsOf(st: State): Problem[] {
  const list: Problem[] = [];
  if (st.stat400 === 0)
    list.push({
      id: "overlap",
      tone: "error",
      title: "STAT400 0101 overlaps CMSC351 0201",
      detail: "Tue, Thu 11:00–12:15. Both meet at the same time.",
      fix: {
        label: "Switch to 0301",
        tip: "Move STAT400 to section 0301, TuTh 12:30–1:45",
        next: { stat400: 1 },
      },
    });
  if (st.cmsc330 === 0)
    list.push({
      id: "walk",
      tone: "error",
      title: "Not enough time to get from CMSC330 to ENGL393",
      detail:
        "18 min needed from IRB to Tawes, 10 min between classes. Mon, Wed.",
      fix: {
        label: "Switch to 0205",
        tip: "Move CMSC330 to section 0205, MWF 9:00–9:50",
        next: { cmsc330: 1 },
      },
    });
  if (st.stat400 === 1 && st.econ200 !== null)
    list.push({
      id: "tight",
      tone: "warn",
      title: "Tight connection from STAT400 to ECON200",
      detail:
        "15 min needed from Kirwan to Van Munching, 15 min between classes. Tue, Thu.",
      note: "Fine at a typical pace. Nothing to do unless you walk slowly.",
    });
  if (st.econ200 !== null)
    list.push(
      st.watching
        ? {
            id: "watching",
            tone: "ok",
            title: "Watching ECON200 0101 for a seat",
            detail: "You'll get an email and a push when a seat opens.",
            fix: {
              label: "Watching",
              tip: "Stop watching for a seat",
              next: { watching: false },
              icon: "ring",
            },
          }
        : {
            id: "full",
            tone: "warn",
            title: "ECON200 0101 is full",
            detail:
              "12 on the waitlist. Keep it in the plan and watch for a seat.",
            fix: {
              label: "Watch for a seat",
              tip: "Watch ECON200 0101 for a seat",
              next: { watching: true },
              icon: "bell",
            },
          },
    );
  return list;
}

const FROM = 9;
const TO = 16;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function clock(t: number): string {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return `${((h + 11) % 12) + 1}:${m < 10 ? "0" : ""}${m}`;
}

/** Nothing to start: it waits for you. */
export function SchedulePreview(_: PreviewProps) {
  const [st, setSt] = useState<State>(START);
  const [past, setPast] = useState<State[]>([]);
  // The course just added or moved: its blocks pop in.
  const [fresh, setFresh] = useState<string | null>(null);
  // The problems a change brought: they slide in.
  const [arrived, setArrived] = useState<string[]>([]);

  const commit = (change: Partial<State>, freshId: string | null) => {
    const next = { ...st, ...change };
    const had = new Set(problemsOf(st).map((p) => p.id));
    setPast((p) => [...p, st]);
    setSt(next);
    setFresh(freshId);
    setArrived(
      problemsOf(next)
        .map((p) => p.id)
        .filter((id) => !had.has(id)),
    );
  };
  const restore = (to: State, history: State[]) => {
    setPast(history);
    setSt(to);
    setFresh(null);
    setArrived([]);
  };

  const keys = Object.keys(COURSES) as SectionKey[];
  const blocks = [
    ...ALREADY.map((b) => ({ ...b, fresh: false })),
    ...keys.flatMap((k) => {
      const index = st[k];
      if (index === null) return [];
      const course = COURSES[k];
      const section = course.sections[index];
      if (!section) return [];
      return section.blocks.map(([day, s, e]) => ({
        day,
        s,
        e,
        code: course.code,
        room: section.room,
        tint: course.tint,
        fresh: fresh === k,
      }));
    }),
  ];
  const pills: { day: number; at: number; label: string; tone: Tone }[] = [];
  if (st.cmsc330 === 0)
    for (const day of [0, 2])
      pills.push({ day, at: 11.92, label: "18 min", tone: "error" });
  if (st.stat400 === 1) {
    for (const day of [1, 3])
      pills.push({ day, at: 12.37, label: "4 min", tone: "ok" });
    if (st.econ200 !== null)
      for (const day of [1, 3])
        pills.push({ day, at: 13.87, label: "15 min", tone: "warn" });
  }
  const problems = problemsOf(st);
  const count = problems.filter((p) => p.tone !== "ok").length;
  const credits = 6 + keys.filter((k) => st[k] !== null).length * 3;

  return (
    <div className="relative flex w-full flex-col gap-3 text-base @container">
      <Week blocks={blocks} pills={pills} />
      <div className="grid grid-cols-1 items-start gap-3 @[540px]:grid-cols-2">
        <div className="border border-keyline bg-raised shadow-offset">
          <div className="flex h-8 items-center gap-2 border-b px-2.5 text-muted text-sm">
            <Search size={14} aria-hidden="true" />
            <span className="font-medium text-fg">Fits my plan</span>
            <span className="ml-auto">
              <SampleTag inline label="Sample seats" />
            </span>
          </div>
          <ul>
            {keys.map((k) => {
              const course = COURSES[k];
              const index = st[k];
              const section = course.sections[index ?? 0];
              if (!section) return null;
              const added = index !== null;
              return (
                <li
                  key={k}
                  className={`flex items-center gap-2 border-t px-2.5 py-2 first:border-t-0 ${added ? "bg-panel" : ""}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">
                      <span className="ident">{course.code}</span>{" "}
                      <span className="font-normal text-muted text-xs">
                        3 cr
                      </span>
                    </span>
                    <span className="text-sm">{course.name}</span>
                    <span className="truncate text-muted text-xs">
                      {added ? `In your plan: ${section.label}, ` : ""}
                      {section.meets}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {added ? (
                      <WithTooltip label="In your plan">
                        <Button
                          size="icon-sm"
                          aria-label={`${course.code} is in your plan`}
                          aria-disabled="true"
                          className="shadow-none"
                        >
                          <Check aria-hidden="true" />
                        </Button>
                      </WithTooltip>
                    ) : (
                      <WithTooltip
                        label={`Add section ${section.label} to your plan`}
                      >
                        <Button
                          size="icon-sm"
                          variant="outline"
                          aria-label={`Add ${course.code} ${section.label}`}
                          onClick={() => commit({ [k]: 0 }, k)}
                        >
                          <Plus aria-hidden="true" />
                        </Button>
                      </WithTooltip>
                    )}
                    <span
                      className={`whitespace-nowrap font-semibold text-xs ${section.seatTone === "full" ? "text-error" : section.seatTone === "low" ? "text-warn" : "text-muted"}`}
                    >
                      {section.seats}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="border border-keyline bg-raised shadow-offset">
          <div className="flex items-baseline gap-3 border-b px-2.5 py-2">
            <span aria-live="polite" className="font-semibold">
              {count
                ? `${count} problem${count === 1 ? "" : "s"}`
                : "No problems"}
            </span>
            <span className="text-muted text-sm">{credits} credits</span>
            <span className="ml-auto flex gap-3">
              <WithTooltip label="Undo the last change">
                <button
                  type="button"
                  disabled={past.length === 0}
                  onClick={() => {
                    const prev = past.at(-1);
                    if (prev) restore(prev, past.slice(0, -1));
                  }}
                  className="font-semibold text-muted text-sm underline underline-offset-4 hover:text-fg disabled:opacity-50"
                >
                  Undo
                </button>
              </WithTooltip>
              <WithTooltip label="Start the demo over">
                <button
                  type="button"
                  onClick={() => restore(START, [])}
                  className="font-semibold text-muted text-sm underline underline-offset-4 hover:text-fg"
                >
                  Reset
                </button>
              </WithTooltip>
            </span>
          </div>
          {problems.length === 0 ? (
            <p className="px-2.5 py-3 text-muted">
              <span className="block font-semibold text-ok">
                This plan fits.
              </span>
              Every section's in, nothing overlaps, and every walk is long
              enough.
            </p>
          ) : (
            <ul>
              {problems.map((p) => (
                <li
                  key={p.id}
                  className={`grid grid-cols-[16px_1fr] gap-x-2 gap-y-0.5 border-t px-2.5 py-2 first:border-t-0 ${arrived.includes(p.id) ? "mk-arrive" : ""}`}
                >
                  <ProblemIcon tone={p.tone} />
                  <span className="font-semibold">{p.title}</span>
                  <span className="col-start-2 text-muted text-sm">
                    {p.detail}
                  </span>
                  <span className="col-start-2 mt-1 flex flex-wrap items-center gap-2">
                    {p.fix ? (
                      <WithTooltip label={p.fix.tip}>
                        <Button
                          size="row"
                          variant="outline"
                          aria-pressed={
                            p.fix.icon === "ring" ? true : undefined
                          }
                          onClick={() => {
                            const next = p.fix?.next ?? {};
                            commit(
                              next,
                              "stat400" in next
                                ? "stat400"
                                : "cmsc330" in next
                                  ? "cmsc330"
                                  : null,
                            );
                          }}
                        >
                          {p.fix.icon === "bell" ? (
                            <Bell aria-hidden="true" />
                          ) : null}
                          {p.fix.icon === "ring" ? (
                            <BellRing aria-hidden="true" />
                          ) : null}
                          {p.fix.label}
                        </Button>
                      </WithTooltip>
                    ) : null}
                    {p.note ? (
                      <span className="text-muted text-sm">{p.note}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ProblemIcon({ tone }: { tone: Tone }) {
  const cls = `mt-0.5 size-3.5 ${tone === "error" ? "text-error" : tone === "warn" ? "text-warn" : "text-ok"}`;
  if (tone === "error") return <CircleX aria-label="Problem" className={cls} />;
  if (tone === "warn")
    return <TriangleAlert aria-label="Heads-up" className={cls} />;
  return <CircleCheck aria-label="Handled" className={cls} />;
}

function Week({
  blocks,
  pills,
}: {
  blocks: {
    day: number;
    s: number;
    e: number;
    code: string;
    room: string;
    tint: Tint;
    fresh: boolean;
  }[];
  pills: { day: number; at: number; label: string; tone: Tone }[];
}) {
  const hours = Array.from({ length: TO - FROM - 1 }, (_, k) => FROM + 1 + k);
  return (
    <div
      role="img"
      aria-label={`A sample week: ${[...new Set(blocks.map((b) => b.code))].join(", ")}`}
      className="relative overflow-hidden border bg-raised text-2xs [--hpx:36px] md:[--hpx:40px]"
    >
      <div className="grid h-6 grid-cols-[30px_repeat(5,minmax(0,1fr))] items-center border-b font-semibold text-muted text-xs">
        <span />
        {DAYS.map((d) => (
          <span key={d} className="border-l pl-1">
            {d}
          </span>
        ))}
      </div>
      <div
        className="grid grid-cols-[30px_repeat(5,minmax(0,1fr))]"
        style={{ height: `calc(${TO - FROM} * var(--hpx))` }}
      >
        <div className="relative">
          {hours.map((h) => (
            <span
              key={h}
              className="-translate-y-1/2 absolute right-1 text-faint tnum"
              style={{ top: `calc(${h - FROM} * var(--hpx))` }}
            >
              {((h + 11) % 12) + 1}
              {h < 12 ? "am" : "pm"}
            </span>
          ))}
        </div>
        {DAYS.map((d, day) => (
          <div
            key={d}
            className="relative border-l"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px var(--hpx))",
            }}
          >
            {blocks
              .filter((b) => b.day === day)
              .map((b) => (
                <div
                  key={`${b.code}-${b.s}`}
                  className={`absolute inset-x-0.5 flex flex-col overflow-hidden border border-t-4 px-1 py-0.5 ${b.fresh ? "mk-pop" : ""}`}
                  style={{
                    ...tint(b.tint),
                    top: `calc(${b.s - FROM} * var(--hpx))`,
                    height: `calc(${b.e - b.s} * var(--hpx) - 2px)`,
                  }}
                >
                  <b className="ident font-semibold">{b.code}</b>
                  <span className="hidden truncate md:block">
                    {clock(b.s)}–{clock(b.e)}
                  </span>
                  {b.e - b.s >= 1 ? (
                    <span className="hidden truncate md:block">{b.room}</span>
                  ) : null}
                </div>
              ))}
            {pills
              .filter((p) => p.day === day)
              .map((p) => (
                <span
                  key={`${p.at}`}
                  className={`-translate-x-1/2 -translate-y-1/2 absolute left-1/2 z-10 inline-flex h-4 items-center whitespace-nowrap border bg-raised px-1 font-semibold ${p.tone === "error" ? "border-error text-error" : p.tone === "warn" ? "border-warn text-warn" : "border-ok text-ok"}`}
                  style={vars({ top: `calc(${p.at - FROM} * var(--hpx))` })}
                >
                  {p.label}
                </span>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
