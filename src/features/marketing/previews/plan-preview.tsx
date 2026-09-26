import { type DragEvent, useId, useState } from "react";
import { WithTooltip } from "~/ui/tooltip";
import {
  type PreviewProps,
  SampleButton,
  SampleTag,
  type Tint,
  tint,
  vars,
} from "./preview";

// Plan, before it ships: three sample semesters. Drag a course between them
// (or use the Move form, the keyboard's and phones' way), and the GenEd
// bars follow. Solid is done, from a pretend transcript; hatched is planned.

interface Course {
  title: string;
  credits: number;
  gened: string[];
  tint: Tint;
  /** A placeholder that any matching course can fill. */
  wildcard?: boolean;
}

const COURSES: Record<string, Course> = {
  CMSC351: { title: "Algorithms", credits: 3, gened: [], tint: "blue" },
  CMSC330: {
    title: "Organization of Programming Languages",
    credits: 3,
    gened: [],
    tint: "lime",
  },
  STAT400: {
    title: "Applied Probability and Statistics I",
    credits: 3,
    gened: [],
    tint: "amber",
  },
  ENGL393: {
    title: "Technical Writing",
    credits: 3,
    gened: ["FSPW"],
    tint: "violet",
  },
  CMSC320: {
    title: "Introduction to Data Science",
    credits: 3,
    gened: [],
    tint: "teal",
  },
  CMSC414: {
    title: "Computer and Network Security",
    credits: 3,
    gened: [],
    tint: "blue",
  },
  CMSC4XX: {
    title: "Any 400-level CMSC",
    credits: 3,
    gened: [],
    tint: "lime",
    wildcard: true,
  },
  ARTT100: {
    title: "Two-Dimensional Design Fundamentals",
    credits: 3,
    gened: ["DSSP"],
    tint: "violet",
  },
  ENGL265: {
    title: "LGBTQ+ Literatures and Media",
    credits: 3,
    gened: ["DSHU", "DVUP"],
    tint: "teal",
  },
  HIST111: {
    title: "The Medieval World",
    credits: 3,
    gened: ["DSHS", "DVUP"],
    tint: "amber",
  },
  CMSC422: {
    title: "Introduction to Machine Learning",
    credits: 3,
    gened: [],
    tint: "lime",
  },
};

type Place = "s27" | "f27" | "s28" | "tray";

const TERMS: { id: Exclude<Place, "tray">; name: string }[] = [
  { id: "s27", name: "Spring 2027" },
  { id: "f27", name: "Fall 2027" },
  { id: "s28", name: "Spring 2028" },
];

const START: Record<Place, string[]> = {
  s27: ["CMSC351", "CMSC330", "STAT400", "ENGL393"],
  f27: ["CMSC320", "CMSC414", "CMSC4XX"],
  s28: ["CMSC422"],
  tray: ["ARTT100", "ENGL265", "HIST111"],
};

/** Done already, from the pretend transcript. */
const DONE: Record<string, number> = { DSHS: 1, DSHU: 1, DSSP: 0, DVUP: 0 };
const GENEDS: [code: string, name: string, needed: number][] = [
  ["DSHS", "History and Social Sciences", 2],
  ["DSHU", "Humanities", 2],
  ["DSSP", "Scholarship in Practice", 2],
  ["DVUP", "Understanding Plural Societies", 1],
];

const placeName = (p: Place) =>
  p === "tray" ? "Not placed" : (TERMS.find((t) => t.id === p)?.name ?? p);

