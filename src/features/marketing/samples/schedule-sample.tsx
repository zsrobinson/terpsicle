import {
  Bell,
  BellOff,
  CircleAlert,
  Footprints,
  Plus,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import {
  clock,
  dot,
  SampleCard,
  type SampleProps,
  type Tint,
  tint,
} from "./sample";

// A mini scheduler on the demo plan's own courses (src/fixtures/mock/plans.ts):
// add a section and see it land on the week, catch the overlap and the tight
// walk it causes, fix it with a switch, watch a full section for a seat, and
// undo. It mirrors the scheduler's words (Problems, seat watch) but none of
// its code.

interface Meeting {
  /** Mon=0 … Fri=4, then start and end in minutes since midnight. */
  day: number;
  start: number;
  end: number;
  room: string;
}

interface SectionSample {
  code: string;
  meets: string;
  meetings: Meeting[];
  seats: string;
  full?: boolean;
}

interface CourseSample {
  code: string;
  title: string;
  tint: Tint;
  sections: SectionSample[];
}

const mwf = (start: number, end: number, room: string): Meeting[] =>
  [0, 2, 4].map((day) => ({ day, start, end, room }));
const tuth = (start: number, end: number, room: string): Meeting[] =>
  [1, 3].map((day) => ({ day, start, end, room }));

/** Already on the week: three of Plan A's courses. */
const PLACED: (CourseSample & { section: number })[] = [
  {
    code: "CMSC351",
    title: "Algorithms",
    tint: "blue",
    section: 0,
    sections: [
      {
        code: "0301",
        meets: "MWF 11:00–11:50, CSI 1115",
        meetings: mwf(660, 710, "CSI 1115"),
        seats: "3 of 200 open",
      },
    ],
  },
  {
    code: "CMSC330",
    title: "Organization of Programming Languages",
    tint: "lime",
    section: 0,
    sections: [
      {
        code: "0103",
        meets: "TuTh 9:30–10:45, IRB 0324",
        meetings: [
          ...tuth(570, 645, "IRB 0324"),
          { day: 4, start: 720, end: 770, room: "CSI 1122" },
        ],
        seats: "12 of 40 open",
      },
    ],
  },
  {
    code: "ECON200",
    title: "Principles of Micro-Economics",
    tint: "teal",
    section: 0,
    sections: [
      {
        code: "0101",
        meets: "TuTh 2:00–3:15, VMH 1330",
        meetings: tuth(840, 915, "VMH 1330"),
        seats: "40 of 300 open",
      },
    ],
  },
];

/** Waiting in the list: two sections to add, one of them full. */
const TO_ADD: Record<"stat400" | "engl393", CourseSample> = {
  stat400: {
    code: "STAT400",
    title: "Applied Probability and Statistics I",
    tint: "amber",
    sections: [
      {
        code: "0101",
        meets: "MWF 10:00–10:50, ESJ 0202",
        meetings: mwf(600, 650, "ESJ 0202"),
        seats: "Full, 12 waitlisted",
        full: true,
      },
    ],
  },
  engl393: {
    code: "ENGL393",
    title: "Technical Writing",
    tint: "violet",
    sections: [
      {
        code: "0101",
        meets: "TuTh 9:30–10:45, TWS 1100",
        meetings: tuth(570, 645, "TWS 1100"),
        seats: "5 of 19 open",
      },
      {
        code: "0404",
        meets: "MW 3:00–4:15, TWS 1104",
        meetings: [0, 2].map((day) => ({
          day,
          start: 900,
          end: 975,
          room: "TWS 1104",
        })),
        seats: "8 of 19 open",
      },
    ],
  },
};

interface State {
  /** The chosen section's index, or null while the course waits in the list. */
  stat400: number | null;
  engl393: number | null;
  watching: boolean;
}

const START: State = { stat400: null, engl393: null, watching: false };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const FIRST_HOUR = 9;
const LAST_HOUR = 17;
const ROW = 28;

function problemsOf(state: State): { text: string; fix?: keyof State }[] {
  const out: { text: string; fix?: keyof State }[] = [];
  if (state.engl393 === 0)
    out.push({
      text: "ENGL393 0101 overlaps CMSC330 0103 on Tuesday and Thursday.",
      fix: "engl393",
    });
  if (state.stat400 === 0)
    out.push({
      text: "8 min walk from ESJ to CSI in a 10 min gap, Monday, Wednesday and Friday.",
    });
  return out;
}

export function ScheduleSample(_: SampleProps) {
  const [state, setState] = useState<State>(START);
  const [undo, setUndo] = useState<{ label: string; to: State } | null>(null);
  const [status, setStatus] = useState("");

  const change = (label: string, next: Partial<State>, said: string) => {
    setUndo({ label, to: state });
    setState({ ...state, ...next });
    setStatus(said);
  };

  const problems = problemsOf(state);
  const onWeek = [
    ...PLACED.map((c) => ({ ...c, s: c.sections[c.section] })),
    ...(state.stat400 === null
      ? []
      : [{ ...TO_ADD.stat400, s: TO_ADD.stat400.sections[state.stat400] }]),
    ...(state.engl393 === null
      ? []
      : [{ ...TO_ADD.engl393, s: TO_ADD.engl393.sections[state.engl393] }]),
  ];
  const credits = 3 * onWeek.length;

  return (
    <SampleCard product="schedule" title="Plan A · Spring 2027" status={status}>
      <div
        className="grid grid-cols-[34px_repeat(5,minmax(0,1fr))] border-hairline border-b text-2xs"
        role="img"
        aria-label={`The week: ${onWeek.map((c) => `${c.code} ${c.s?.code ?? ""}`).join(", ")}`}
      >
        <div className="border-hairline border-b" />
        {DAYS.map((d) => (
          <div
            key={d}
            className="border-hairline border-b border-l py-1 text-center font-semibold text-muted"
          >
            {d}
          </div>
        ))}
        <div
          className="relative"
          style={{ height: (LAST_HOUR - FIRST_HOUR) * ROW }}
        >
          {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, k) => (
            <div
              // The hours of the day never reorder.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={k}
              className="absolute right-1 font-mono text-faint"
              style={{ top: k * ROW + 2 }}
            >
              {((FIRST_HOUR + k + 11) % 12) + 1}
              {FIRST_HOUR + k < 12 ? "a" : "p"}
            </div>
          ))}
        </div>
        {DAYS.map((d, day) => (
          <div
            key={d}
            className="relative border-hairline border-l"
            style={{
              height: (LAST_HOUR - FIRST_HOUR) * ROW,
              backgroundImage:
                "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 28px)",
            }}
          >
            {onWeek.flatMap((c) =>
              (c.s?.meetings ?? [])
                .filter((m) => m.day === day)
                .map((m) => (
                  <div
                    key={`${c.code}-${m.start}`}
                    className="mk-pop absolute inset-x-0.5 overflow-hidden border-l-2 px-1 leading-[11px]"
                    style={{
                      ...tint(c.tint),
                      top: ((m.start - FIRST_HOUR * 60) / 60) * ROW,
                      height: ((m.end - m.start) / 60) * ROW - 1,
                    }}
                  >
                    <div className="mt-px truncate font-mono font-semibold">
                      {c.code}
                    </div>
                    <div className="truncate opacity-80">{m.room}</div>
                  </div>
                )),
            )}
            {/* The tight walk, drawn where it happens. */}
            {state.stat400 === 0 && [0, 2, 4].includes(day) ? (
              <div
                className="mk-pop absolute inset-x-1 z-10 flex items-center justify-center gap-0.5 border border-warn bg-warn-soft font-semibold text-2xs text-warn"
                style={{
                  top: ((650 - FIRST_HOUR * 60) / 60) * ROW - 6,
                  height: 12,
                }}
              >
                <Footprints aria-hidden="true" className="size-2.5" />8 min
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <ul className="divide-y divide-hairline" aria-label="Sections to add">
        {(["stat400", "engl393"] as const).map((key) => {
          const course = TO_ADD[key];
          const chosen = state[key];
          const section = course.sections[chosen ?? 0];
          if (!section) return null;
          return (
            <li key={key} className="flex items-center gap-3 px-3 py-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={dot(course.tint)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="whitespace-nowrap font-mono font-semibold text-base">
                    {course.code} {section.code}
                  </span>
                  <span className="hidden truncate text-muted text-sm sm:inline">
                    {course.title}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2 text-muted text-sm">
                  <span>{section.meets}</span>
                  <span className={section.full ? "text-warn" : "text-ok"}>
                    {section.seats}
                  </span>
                </div>
              </div>
              {chosen === null ? (
                <WithTooltip
                  label={`Add ${course.code} ${section.code} to Plan A`}
                >
                  <Button
                    variant="outline"
                    size="row"
                    onClick={() =>
                      change(
                        `Add ${course.code}`,
                        { [key]: 0 },
                        `${course.code} ${section.code} added.`,
                      )
                    }
                  >
                    <Plus aria-hidden="true" className="size-3" />
                    <span className="sr-only">
                      Add {course.code} {section.code}
                    </span>
                    <span aria-hidden="true">Add {section.code}</span>
                  </Button>
                </WithTooltip>
              ) : key === "stat400" ? (
                <WithTooltip
                  label={
                    state.watching
                      ? "Stop watching for a seat"
                      : "Email me when a seat opens"
                  }
                >
                  <Button
                    variant={state.watching ? "ghost" : "outline"}
                    size="row"
                    aria-pressed={state.watching}
                    onClick={() =>
                      change(
                        state.watching ? "Stop watching" : "Watch for a seat",
                        { watching: !state.watching },
                        state.watching
                          ? "No longer watching STAT400 0101."
                          : "Watching STAT400 0101 for a seat.",
                      )
                    }
                  >
                    {state.watching ? (
                      <BellOff aria-hidden="true" className="size-3" />
                    ) : (
                      <Bell aria-hidden="true" className="size-3" />
                    )}
                    {state.watching ? "Watching" : "Watch seats"}
                  </Button>
                </WithTooltip>
              ) : (
                <span className="text-muted text-sm">In Plan A</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-hairline border-t px-3 py-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-base">
            {problems.length === 0
              ? "No problems"
              : `${problems.length} problem${problems.length === 1 ? "" : "s"}`}
          </span>
          <span className="text-muted">{credits} credits</span>
          <span className="flex-1" />
          {undo ? (
            <WithTooltip label={`Undo: ${undo.label}`} shortcut="⌘Z">
              <Button
                variant="ghost"
                size="row"
                onClick={() => {
                  setState(undo.to);
                  setUndo(null);
                  setStatus(`Undid ${undo.label}.`);
                }}
              >
                <Undo2 aria-hidden="true" className="size-3" />
                Undo
              </Button>
            </WithTooltip>
          ) : null}
        </div>
        {problems.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {problems.map((p) => (
              <li
                key={p.text}
                className="mk-arrive flex items-start gap-2 text-sm"
              >
                <CircleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-warn"
                />
                <span className="flex-1">{p.text}</span>
                {p.fix ? (
                  <WithTooltip label="Switch to a section that fits">
                    <Button
                      variant="outline"
                      size="row"
                      onClick={() =>
                        change(
                          "Switch to 0404",
                          { engl393: 1 },
                          "ENGL393 switched to 0404. No overlap.",
                        )
                      }
                    >
                      Switch to 0404
                    </Button>
                  </WithTooltip>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SampleCard>
  );
}

/** The sample's clock words, for the tests. */
export const scheduleClock = clock;
