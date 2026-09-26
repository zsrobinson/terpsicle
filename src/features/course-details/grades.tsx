import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  type GradeBar,
  type GradeSegment,
  gradeBars,
  gradeSentence,
  gradeSummary,
} from "~/core/grades";
import type {
  Course,
  GradeRecord,
  InstructorSlug,
  PlanetTerpDept,
} from "~/core/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { courseInstructors, instructorFor } from "./planetterp";

// Grades (SPEC §3.4), the last section of course details: the sentence
// first ("64% got an A or B · average GPA 2.93"), then PlanetTerp-style
// bars: A, B, C, D, F, W and Other, each letter split into +, plain and −.
// Words before charts (DESIGN §5).

const BAR_HEIGHT = 112;

/** Darker for +, lighter for −: the order reads without a legend. */
const SHADE: Record<GradeSegment["modifier"], string> = {
  "+": "bg-fg/80",
  "": "bg-fg/55",
  "−": "bg-fg/30",
};

/** The course's grades: the sentence, then bars, for everyone or one instructor. */
export function Grades({
  course,
  planetTerp,
  loading,
}: {
  course: Course;
  planetTerp: PlanetTerpDept | null;
  loading: boolean;
}) {
  const grades = planetTerp?.courses[course.code];
  const [who, setWho] = useState<InstructorSlug | "all">("all");

  if (loading)
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  if (!grades?.all)
    return (
      <p className="text-sm text-muted">
        PlanetTerp has no grades for {course.code} yet.
      </p>
    );

  // This term's instructors first: they're the ones you can pick. Everyone
  // else PlanetTerp remembers goes in "Past instructors".
  const teaching = new Set(
    courseInstructors(course).flatMap((name) => {
      const pt = instructorFor(planetTerp, name);
      return pt ? [pt.slug] : [];
    }),
  );
  const people = Object.entries(grades.byInstructor)
    .map(([slug, record]) => ({
      slug,
      name: planetTerp?.instructors[slug]?.name ?? slug,
      record,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const current = people.filter((p) => teaching.has(p.slug));
  const past = people.filter((p) => !teaching.has(p.slug));
  const pastPicked = past.find((p) => p.slug === who);
  const record: GradeRecord =
    who === "all" ? grades.all : (grades.byInstructor[who] ?? grades.all);
  const summary = gradeSummary(record.counts);
  const sentence = gradeSentence(summary);

  return (
    <div>
      {people.length > 1 ? (
        <div
          className="-mx-1 mb-3 flex flex-wrap gap-1 px-1"
          role="radiogroup"
          aria-label="Whose grades"
        >
          <WhoChip
            label="All instructors"
            on={who === "all"}
            onPick={() => setWho("all")}
          />
          {current.map((p) => (
            <WhoChip
              key={p.slug}
              label={p.name}
              on={who === p.slug}
              onPick={() => setWho(p.slug)}
            />
          ))}
          {past.length > 0 ? (
            <DropdownMenu>
              <WithTooltip label="Instructors who taught it before this term">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-sm transition-colors",
                      pastPicked
                        ? "bg-hover font-medium"
                        : "text-muted hover:text-fg data-[state=open]:text-fg",
                    )}
                  >
                    {pastPicked ? pastPicked.name : "Past instructors"}
                    <ChevronDown size={12} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
              </WithTooltip>
              <DropdownMenuContent className="max-h-72" align="start">
                <DropdownMenuRadioGroup
                  value={pastPicked?.slug ?? ""}
                  onValueChange={(slug) => setWho(slug)}
                >
                  {past.map((p) => (
                    <DropdownMenuRadioItem key={p.slug} value={p.slug}>
                      {p.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
      {sentence ? (
        <p className="tnum text-base">
          <span className="font-semibold">{sentence.split(" · ")[0]}</span>
          <span className="text-muted"> · {sentence.split(" · ")[1]}</span>
        </p>
      ) : null}
      <Bars bars={gradeBars(record.counts)} />
      <p className="mt-2 text-xs text-faint">
        {summary.students.toLocaleString()} students over {record.semesters}{" "}
        semester{record.semesters === 1 ? "" : "s"}, from PlanetTerp.
      </p>
    </div>
  );
}

function WhoChip({
  label,
  on,
  onPick,
}: {
  label: string;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <WithTooltip label={on ? `Showing ${label}` : `Show ${label}`}>
      {/* biome-ignore lint/a11y/useSemanticElements: a chip row, not a form */}
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={onPick}
        className={cn(
          "h-7 shrink-0 rounded-md px-2.5 text-sm transition-colors",
          on ? "bg-hover font-medium" : "text-muted hover:text-fg",
        )}
      >
        {label}
      </button>
    </WithTooltip>
  );
}

function pct(share: number): string {
  const p = share * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}

export function Bars({ bars }: { bars: readonly GradeBar[] }) {
  const tallest = Math.max(...bars.map((b) => b.share), 0.0001);
  return (
    <div
      className="mt-3 grid grid-cols-7 items-end gap-2"
      role="img"
      aria-label={bars.map((b) => `${b.letter} ${pct(b.share)}`).join(", ")}
      data-testid="grade-bars"
    >
      {bars.map((bar) => (
        <div key={bar.letter} className="flex flex-col items-center gap-1">
          <span className="tnum text-xs text-muted">{pct(bar.share)}</span>
          <div
            className="flex w-full flex-col justify-end overflow-hidden rounded-sm bg-hover"
            style={{ height: BAR_HEIGHT }}
          >
            {bar.segments.map((segment) =>
              segment.count > 0 ? (
                <WithTooltip
                  key={segment.key}
                  label={`${segment.key}: ${segment.count.toLocaleString()} student${segment.count === 1 ? "" : "s"} · ${pct(segment.share)}`}
                >
                  <div
                    data-grade={segment.key}
                    className={cn(
                      "forced-fill w-full transition-opacity hover:opacity-80",
                      bar.letter === "W" || bar.letter === "Other"
                        ? "bg-fg/20"
                        : SHADE[segment.modifier],
                    )}
                    style={{
                      height: (segment.share / tallest) * BAR_HEIGHT,
                    }}
                  />
                </WithTooltip>
              ) : null,
            )}
          </div>
          <span className="font-medium ident text-sm">{bar.letter}</span>
        </div>
      ))}
    </div>
  );
}
