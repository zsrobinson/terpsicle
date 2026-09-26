import { useEffect, useState } from "react";
import { WithTooltip } from "~/ui/tooltip";
import { SparklesIcon } from "./icons";
import { type PreviewProps, SampleTag, vars } from "./preview";

// A course's reviews, with sample instructors: the grade distribution grows
// in, the summary types itself out (it's the generated part, so it wears the
// sparkles), and its chips land. Switch instructors to see it again.

interface Instructor {
  name: string;
  rating: string;
  count: number;
  gpa: string;
  /** A, B, C, D, W, in percent. */
  grades: [number, number, number, number, number];
  summary: string;
  chips: { tone: "ok" | "warn" | "error"; text: string }[];
  quote: string;
  meta: string;
}

const MORENO: Instructor = {
  name: "A. Moreno",
  rating: "4.6",
  count: 88,
  gpa: "2.93",
  grades: [41, 33, 15, 4, 7],
  summary:
    "Clear, well-paced lectures. Exams are hard but the curve's generous; students who go to office hours rate it highly.",
  chips: [
    { tone: "ok", text: "clear lectures" },
    { tone: "error", text: "hard exams" },
    { tone: "ok", text: "generous curve" },
  ],
  quote:
    "Best lecturer I've had in CMSC. Do the practice problems before the exam, not after.",
  meta: "Anonymous, Spring 2026, grade A-",
};

const INSTRUCTORS: Instructor[] = [
  MORENO,
  {
    name: "J. Whitfield",
    rating: "3.1",
    count: 142,
    gpa: "2.48",
    grades: [22, 29, 27, 9, 13],
    summary:
      "Knows the material deeply but moves fast. Projects are heavy, and many say the discussion TAs carry the course.",
    chips: [
      { tone: "ok", text: "deep knowledge" },
      { tone: "warn", text: "fast pace" },
      { tone: "error", text: "heavy projects" },
    ],
    quote:
      "Go to discussion. The lectures assume you've already read the chapter.",
    meta: "Anonymous, Fall 2025, grade B",
  },
];

const LETTERS = ["A", "B", "C", "D", "W"];
const CHIP = {
  ok: "border-ok text-ok",
  warn: "border-warn text-warn",
  error: "border-error text-error",
};

export function ReviewsPreview({ active, reduced }: PreviewProps) {
  const [index, setIndex] = useState(0);
  // How much of the summary is typed, and whether the bars have grown.
  const [typed, setTyped] = useState(0);
  const [grown, setGrown] = useState(false);
  const who = INSTRUCTORS[index] ?? MORENO;
  const summary = who.summary;
  const full = summary.length;
  const shown = reduced ? full : typed;

  // Plays when it scrolls into view, and again for each instructor.
  useEffect(() => {
    if (!active || reduced) return;
    setTyped(0);
    setGrown(false);
    const grow = requestAnimationFrame(() => setGrown(true));
    const timer = window.setInterval(() => {
      setTyped((n) => {
        if (n + 2 >= summary.length) window.clearInterval(timer);
        return Math.min(summary.length, n + 2);
      });
    }, 14);
    return () => {
      cancelAnimationFrame(grow);
      window.clearInterval(timer);
    };
  }, [active, reduced, summary]);

  const done = shown >= full;
  const barsUp = reduced || grown;
  return (
    <div
      style={{ maxWidth: 380 }}
      className="relative w-full border border-keyline bg-raised text-base shadow-offset"
    >
      <SampleTag />
      <div className="flex flex-col gap-2 px-3 py-3">
        <div className="flex items-baseline gap-2">
          <span className="ident font-semibold text-lg">CMSC351</span>
          <span className="font-medium">Algorithms</span>
        </div>
        <fieldset className="m-0 flex w-max min-w-0 max-w-full border border-keyline p-0">
          <legend className="sr-only">Instructor</legend>
          {INSTRUCTORS.map((x, i) => (
            <WithTooltip key={x.name} label={`Show ${x.name}'s reviews`}>
              <button
                type="button"
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className="h-7 border-keyline border-l px-2.5 font-semibold text-muted text-sm first:border-l-0 aria-pressed:bg-accent aria-pressed:text-accent-fg"
              >
                {x.name}
              </button>
            </WithTooltip>
          ))}
        </fieldset>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold text-base">{who.name}</span>
          <span className="text-muted">
            <span className="font-semibold text-fg tnum">{who.rating}</span>{" "}
            from {who.count} reviews, average GPA{" "}
            <span className="font-semibold text-fg tnum">{who.gpa}</span>
          </span>
        </div>
        <div
          role="img"
          aria-label={`Grade distribution: ${LETTERS.map((l, i) => `${l} ${who.grades[i]}%`).join(", ")}`}
          className="grid h-14 grid-cols-5 items-end gap-1"
        >
          {LETTERS.map((l, i) => (
            <div
              key={l}
              className="flex h-full flex-col justify-end gap-0.5 text-center text-2xs text-muted"
            >
              <i
                className="mk-grow forced-fill block origin-bottom"
                style={vars({
                  backgroundColor:
                    l === "W"
                      ? "var(--hairline-strong)"
                      : "var(--product-reviews)",
                  "--i": i,
                  height: `${who.grades[i]}px`,
                  transform: barsUp ? "none" : "scaleY(0)",
                })}
              />
              {l} {who.grades[i]}%
            </div>
          ))}
        </div>
        <div className="flex min-h-24 flex-col gap-1 border px-2.5 py-2 text-sm">
          <span className="inline-flex items-center gap-1 font-semibold text-xs">
            <SparklesIcon className="size-3" /> Summary
          </span>
          <span className="sr-only">{who.summary}</span>
          <span aria-hidden="true" className="min-h-9">
            {who.summary.slice(0, shown)}
            {done ? null : (
              <span
                className="ml-px inline-block h-3 w-1.5 bg-fg"
                style={{ verticalAlign: -2 }}
              />
            )}
          </span>
          <span className="flex flex-wrap gap-1">
            {who.chips.map((c, i) => (
              <span
                key={c.text}
                className={`border px-1.5 font-semibold text-xs ${CHIP[c.tone]} ${done ? "mk-pop" : "opacity-0"}`}
                style={vars({ animationDelay: `${i * 80}ms` })}
              >
                {c.text}
              </span>
            ))}
          </span>
          <span className="text-faint text-xs">
            Generated from {who.count} sample reviews. Read them below.
          </span>
        </div>
        <figure className="border-t pt-2 text-sm">
          <blockquote>{who.quote}</blockquote>
          <figcaption className="mt-0.5 text-faint text-xs">
            {who.meta}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