export function PlanPreview({ mark }: PreviewProps) {
  const [plan, setPlan] = useState(START);
  const [over, setOver] = useState<Place | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const idBase = useId();

  const move = (code: string, to: Place) => {
    const next = { ...plan };
    for (const key of Object.keys(next) as Place[])
      next[key] = next[key].filter((c) => c !== code);
    next[to] = [...next[to], code];
    setPlan(next);
    setFresh(code);
    setSaid(`${code} moved to ${placeName(to)}.`);
  };

  const zone = (place: Place) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(place);
    },
    onDragLeave: () => setOver((o) => (o === place ? null : o)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const code = e.dataTransfer.getData("text/plain");
      if (COURSES[code]) move(code, place);
    },
  });

  const card = (code: string) => {
    const c = COURSES[code];
    if (!c) return null;
    return (
      <li
        key={code}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", code);
          e.dataTransfer.effectAllowed = "move";
        }}
        title={
          c.wildcard
            ? "A placeholder: any course matching CMSC4XX"
            : `${c.title}, ${c.credits} credits. Drag it to another semester.`
        }
        className={`grid cursor-grab gap-x-1.5 border border-l-4 px-1.5 py-1 active:cursor-grabbing ${c.wildcard ? "border-dashed border-hairline-strong text-muted" : ""} ${fresh === code ? "mk-pop" : ""}`}
        style={{
          gridTemplateColumns: "1fr auto",
          ...(c.wildcard ? {} : tint(c.tint)),
        }}
      >
        <span className="ident font-semibold text-sm text-fg">{code}</span>
        <span className="text-2xs tnum">{c.credits} cr</span>
        <span className="col-span-2 hidden truncate text-2xs @[420px]:block">
          {c.title}
        </span>
        {c.gened.length ? (
          <span className="col-span-2 mt-0.5 flex flex-wrap gap-0.5">
            {c.gened.map((g) => (
              <span
                key={g}
                className="border border-current px-0.5 font-semibold text-2xs"
              >
                {g}
              </span>
            ))}
          </span>
        ) : null}
      </li>
    );
  };

  const planned: Record<string, number> = {
    DSHS: 0,
    DSHU: 0,
    DSSP: 0,
    DVUP: 0,
  };
  for (const t of TERMS)
    for (const code of plan[t.id])
      for (const g of COURSES[code]?.gened ?? [])
        if (g in planned) planned[g] = (planned[g] ?? 0) + 1;

  return (
    <div className="@container relative flex w-full flex-col border border-keyline bg-raised text-sm shadow-offset">
      <SampleTag />
      <div className="flex h-9 items-center gap-2 border-b px-2.5 font-semibold text-base">
        {mark} Plan
      </div>
      <div className="grid grid-cols-3">
        {TERMS.map((t) => {
          const credits = plan[t.id].reduce(
            (n, c) => n + (COURSES[c]?.credits ?? 0),
            0,
          );
          return (
            <section
              key={t.id}
              aria-label={t.name}
              {...zone(t.id)}
              className={`flex min-h-48 flex-col border-l first:border-l-0 ${over === t.id ? "bg-panel" : ""}`}
            >
              <h3 className="flex items-baseline justify-between border-b px-2 py-1.5 font-semibold text-sm">
                <span>{t.name}</span>
                <span
                  className={`font-medium text-xs tnum ${credits < 12 ? "text-warn" : "text-muted"}`}
                >
                  {credits} cr
                  {credits < 12 ? (
                    <span className="sr-only">, under 12: not full time</span>
                  ) : null}
                </span>
              </h3>
              <ul className="flex flex-1 flex-col gap-1.5 p-1.5">
                {plan[t.id].map(card)}
              </ul>
            </section>
          );
        })}
      </div>
      <section
        aria-label="Not placed yet"
        {...zone("tray")}
        className={`flex flex-col gap-1.5 border-t px-2 py-1.5 ${over === "tray" ? "bg-panel" : ""}`}
      >
        <h3 className="font-semibold text-muted text-xs">Not placed yet</h3>
        <ul className="grid grid-cols-3 gap-1.5">{plan.tray.map(card)}</ul>
      </section>
      <MoveForm
        idBase={idBase}
        placeOf={(code) =>
          (Object.keys(plan) as Place[]).find((p) => plan[p].includes(code)) ??
          "tray"
        }
        onMove={move}
      />

      <div
        className="grid items-center gap-x-2 gap-y-1 border-t px-2.5 py-2 text-xs"
        style={{ gridTemplateColumns: "auto 1fr auto" }}
      >
        {GENEDS.map(([code, name, needed]) => {
          const done = DONE[code] ?? 0;
          const more = Math.min(planned[code] ?? 0, needed - done);
          const total = Math.min(done + more, needed);
          return (
            <GenEdRow
              key={code}
              code={code}
              name={name}
              done={done}
              planned={more}
              needed={needed}
              total={total}
            />
          );
        })}
        <p className="col-span-3 mt-0.5 text-faint">
          Solid is done (from your transcript), hatched is planned. Which course
          counts for what comes from Testudo.
        </p>
      </div>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}

