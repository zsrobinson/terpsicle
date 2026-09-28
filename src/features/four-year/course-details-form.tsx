import { cn } from "cn";
import { type FormEvent, useId, useState } from "react";
import { detailsFromCourse, honorsBase } from "~/core/four-year/course-lookup";
import { entryCredits } from "~/core/four-year/credits";
import { GEN_ED_REQUIREMENTS } from "~/core/four-year/gen-ed";
import { type CourseCode, GEN_ED_LABELS, type GenEdCode } from "~/core/schema";
import type { FourYearCourseEntry } from "~/core/schema/four-year";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import { WithTooltip } from "~/ui/tooltip";
import { setDetails } from "./actions";
import { useModel } from "./model";

// Details for a code Testudo doesn't list anymore (V3 §2.2): an honors
// seminar that rotated out, an old topics course. The person says what it
// was, its credits and the GenEds it covered, and Plan counts it like any
// other course. Every entry of the code takes them; Undo takes them back.

/** The GenEd codes in the checklist's order, each once. */
const GEN_ED_CODES: readonly GenEdCode[] = [
  ...new Set(GEN_ED_REQUIREMENTS.flatMap((r) => r.codes)),
];

const MAX_CREDITS = 20;

function creditsProblem(text: string): string | null {
  if (text.trim() === "") return "Add its credits.";
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > MAX_CREDITS)
    return `Credits go from 0 to ${MAX_CREDITS}.`;
  return null;
}

export function CourseDetailsForm({
  code,
  entries,
}: {
  code: CourseCode;
  entries: readonly FourYearCourseEntry[];
}) {
  const { doc, lookup } = useModel();
  const id = useId();
  const [first] = entries;
  const saved = entries.find((e) => e.details)?.details ?? null;
  const base = honorsBase(lookup, code);
  const [title, setTitle] = useState(
    saved?.title ?? first?.transcript?.title ?? "",
  );
  const [credits, setCreditsText] = useState(
    first?.credits !== null && first?.credits !== undefined
      ? String(first.credits)
      : base
        ? String(base.credits.min)
        : "3",
  );
  const [genEds, setGenEds] = useState<readonly GenEdCode[]>(
    saved?.genEds ?? [],
  );
  const problem = creditsProblem(credits);
  const unchanged =
    saved !== null &&
    (saved.title ?? "") === title.trim() &&
    saved.genEds.length === genEds.length &&
    saved.genEds.every((c) => genEds.includes(c)) &&
    first !== undefined &&
    entryCredits(first, lookup) === Number(credits);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    setDetails(doc, code, { title, genEds: [...genEds] }, Number(credits));
  };

  const toggle = (c: GenEdCode) =>
    setGenEds((now) =>
      now.includes(c)
        ? now.filter((x) => x !== c)
        : GEN_ED_CODES.filter((x) => x === c || now.includes(x)),
    );

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby={`${id}-heading`}
      className="space-y-3 border-hairline border-t pt-3"
    >
      <div className="space-y-1">
        <h3 id={`${id}-heading`} className="font-semibold">
          {saved ? "Course info" : "Add course info"}
        </h3>
        <p className="text-muted text-sm">
          If Testudo just doesn't list it anymore, say what it was. Its credits
          and GenEds then count toward your plan.
        </p>
      </div>

      {base ? (
        <WithTooltip label={`Fill these in from ${base.code}, ${base.title}`}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const from = detailsFromCourse(base);
              setTitle(from.title ?? "");
              setGenEds(from.genEds);
              setCreditsText(String(base.credits.min));
            }}
          >
            Use {base.code}'s info
          </Button>
        </WithTooltip>
      ) : null}

      <div className="space-y-1">
        <label htmlFor={`${id}-title`} className="block font-medium text-sm">
          Title
        </label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What the course was called"
          maxLength={120}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor={`${id}-credits`} className="block font-medium text-sm">
          Credits
        </label>
        <Input
          id={`${id}-credits`}
          type="number"
          inputMode="decimal"
          min={0}
          max={MAX_CREDITS}
          step="any"
          value={credits}
          onChange={(e) => setCreditsText(e.target.value)}
          aria-invalid={problem !== null}
          aria-describedby={problem ? `${id}-credits-problem` : undefined}
          className="w-24"
        />
        {problem ? (
          <p id={`${id}-credits-problem`} className="text-muted text-sm">
            {problem}
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-1">
        <legend className="font-medium text-sm">GenEds it covered</legend>
        <p className="text-muted text-sm">
          Each one you pick counts. Your degree audit has the official list.
        </p>
        <div className="grid grid-cols-1 gap-1 pt-1">
          {GEN_ED_CODES.map((c) => {
            const on = genEds.includes(c);
            const label = GEN_ED_LABELS[c] ?? c;
            return (
              <WithTooltip
                key={c}
                label={on ? `Doesn't count as ${label}` : `Counts as ${label}`}
              >
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(c)}
                  className={cn(
                    "flex min-h-7 items-baseline gap-1.5 border px-2 py-1 text-left text-sm transition-colors max-md:min-h-11 max-md:items-center",
                    on
                      ? "border-fg bg-fg text-bg hover:bg-fg/85"
                      : "border-hairline-strong hover:bg-hover",
                  )}
                >
                  <span className="ident shrink-0">{c}</span>
                  <span
                    className={cn("min-w-0 truncate", on ? "" : "text-muted")}
                  >
                    {label}
                  </span>
                </button>
              </WithTooltip>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <WithTooltip
          label={
            problem ??
            (unchanged ? "Nothing's changed" : `Save what ${code} was`)
          }
        >
          {/* A disabled button gets no hover, so the tooltip sits on a wrapper. */}
          <span tabIndex={problem !== null || unchanged ? 0 : -1}>
            <Button type="submit" disabled={problem !== null || unchanged}>
              {saved ? "Save changes" : "Save course info"}
            </Button>
          </span>
        </WithTooltip>
        {saved ? (
          <WithTooltip label={`${code} goes back to not counting its GenEds`}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDetails(doc, code, null, first?.credits ?? null);
                setGenEds([]);
              }}
            >
              Clear course info
            </Button>
          </WithTooltip>
        ) : null}
      </div>
    </form>
  );
}
