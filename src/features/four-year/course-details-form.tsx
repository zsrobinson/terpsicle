import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { fixedGenEds, honorsBase } from "~/core/four-year/course-lookup";
import { entryCredits } from "~/core/four-year/credits";
import { displayTitle } from "~/core/four-year/display-title";
import { GEN_ED_REQUIREMENTS } from "~/core/four-year/gen-ed";
import {
  type CourseCode,
  type CourseIndexEntry,
  GEN_ED_LABELS,
  type GenEdCode,
} from "~/core/schema";
import type {
  FourYearCourseEntry,
  FourYearCreditEntry,
} from "~/core/schema/four-year";
import { Button } from "~/ui/button";
import { CHIP_SELECTED } from "~/ui/chip";
import { Input } from "~/ui/input";
import { WithTooltip } from "~/ui/tooltip";
import { setCreditInfo, setDetails } from "./actions";
import { CountsAsField } from "./counts-as-field";
import { loadIndexEntry, useIndexEntry } from "./data";
import { useModel } from "./model";

// Course info (V3 §2.8, §2.10): what someone says about a course Testudo
// can't match, so Plan counts it. Two kinds of block take it:
// - a code Testudo doesn't list anymore (an honors seminar that rotated out,
//   an old topics course): its title, credits, GenEds and what it counts as,
//   for every entry of the code at once;
// - AP, exam or transfer credit with no UMD course ("CHEM 1XX"): what it
//   counts as, its credits and GenEds. Its title stays the transcript's.
// "Counts as" makes it meet prerequisites and repeat like that course. Undo
// takes any save back.

/** The GenEd codes in the checklist's order, each once. */
const GEN_ED_CODES: readonly GenEdCode[] = [
  ...new Set(GEN_ED_REQUIREMENTS.flatMap((r) => r.codes)),
];

function creditsProblem(text: string, max: number): string | null {
  if (text.trim() === "") return "Add its credits.";
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > max)
    return `Credits go from 0 to ${max}.`;
  return null;
}

/** GenEds in the checklist's order, once each. */
function inOrder(codes: readonly GenEdCode[]): GenEdCode[] {
  const known = GEN_ED_CODES.filter((c) => codes.includes(c));
  const other = codes.filter((c) => !GEN_ED_CODES.includes(c));
  return [...known, ...new Set(other)];
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="emph-label block text-sm">
        {label}
      </label>
      {children}
    </div>
  );
}

function CreditsInput({
  id,
  value,
  max,
  onChange,
}: {
  id: string;
  value: string;
  max: number;
  onChange: (text: string) => void;
}) {
  const problem = creditsProblem(value, max);
  return (
    <Field id={id} label="Credits">
      <WithTooltip label={`How many credits it's worth, 0 to ${max}`}>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={problem !== null}
          aria-describedby={problem ? `${id}-problem` : undefined}
          className="w-24"
        />
      </WithTooltip>
      {problem ? (
        <p id={`${id}-problem`} className="text-muted text-sm">
          {problem}
        </p>
      ) : null}
    </Field>
  );
}

