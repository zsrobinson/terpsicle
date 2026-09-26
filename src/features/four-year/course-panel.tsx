import { ArrowLeft, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { MessageText } from "~/app/message-text";
import { fourYearTermLabel } from "~/core/four-year/terms";
import { resolvesWildcard } from "~/core/four-year/wildcards";
import { type CourseCode, GEN_ED_LABELS } from "~/core/schema";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { addCourse, entryName, pickForPlaceholder } from "./actions";
import { useIndexEntry } from "./data";
import { useModel, usePlanNav } from "./model";

// A course, open in the side panel (`?course=CMSC351`): what the index knows
// about it, where it is in the plan, and Add (or Pick, for a placeholder).
// One Back, like the scheduler's drill-ins.

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="font-medium text-muted text-xs">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** "Fall 2025, Spring 2026 and 3 more", newest first. */
function offeredWords(offered: readonly string[]): string {
  const names = offered.slice(0, 3).map(fourYearTermLabel);
  const more = offered.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
}

export function CoursePanel({ code }: { code: CourseCode }) {
  const { doc, target, problems } = useModel();
  const nav = usePlanNav();
  const course = useIndexEntry(code);
  const placed = doc.entries.filter(
    (e) => e.kind === "course" && e.code === code,
  );
  const placeholder = nav.search.wildcard
    ? doc.entries.find((e) => e.id === nav.search.wildcard)
    : undefined;
  const resolving = placeholder?.kind === "wildcard" ? placeholder : null;
  const mine = problems.filter((p) =>
    p.subjects.some(
      (s) => s.kind === "entry" && placed.some((e) => e.id === s.entryId),
    ),
  );
  const credits = course
    ? course.credits.min === course.credits.max
      ? `${course.credits.min} credits`
      : `${course.credits.min}–${course.credits.max} credits`
    : null;

  return (
    <div className="flex flex-col">
      <div className="flex min-h-12 items-center gap-2 border-hairline border-b px-2 py-1.5">
        <WithTooltip label="Back" shortcut="Esc">
          <Button
            variant="ghost"
            size="sm"
            className="h-11 md:h-7"
            onClick={() => nav.go({ course: undefined })}
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </Button>
        </WithTooltip>
      </div>
      <div className="space-y-3 px-4 py-3">
        <div>
          <h2 className="font-mono font-semibold text-lg">{code}</h2>
          {course === undefined ? (
            <Skeleton className="mt-1 h-4 w-2/3" />
          ) : course === null ? (
            <p className="text-muted">
              {code} isn't in Testudo's course list. Check the code, or keep it
              as a note to yourself.
            </p>
          ) : (
            <p>{course.title}</p>
          )}
          {credits ? <p className="text-muted text-sm">{credits}</p> : null}
        </div>

        {resolving && course ? (
          <WithTooltip
            label={`Put ${code} in place of ${entryName(resolving)}`}
          >
            <Button
              className="h-11 md:h-8"
              onClick={() => {
                void pickForPlaceholder(resolving.id, code);
                nav.go({ wildcard: undefined, course: undefined });
              }}
              disabled={!resolvesWildcard(resolving.wildcard, course)}
            >
              Use for {entryName(resolving)}
            </Button>
          </WithTooltip>
        ) : (
          <WithTooltip label={`Add ${code} to ${fourYearTermLabel(target)}`}>
            <Button
              variant={placed.length > 0 ? "outline" : "default"}
              className="h-11 md:h-8"
              onClick={() => addCourse(doc, code, target, "search")}
            >
              <Plus aria-hidden="true" />
              Add to {fourYearTermLabel(target)}
            </Button>
          </WithTooltip>
        )}

        <dl className="space-y-3">
          {placed.length > 0 ? (
            <Fact label="In your plan">
              {placed.map((e) => fourYearTermLabel(e.term)).join(", ")}
            </Fact>
          ) : null}
          {course && course.genEds.length > 0 ? (
            <Fact label="GenEd">
              <ul className="space-y-0.5">
                {course.genEds.map((group, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: groups are positional
                  <li key={i}>
                    {group.map((option, k) => (
                      <span key={option.code}>
                        {k > 0 ? (
                          <span className="text-muted"> or </span>
                        ) : null}
                        <span className="font-mono">{option.code}</span>{" "}
                        <span className="text-muted text-sm">
                          {option.condition ?? GEN_ED_LABELS[option.code] ?? ""}
                        </span>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
          {course?.prerequisite ? (
            <Fact label="Prerequisite">
              Testudo says: {course.prerequisite}
            </Fact>
          ) : null}
          {course?.corequisite ? (
            <Fact label="Corequisite">{course.corequisite}</Fact>
          ) : null}
          {course?.restriction ? (
            <Fact label="Restriction">{course.restriction}</Fact>
          ) : null}
          {course ? (
            <Fact label="Offered">{offeredWords(course.offered)}</Fact>
          ) : null}
          {mine.length > 0 ? (
            <Fact label="Worth knowing">
              <ul className="space-y-1">
                {mine.map((p) => (
                  <li key={p.id} className="text-sm">
                    <MessageText message={p.title} />
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
