import { useEffect, useState } from "react";
import type { ConnectionFix } from "~/core/problems";
import type { CourseCode } from "~/core/schema";
import { instructorsLabel } from "~/features/courses/section-words";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { applyConnectionFix, previewFix } from "./actions";
import { meetingTimes } from "./words";

// "Sections that fix this" (SPEC §3.7). Hovering or focusing one previews it
// on the calendar; Switch puts it in the plan (undoable, like every switch).

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
  // Leaving the details (or a switch) mustn't leave a preview behind.
  useEffect(() => () => previewFix(null), []);

  if (fixes.length === 0) {
    const names = [...new Set(courses.filter(Boolean))].join(" or ");
    return (
      <p className="text-[12px] text-muted leading-snug">
        No other section of {names} fixes this without causing a new problem.
        You could ask the instructor if arriving a few minutes late is OK.
      </p>
    );
  }

  const shown = all ? fixes : fixes.slice(0, SHOWN);
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {shown.map((fix) => (
          <li
            key={fix.key}
            onPointerEnter={() => previewFix(fix.key)}
            onPointerLeave={() => previewFix(null)}
            onFocus={() => previewFix(fix.key)}
            onBlur={() => previewFix(null)}
            className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2 transition-colors hover:border-hairline-strong"
            data-testid={`fix-${fix.key}`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px]">
                <span className="font-medium font-mono">
                  {fix.courseCode} {fix.section.code}
                </span>
                <span className="text-muted">
                  {" "}
                  · {instructorsLabel(fix.section)}
                </span>
              </div>
              <div className="tnum truncate text-[11.5px] text-muted">
                {meetingTimes(fix.section)}
              </div>
            </div>
            {readOnly ? null : (
              <WithTooltip
                label={`Switch ${fix.courseCode} to ${fix.section.code}. You can undo this.`}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="font-normal text-[12px]"
                  onClick={() => applyConnectionFix(fix.key)}
                  aria-label={`Switch ${fix.courseCode} to ${fix.section.code}`}
                >
                  Switch
                </Button>
              </WithTooltip>
            )}
          </li>
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
            className="mt-1.5 text-[12px] text-muted hover:text-fg"
          >
            {all ? "Show fewer" : `Show ${fixes.length - SHOWN} more`}
          </button>
        </WithTooltip>
      ) : null}
    </>
  );
}
