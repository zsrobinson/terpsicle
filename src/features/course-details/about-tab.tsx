import type { ReactNode } from "react";
import type { Course, CourseCode } from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";
import { genEdGroupWords, genEdLabel } from "./words";

// About (SPEC §3.4): the catalog's words, as text. Prerequisites and
// restrictions are shown, not enforced.

export function AboutTab({
  course,
  onOpenCourse,
}: {
  course: Course;
  onOpenCourse: (code: CourseCode) => void;
}) {
  const rows: { label: string; value: ReactNode }[] = [];
  const text = (label: string, value: string | null) => {
    if (value) rows.push({ label, value });
  };
  text("Prerequisite", course.prerequisite);
  text("Corequisite", course.corequisite);
  text("Restriction", course.restriction);
  text("Permission", course.permission);
  for (const note of course.otherNotes) text(note.label, note.text);
  if (course.genEds.length > 0)
    rows.push({
      label: "Gen-eds",
      value: (
        <ul className="space-y-0.5">
          {course.genEds.map((group) => (
            <li key={genEdGroupWords(group)}>
              <span className="font-mono text-[12px]">
                {genEdGroupWords(group)}
              </span>
              <span className="text-muted">
                {" "}
                · {group.map((o) => genEdLabel(o.code)).join(" or ")}
              </span>
            </li>
          ))}
        </ul>
      ),
    });
  if (course.crossListings.length > 0)
    rows.push({
      label: "Also listed as",
      value: (
        <span className="flex flex-wrap gap-1.5">
          {course.crossListings.map((code) => (
            <WithTooltip key={code} label={`Open ${code}`}>
              <button
                type="button"
                onClick={() => onOpenCourse(code)}
                className="font-mono text-[12px] underline underline-offset-2 hover:text-muted"
              >
                {code}
              </button>
            </WithTooltip>
          ))}
        </span>
      ),
    });
  if (course.gradingMethods.length > 0)
    text("Grading", course.gradingMethods.join(", "));

  return (
    <div className="text-[12.5px] leading-relaxed">
      {course.description ? (
        <p className="text-muted">{course.description}</p>
      ) : (
        <p className="text-muted">
          Testudo has no description for this course.
        </p>
      )}
      {rows.length > 0 ? (
        <dl className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="font-medium text-[11.5px] text-muted">
                {r.label}
              </dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
