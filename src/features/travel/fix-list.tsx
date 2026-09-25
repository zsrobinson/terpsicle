import { useEffect, useState } from "react";
import { EmptyState, ListRow, MetaSep } from "~/app/panel";
import type { ConnectionFix } from "~/core/problems";
import type { CourseCode, SectionKey } from "~/core/schema";
import { instructorsLabel } from "~/features/courses/section-words";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { applyConnectionFix, previewFix } from "./actions";
import { meetingTimes } from "./words";

// "Sections that fix this" (SPEC §3.7): hairline rows like every list
// (docs/UX-REVIEW.md §2.4). Hovering or focusing one previews it on the
// calendar; Switch puts it in the plan (undoable, like every switch).

/** Enough to choose from without burying the rest of the details. */
const SHOWN = 5;

export function FixList({
  fixes,
  readOnly,
  courses,
}: {
  fixes: readonly ConnectionFix[];
  readOnly: boolean;
  courses: readonly (CourseCode | undefined)[];
}) {
  const [all, setAll] = useState(false);
  const [previewed, setPreviewed] = useState<SectionKey | null>(null);
  // Leaving the details (or a switch) mustn't leave a preview behind.
  useEffect(() => () => previewFix(null), []);
  const preview = (key: SectionKey | null) => {
    setPreviewed(key);
    previewFix(key);
  };

  if (fixes.length === 0) {
    const names = [...new Set(courses.filter(Boolean))].join(" or ");
    return (
      <EmptyState>
        No other section of {names} fixes this without causing a new problem.
        You could ask the instructor if arriving a few minutes late is OK.
      </EmptyState>
    );
  }

  const shown = all ? fixes : fixes.slice(0, SHOWN);
  return (
    <>
      <ul>
        {shown.map((fix) => (
          <ListRow
            as="li"
            key={fix.key}
            state={previewed === fix.key ? "previewed" : undefined}
            onPointerEnter={() => preview(fix.key)}
            onPointerLeave={() => preview(null)}
            onFocus={() => preview(fix.key)}
            onBlur={() => preview(null)}
            data-testid={`fix-${fix.key}`}
            action={
              readOnly ? undefined : (
                <WithTooltip
                  label={`Switch ${fix.courseCode} to ${fix.section.code}. You can undo this.`}
                >
                  <Button
                    variant="outline"
                    className="h-6 w-14 px-0 text-sm"
                    onClick={() => applyConnectionFix(fix.key)}
                    aria-label={`Switch ${fix.courseCode} to ${fix.section.code}`}
                  >
                    Switch
                  </Button>
                </WithTooltip>
              )
            }
          >
            <div className="truncate text-base">
              <span className="ident font-semibold">{fix.courseCode}</span>{" "}
              <span className="ident text-muted">{fix.section.code}</span>
              <MetaSep />
              <span className="text-muted text-sm">
                {instructorsLabel(fix.section)}
              </span>
            </div>
            <div className="tnum truncate text-muted text-sm">
              {meetingTimes(fix.section)}
            </div>
          </ListRow>
        ))}
      </ul>
      {fixes.length > SHOWN ? (
        <WithTooltip
          label={
            all ? "Show fewer sections" : "Show every section that fixes this"
          }
        >
          <button
            type="button"
            onClick={() => setAll(!all)}
            className="px-4 pt-2 text-muted text-sm hover:text-fg"
          >
            {all ? "Show fewer" : `Show ${fixes.length - SHOWN} more`}
          </button>
        </WithTooltip>
      ) : null}
    </>
  );
}
