import { Star } from "lucide-react";
import { useState } from "react";
import { WithTooltip } from "~/ui/tooltip";
import { SampleCard, type SampleProps } from "./sample";

// A course's reviews page in small: pick an instructor, and see one rating
// (Terpsicle's reviews and PlanetTerp's, combined), the grade distribution
// and what students wrote. Instructors are the fixtures' (invented), and
// the words are made up.

interface Grades {
  a: number;
  b: number;
  c: number;
  d: number;
  f: number;
  w: number;
}

interface InstructorSample {
  name: string;
  short: string;
  rating: number;
  /** Terpsicle's count and PlanetTerp's. */
  counts: [number, number];
  grades: Grades;
  reviews: { text: string; when: string; source: "Terpsicle" | "PlanetTerp" }[];
}

const COURSE = {
  code: "STAT400",
  title: "Applied Probability and Statistics I",
};

const INSTRUCTORS: InstructorSample[] = [
  {
    name: "Kemi Adeyemi",
    short: "K. Adeyemi",
    rating: 4.3,
    counts: [21, 64],
    grades: { a: 38, b: 34, c: 15, d: 5, f: 3, w: 5 },
    reviews: [
      {
        text: "Lectures follow the book closely, so the reading actually pays off. Homework is long but it's exactly what's on the exams.",
        when: "Spring 2026",
        source: "Terpsicle",
      },
      {
        text: "Fair grader, and office hours are worth it. Go early in the semester before the line forms.",
        when: "Fall 2025",
        source: "PlanetTerp",
      },
    ],
  },
  {
    name: "Rana Haddad",
    short: "R. Haddad",
    rating: 3.6,
    counts: [8, 29],
    grades: { a: 24, b: 33, c: 24, d: 8, f: 4, w: 7 },
    reviews: [
      {
        text: "Moves fast and skips the easy examples. If you've seen probability before you'll be fine; if not, do the practice sets.",
        when: "Spring 2026",
        source: "PlanetTerp",
      },
      {
        text: "Exams are harder than the homework, but there's a generous curve. The 9am section is quieter.",
        when: "Fall 2025",
        source: "Terpsicle",
      },
    ],
  },
];

const GRADE_LABELS: (keyof Grades)[] = ["a", "b", "c", "d", "f", "w"];
const GRADE_FILL: Record<keyof Grades, string> = {
  a: "bg-ok",
  b: "bg-ok/70",
  c: "bg-warn/70",
  d: "bg-warn/45",
  f: "bg-error/70",
  w: "bg-faint/50",
};

export function ReviewsSample(_: SampleProps) {
  const [which, setWhich] = useState(0);
  const [status, setStatus] = useState("");
  const it = INSTRUCTORS[which] ?? INSTRUCTORS[0];
  if (!it) return null;
  const total = it.counts[0] + it.counts[1];
  return (
    <SampleCard
      product="reviews"
      title={
        <>
          <span className="font-mono">{COURSE.code}</span>{" "}
          <span className="font-normal text-muted">{COURSE.title}</span>
        </>
      }
      status={status}
    >
      <fieldset
        className="flex gap-1 border-hairline border-b px-3 py-2"
        aria-label="Instructor"
      >
        {INSTRUCTORS.map((i, k) => (
          <WithTooltip key={i.name} label={`Reviews of ${i.name}`}>
            <button
              type="button"
              aria-pressed={k === which}
              onClick={() => {
                setWhich(k);
                setStatus(
                  `Showing ${i.name}: rated ${i.rating} from ${i.counts[0] + i.counts[1]} reviews.`,
                );
              }}
              className="h-7 border border-transparent px-2.5 font-semibold text-base text-muted hover:bg-hover hover:text-fg aria-pressed:border-keyline aria-pressed:bg-raised aria-pressed:text-fg aria-pressed:shadow-xs"
            >
              {i.name}
            </button>
          </WithTooltip>
        ))}
      </fieldset>

      <div className="grid gap-4 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-1.5">
            <span className="mk-pop mk-number font-semibold" key={it.name}>
              {it.rating.toFixed(1)}
            </span>
            <span className="flex text-warn" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className="size-3.5"
                  fill={n <= Math.round(it.rating) ? "currentColor" : "none"}
                />
              ))}
            </span>
          </div>
          <div className="text-muted text-sm">
            {total} reviews: {it.counts[0]} on Terpsicle, {it.counts[1]} on
            PlanetTerp
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">Grades</span>
            <span className="text-muted">
              {it.grades.a + it.grades.b}% A or B
            </span>
          </div>
          <div
            className="flex h-3 w-full gap-px overflow-hidden"
            role="img"
            aria-label={GRADE_LABELS.map(
              (g) => `${g.toUpperCase()} ${it.grades[g]}%`,
            ).join(", ")}
          >
            {GRADE_LABELS.map((g) => (
              <div
                key={g}
                className={`mk-grow ${GRADE_FILL[g]}`}
                style={{ width: `${it.grades[g]}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between font-mono text-2xs text-faint">
            {GRADE_LABELS.map((g) => (
              <span key={g}>{g.toUpperCase()}</span>
            ))}
          </div>
        </div>
      </div>

      <ul
        className="divide-y divide-hairline border-hairline border-t"
        aria-label={`Reviews of ${it.name}`}
      >
        {it.reviews.map((r) => (
          <li
            key={r.text}
            className="mk-arrive flex flex-col gap-1 px-3 py-2 text-base"
          >
            <p>{r.text}</p>
            <div className="text-muted text-sm">
              {r.when} · {r.source}
            </div>
          </li>
        ))}
      </ul>
    </SampleCard>
  );
}
