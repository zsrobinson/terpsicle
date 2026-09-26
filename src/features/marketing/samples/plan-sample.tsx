import { ArrowRight, Check, Undo2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { dot, SampleCard, type SampleProps, type Tint } from "./sample";

// A four-year plan in small: four semesters as columns, a course still to
// place, and the GenEd progress that moves when it lands. Courses and
// GenEd codes are the fixtures' real ones; the plan is made up.

interface Course {
  code: string;
  credits: number;
  tint: Tint;
  genEd?: string;
  /** A placeholder for a course not chosen yet (docs/V3.md §2.9). */
  wildcard?: boolean;
}

interface Semester {
  id: string;
  name: string;
  courses: Course[];
}

const SEMESTERS: Semester[] = [
  {
    id: "f27",
    name: "Fall 2027",
    courses: [
      { code: "CMSC351", credits: 3, tint: "blue" },
      { code: "CMSC330", credits: 3, tint: "lime" },
      { code: "STAT400", credits: 3, tint: "amber" },
      { code: "ENGL393", credits: 3, tint: "violet", genEd: "FSPW" },
      { code: "PHIL140", credits: 3, tint: "pink", genEd: "DSHU" },
    ],
  },
  {
    id: "s28",
    name: "Spring 2028",
    courses: [
      { code: "CMSC4XX", credits: 3, tint: "cyan", wildcard: true },
      { code: "MATH240", credits: 4, tint: "orange" },
      { code: "MUSC130", credits: 3, tint: "teal", genEd: "DSHU" },
    ],
  },
  {
    id: "f28",
    name: "Fall 2028",
    courses: [
      { code: "CMSC4XX", credits: 3, tint: "cyan", wildcard: true },
      { code: "CMSC4XX", credits: 3, tint: "cyan", wildcard: true },
      { code: "ARTH200", credits: 3, tint: "green", genEd: "SCIS" },
    ],
  },
  {
    id: "s29",
    name: "Spring 2029",
    courses: [{ code: "CMSC4XX", credits: 3, tint: "cyan", wildcard: true }],
  },
];

/** Waiting to be placed. */
const UNPLACED: Course = {
  code: "ECON200",
  credits: 4,
  tint: "indigo",
  genEd: "DSSP",
};

/** A few GenEd categories: done, planned and needed. */
const GEN_ED: { code: string; name: string; needed: number; done: number }[] = [
  { code: "FSPW", name: "Professional Writing", needed: 1, done: 0 },
  { code: "DSHU", name: "Humanities", needed: 2, done: 0 },
  { code: "DSSP", name: "History and Social Sciences", needed: 2, done: 1 },
  { code: "SCIS", name: "Scholarship in Practice", needed: 2, done: 0 },
];

export function PlanSample(_: SampleProps) {
  const [placedIn, setPlacedIn] = useState<string | null>(null);
  const [target, setTarget] = useState("s28");
  const [status, setStatus] = useState("");
  const selectId = useId();

  const semesters = SEMESTERS.map((s) =>
    s.id === placedIn ? { ...s, courses: [...s.courses, UNPLACED] } : s,
  );
  const planned = new Map<string, number>();
  for (const s of semesters)
    for (const c of s.courses)
      if (c.genEd) planned.set(c.genEd, (planned.get(c.genEd) ?? 0) + 1);

  return (
    <SampleCard
      product="plan"
      title="Four-year plan · Computer Science"
      status={status}
    >
      <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
        {semesters.map((s) => {
          const credits = s.courses.reduce((n, c) => n + c.credits, 0);
          return (
            <section
              key={s.id}
              aria-label={s.name}
              className="flex min-h-[150px] flex-col bg-raised px-2.5 py-2"
            >
              <div className="mb-1.5 flex items-baseline justify-between">
                <h3 className="font-semibold text-sm">{s.name}</h3>
                <span className="font-mono text-faint text-xs">
                  {credits} cr
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {s.courses.map((c, k) => (
                  <li
                    // Wildcards repeat a code; a semester's list never reorders.
                    // biome-ignore lint/suspicious/noArrayIndexKey: see above
                    key={`${c.code}-${k}`}
                    className={`flex items-center gap-1.5 text-sm ${c.code === UNPLACED.code ? "mk-pop" : ""}`}
                  >
                    {c.wildcard ? (
                      <span className="size-2 shrink-0 border border-faint border-dashed" />
                    ) : (
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={dot(c.tint)}
                      />
                    )}
                    <span
                      className={`font-mono ${c.wildcard ? "text-muted" : "font-semibold"}`}
                    >
                      {c.code}
                    </span>
                    {c.genEd ? (
                      <span className="font-mono text-faint text-2xs">
                        {c.genEd}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-hairline border-y px-3 py-2 text-sm">
        <span
          className="size-2 shrink-0 rounded-full"
          style={dot(UNPLACED.tint)}
        />
        <span className="font-mono font-semibold text-base">
          {UNPLACED.code}
        </span>
        <span className="text-muted">
          {UNPLACED.credits} cr · {UNPLACED.genEd}
        </span>
        <span className="flex-1" />
        {placedIn === null ? (
          <>
            <label htmlFor={selectId} className="text-muted">
              into
            </label>
            <select
              id={selectId}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-6 border border-hairline-strong bg-bg px-1 text-sm"
            >
              {SEMESTERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <WithTooltip label="Put ECON200 in that semester">
              <Button
                variant="outline"
                size="row"
                onClick={() => {
                  setPlacedIn(target);
                  const name =
                    SEMESTERS.find((s) => s.id === target)?.name ?? "";
                  setStatus(
                    `ECON200 placed in ${name}. DSSP: 1 done, 1 planned, 2 needed.`,
                  );
                }}
              >
                Place
                <ArrowRight aria-hidden="true" className="size-3" />
              </Button>
            </WithTooltip>
          </>
        ) : (
          <>
            <span className="text-muted">
              in {SEMESTERS.find((s) => s.id === placedIn)?.name}
            </span>
            <WithTooltip label="Take it back out">
              <Button
                variant="ghost"
                size="row"
                onClick={() => {
                  setPlacedIn(null);
                  setStatus("ECON200 is unplaced again.");
                }}
              >
                <Undo2 aria-hidden="true" className="size-3" />
                Undo
              </Button>
            </WithTooltip>
          </>
        )}
      </div>

      <ul
        className="flex flex-col gap-1.5 px-3 py-2"
        aria-label="GenEd progress"
      >
        {GEN_ED.map((g) => {
          const plan = planned.get(g.code) ?? 0;
          const done = Math.min(g.done, g.needed);
          const ahead = Math.min(plan, g.needed - done);
          const complete = done + ahead >= g.needed;
          return (
            <li
              key={g.code}
              className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 text-sm"
            >
              <span className="font-mono font-semibold">{g.code}</span>
              <div
                className="flex h-2 gap-px"
                role="img"
                aria-label={`${g.name}: ${done} done, ${ahead} planned, ${g.needed} needed`}
              >
                {Array.from({ length: g.needed }, (_, k) => (
                  <div
                    // A fixed row of cells: the index is the identity.
                    // biome-ignore lint/suspicious/noArrayIndexKey: see above
                    key={k}
                    className={`flex-1 ${
                      k < done
                        ? "bg-product-plan"
                        : k < done + ahead
                          ? "bg-product-plan/45"
                          : "bg-hover"
                    }`}
                  />
                ))}
              </div>
              <span className="flex items-center gap-1 text-muted">
                {complete ? (
                  <Check aria-hidden="true" className="size-3 text-ok" />
                ) : null}
                {done + ahead} of {g.needed}
              </span>
            </li>
          );
        })}
      </ul>
    </SampleCard>
  );
}