const PLACES: Place[] = [...TERMS.map((t) => t.id), "tray"];

/**
 * Dragging's other way in, for the keyboard and for phones: pick a course
 * and where it goes.
 */
function MoveForm({
  idBase,
  placeOf,
  onMove,
}: {
  idBase: string;
  placeOf: (code: string) => Place;
  onMove: (code: string, to: Place) => void;
}) {
  const [code, setCode] = useState("ARTT100");
  const [to, setTo] = useState<Place>("s28");
  const select =
    "h-7 min-w-0 flex-1 border border-hairline-strong bg-raised px-1 text-sm text-fg";
  return (
    <form
      className="flex flex-wrap items-center gap-1.5 border-t px-2.5 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (placeOf(code) !== to) onMove(code, to);
      }}
    >
      <label htmlFor={`${idBase}-course`} className="text-muted">
        Move
      </label>
      <WithTooltip label="The course to move">
        <select
          id={`${idBase}-course`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={select}
        >
          {Object.keys(COURSES).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </WithTooltip>
      <label htmlFor={`${idBase}-to`} className="text-muted">
        to
      </label>
      <WithTooltip label="Where it goes">
        <select
          id={`${idBase}-to`}
          value={to}
          onChange={(e) => setTo(e.target.value as Place)}
          className={select}
        >
          {PLACES.map((p) => (
            <option key={p} value={p}>
              {placeName(p)}
            </option>
          ))}
        </select>
      </WithTooltip>
      <WithTooltip label={`Move ${code} to ${placeName(to)}`}>
        <SampleButton type="submit" size="sm">
          Move
        </SampleButton>
      </WithTooltip>
    </form>
  );
}

function GenEdRow({
  code,
  name,
  done,
  planned,
  needed,
  total,
}: {
  code: string;
  name: string;
  done: number;
  planned: number;
  needed: number;
  total: number;
}) {
  const complete = total >= needed;
  return (
    <>
      <abbr title={name} className="ident font-semibold no-underline">
        {code}
      </abbr>
      <span
        role="img"
        aria-label={`${name}: ${done} done, ${planned} planned, ${needed} needed`}
        className="forced-track relative h-2 overflow-hidden border border-hairline-strong bg-raised"
      >
        <i
          className="mk-grow forced-fill absolute inset-0 origin-left opacity-60"
          style={vars({
            backgroundColor: "var(--product-plan)",
            transform: `scaleX(${(done + planned) / needed})`,
            backgroundImage:
              "repeating-linear-gradient(135deg, transparent 0 3px, var(--raised) 3px 6px)",
          })}
        />
        <i
          className="mk-grow forced-fill absolute inset-0 origin-left"
          style={vars({
            backgroundColor: "var(--product-plan)",
            transform: `scaleX(${done / needed})`,
          })}
        />
      </span>
      <span
        className={`whitespace-nowrap tnum ${complete ? "font-semibold text-ok" : "text-muted"}`}
      >
        {total} of {needed}
        {complete ? ", done" : ""}
      </span>
    </>
  );
}
