import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Mark } from "~/app/brand/mark";
import { WithTooltip } from "~/ui/tooltip";
import { type PreviewProps, SampleTag, type Tint, vars } from "./preview";

// Todo, before it ships: a sample week from an ELMS calendar feed. The Due
// lane fills in over the week, and you can tick things off. Everything in
// it comes from the feed (Gradescope work linked in ELMS is tagged).

interface Due {
  id: number;
  course: string;
  tint: Tint;
  title: string;
  /** 1 = today (Mon 28) … 5 = Fri 2. */
  day: number;
  time: string;
  exam?: boolean;
  gradescope?: boolean;
}

const DUE: Due[] = [
  {
    id: 1,
    course: "MATH240",
    tint: "amber",
    title: "WebAssign 5: subspaces and bases",
    day: 2,
    time: "11:59pm",
  },
  {
    id: 2,
    course: "GEOL110",
    tint: "teal",
    title: "Lab 4 report: mineral identification",
    day: 1,
    time: "2:00pm",
  },
  {
    id: 3,
    course: "PHIL140",
    tint: "violet",
    title: "Reading response 3: Singer",
    day: 3,
    time: "9:00am",
  },
  {
    id: 4,
    course: "CMSC216",
    tint: "blue",
    title: "Project 2: shell",
    day: 4,
    time: "11:59pm",
    gradescope: true,
  },
  {
    id: 5,
    course: "CMSC216",
    tint: "blue",
    title: "Quiz 3 (in discussion)",
    day: 4,
    time: "12:00pm",
    exam: true,
  },
  {
    id: 6,
    course: "GEOL110",
    tint: "teal",
    title: "Pre-lab 5 quiz",
    day: 5,
    time: "8:00am",
  },
];

const DAYS = ["", "Mon 28", "Tue 29", "Wed 30", "Thu 1", "Fri 2"];

const GROUPS: [string, (d: Due) => boolean][] = [
  ["Today", (d) => d.day === 1],
  ["Tomorrow", (d) => d.day === 2],
  ["This week", (d) => d.day > 2],
];

/** "9:00am" before "2:00pm": by the clock, not the string. */
function minutes(time: string): number {
  const m = /^(\d+):(\d+)(am|pm)$/.exec(time);
  if (!m) return 0;
  const h = (Number(m[1]) % 12) + (m[3] === "pm" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

export function TodoPreview({ active, reduced }: PreviewProps) {
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());
  const [said, setSaid] = useState("");
  // The Due lane fills in once, when it scrolls into view.
  const [filled, setFilled] = useState(reduced);
  useEffect(() => {
    if (reduced || active) setFilled(true);
  }, [active, reduced]);

  const open = DUE.filter((d) => !done.has(d.id)).length;
  const toggle = (d: Due, checked: boolean) => {
    const next = new Set(done);
    if (checked) next.add(d.id);
    else next.delete(d.id);
    setDone(next);
    const left = DUE.filter((x) => !next.has(x.id)).length;
    setSaid(`${d.title} ${checked ? "done" : "reopened"}. ${left} open.`);
  };

  return (
    <div className="relative flex w-full max-w-[340px] flex-col overflow-hidden border border-keyline bg-raised text-base shadow-pop">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2.5">
        <Mark id="todo" size={22} />
        <span className="flex flex-col leading-4">
          <span className="font-semibold text-lg">Todo</span>
          <span className="text-muted text-xs">{open} open</span>
        </span>
        <ChevronDown size={12} aria-hidden="true" className="text-muted" />
        <span className="ml-auto text-muted text-xs">Fall 2026</span>
        <SampleTag inline />
      </div>
      <div
        role="img"
        aria-label={`Due this week: ${DUE.map((d) => `${d.title}, ${DAYS[d.day]}`).join("; ")}`}
        className="grid shrink-0 grid-cols-[22px_repeat(5,minmax(0,1fr))] border-b bg-panel"
      >
        <span className="rotate-180 py-1 text-center font-semibold text-2xs text-muted uppercase tracking-wider [writing-mode:vertical-rl]">
          Due
        </span>
        {[1, 2, 3, 4, 5].map((day) => (
          <div
            key={day}
            className="flex min-h-16 flex-col gap-0.5 border-l px-0.5 py-1"
          >
            <span
              className={`font-semibold text-2xs ${day === 1 ? "text-fg" : "text-muted"}`}
            >
              {DAYS[day]}
            </span>
            {DUE.filter((d) => d.day === day).map((d, i) => (
              <span
                key={d.id}
                className={`truncate border border-l-4 bg-raised px-1 text-2xs ${done.has(d.id) ? "text-muted line-through" : "text-fg"} ${filled ? "mk-pop" : "opacity-0"}`}
                style={vars({
                  borderLeftColor: done.has(d.id)
                    ? "var(--hairline-strong)"
                    : `var(--course-${d.tint}-border)`,
                  animationDelay: `${(day + i) * 110}ms`,
                })}
              >
                {d.title}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col pb-1.5">
        {GROUPS.map(([name, match]) => {
          const rows = DUE.filter(match).sort(
            (a, b) => minutes(a.time) - minutes(b.time),
          );
          return (
            <section key={name} aria-label={name}>
              <h3 className="flex justify-between px-3 pt-1.5 pb-1 font-semibold text-muted text-xs">
                <span>{name}</span>
                <span>{rows.filter((r) => !done.has(r.id)).length} open</span>
              </h3>
              <ul>
                {rows.map((d) => (
                  <li key={d.id} className="border-t">
                    <WithTooltip
                      label={done.has(d.id) ? "Mark as not done" : "Mark done"}
                    >
                      <label className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-x-2 px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={done.has(d.id)}
                          onChange={(e) => toggle(d, e.target.checked)}
                          className="mt-0.5 accent-fg"
                        />
                        <span className="min-w-0">
                          <span
                            className={`block font-semibold text-sm ${done.has(d.id) ? "text-muted line-through" : ""}`}
                          >
                            {d.exam ? (
                              <span className="text-warn">Exam · </span>
                            ) : null}
                            {d.title}
                          </span>
                          <span className="flex gap-1.5 text-muted text-xs">
                            <span className="ident">{d.course}</span>
                            <span>
                              {d.gradescope
                                ? "Gradescope, via ELMS"
                                : "from ELMS"}
                            </span>
                          </span>
                        </span>
                        <span className="text-right text-muted text-xs tnum whitespace-nowrap">
                          {DAYS[d.day]}
                          <br />
                          {d.time}
                        </span>
                      </label>
                    </WithTooltip>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="flex justify-between gap-2 border-t px-3 py-2 text-muted text-xs">
        <span>ELMS feed checked 14 min ago.</span>
        <span>A push at 6pm the day before.</span>
      </div>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