function GenEdToggles({
  value,
  onChange,
  note,
}: {
  value: readonly GenEdCode[];
  onChange: (next: GenEdCode[]) => void;
  note: string;
}) {
  const toggle = (c: GenEdCode) =>
    onChange(
      value.includes(c) ? value.filter((x) => x !== c) : inOrder([...value, c]),
    );
  return (
    <fieldset className="space-y-1">
      <legend className="emph-label text-sm">GenEds it counts for</legend>
      <p className="text-muted text-sm">{note}</p>
      <div className="grid grid-cols-1 gap-1 pt-1">
        {GEN_ED_CODES.map((c) => {
          const on = value.includes(c);
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
                  on ? CHIP_SELECTED : "border-hairline-strong hover:bg-hover",
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
  );
}

function Actions({
  saveLabel,
  saveTip,
  disabledWhy,
  clear,
}: {
  saveLabel: string;
  saveTip: string;
  /** Why Save can't be pressed yet, for its tooltip; null when it can. */
  disabledWhy: string | null;
  clear: { label: string; tip: string; onClear: () => void } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <WithTooltip label={disabledWhy ?? saveTip}>
        {/* A disabled button gets no hover, so the tooltip sits on a wrapper. */}
        <span tabIndex={disabledWhy !== null ? 0 : -1}>
          <Button type="submit" disabled={disabledWhy !== null}>
            {saveLabel}
          </Button>
        </span>
      </WithTooltip>
      {clear ? (
        <WithTooltip label={clear.tip}>
          <Button type="button" variant="ghost" onClick={clear.onClear}>
            {clear.label}
          </Button>
        </WithTooltip>
      ) : null}
    </div>
  );
}

/** "Use MATH241's credits and GenEds", once a course is picked. */
function UseCourseInfo({
  course,
  what,
  onUse,
  same,
}: {
  course: CourseIndexEntry | null | undefined;
  what: "credits and GenEds" | "GenEds";
  onUse: (course: CourseIndexEntry) => void;
  /** Whether the form already says what the course would: nothing to use. */
  same: (course: CourseIndexEntry) => boolean;
}) {
  if (!course || same(course)) return null;
  return (
    <WithTooltip label={`Fill these in from ${course.code}, ${course.title}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onUse(course)}
      >
        Use {course.code}'s {what}
      </Button>
    </WithTooltip>
  );
}

/** Course info for every entry of a code Testudo doesn't list. */
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
  const [countsAs, setCountsAs] = useState<CourseCode | null>(
    saved?.countsAs ?? null,
  );
  const picked = useIndexEntry(countsAs);
  const client = useQueryClient();
  const [title, setTitle] = useState(
    saved?.title ?? displayTitle(first?.transcript?.title ?? ""),
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
  const problem = creditsProblem(credits, 20);
  const unchanged =
    saved !== null &&
    (saved.title ?? "") === title.trim() &&
    sameSet(saved.genEds, genEds) &&
    (saved.countsAs ?? null) === countsAs &&
    first !== undefined &&
    entryCredits(first, lookup) === Number(credits);

  const fillFrom = (course: CourseIndexEntry) => {
    setTitle(course.title);
    setGenEds(inOrder(fixedGenEds(course)));
    setCreditsText(String(course.credits.min));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    setDetails(
      doc,
      code,
      { title, genEds: [...genEds], countsAs },
      Number(credits),
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby={`${id}-heading`}
      className="space-y-3 border-hairline border-t pt-3"
    >
      <div className="space-y-1">
        <h3 id={`${id}-heading`} className="emph-heading">
          {saved ? "Course info" : "Add course info"}
        </h3>
        <p className="text-muted text-sm">
          If Testudo just doesn't list it anymore, say what it was. Its credits
          and GenEds then count toward your plan, and what it counts as meets
          prerequisites.
        </p>
      </div>

      <CountsAsField
        value={countsAs}
        onChange={(next) => {
          setCountsAs(next);
          // No GenEds picked yet: start from the course's info.
          if (next && genEds.length === 0)
            void loadIndexEntry(client, next).then((course) => {
              if (course) fillFrom(course);
            });
        }}
        name={code}
        suggested={base ? [base.code] : []}
        pattern={null}
      />
      <UseCourseInfo
        course={picked}
        what="credits and GenEds"
        onUse={fillFrom}
        same={(course) =>
          sameSet(fixedGenEds(course), genEds) &&
          String(course.credits.min) === credits &&
          course.title === title.trim()
        }
      />

      <Field id={`${id}-title`} label="Title">
        <WithTooltip label="What the course was called">
          <Input
            id={`${id}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What the course was called"
            maxLength={120}
            autoComplete="off"
          />
        </WithTooltip>
      </Field>

      <CreditsInput
        id={`${id}-credits`}
        value={credits}
        max={20}
        onChange={setCreditsText}
      />

      <GenEdToggles
        value={genEds}
        onChange={setGenEds}
        note="Each one you pick counts. Your degree audit has the official list."
      />

      <Actions
        saveLabel={saved ? "Save changes" : "Save course info"}
        saveTip={`Save what ${code} was`}
        disabledWhy={problem ?? (unchanged ? "Nothing's changed" : null)}
        clear={
          saved
            ? {
                label: "Clear course info",
                tip: `${code} goes back to not counting its GenEds`,
                onClear: () => {
                  setDetails(doc, code, null, first?.credits ?? null);
                  setGenEds([]);
                  setCountsAs(null);
                },
              }
            : null
        }
      />
    </form>
  );
}

/** What AP, exam or transfer credit with no UMD course counts as. */
export function CreditInfoForm({ entry }: { entry: FourYearCreditEntry }) {
  const { doc } = useModel();
  const id = useId();
  const [countsAs, setCountsAs] = useState<CourseCode | null>(
    entry.countsAs ?? null,
  );
  const picked = useIndexEntry(countsAs);
  const client = useQueryClient();
  const [credits, setCreditsText] = useState(String(entry.credits));
  const [genEds, setGenEds] = useState<readonly GenEdCode[]>(
    inOrder(entry.genEds),
  );
  const problem = creditsProblem(credits, 40);
  const decided = entry.countsAs !== undefined;
  const unchanged =
    decided &&
    (entry.countsAs ?? null) === countsAs &&
    entry.credits === Number(credits) &&
    sameSet(entry.genEds, genEds);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    setCreditInfo(doc, entry, {
      countsAs,
      credits: Number(credits),
      genEds: [...genEds],
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby={`${id}-heading`}
      className="space-y-3 border-hairline border-t pt-3"
    >
      <div className="space-y-1">
        <h3 id={`${id}-heading`} className="emph-heading">
          What it counts as
        </h3>
        <p className="text-muted text-sm">
          Your degree audit says which UMD course it counts as, if any. Pick it
          here and it meets prerequisites like that course.
        </p>
      </div>

      <CountsAsField
        value={countsAs}
        onChange={(next) => {
          setCountsAs(next);
          // The transcript's GenEds are what UMD granted; fill only an empty list.
          if (next && genEds.length === 0)
            void loadIndexEntry(client, next).then((course) => {
              if (course) setGenEds(inOrder(fixedGenEds(course)));
            });
        }}
        name={displayTitle(entry.title)}
        suggested={[]}
        pattern={entry.equivalentPattern ?? null}
      />
      <UseCourseInfo
        course={picked}
        what="GenEds"
        onUse={(course) => setGenEds(inOrder(fixedGenEds(course)))}
        same={(course) => sameSet(fixedGenEds(course), genEds)}
      />

      <CreditsInput
        id={`${id}-credits`}
        value={credits}
        max={40}
        onChange={setCreditsText}
      />

      <GenEdToggles
        value={genEds}
        onChange={setGenEds}
        note="From your transcript. Each one you pick counts; your degree audit has the official list."
      />

      <Actions
        saveLabel={decided ? "Save changes" : "Save"}
        saveTip={
          countsAs
            ? `Count ${displayTitle(entry.title)} as ${countsAs}`
            : `Keep ${displayTitle(entry.title)} as credit with no UMD course`
        }
        disabledWhy={problem ?? (unchanged ? "Nothing's changed" : null)}
        clear={null}
      />
    </form>
  );
}
