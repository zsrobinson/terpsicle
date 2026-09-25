import type { ReactNode } from "react";
import type { Course, CourseCode } from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";
import { genEdGroupWords, genEdLabel } from "./words";

// "More about this course", opened in place under the header facts: the
// catalog's words, as text. Prerequisites and the like are already above,
// so this is the rest. Shown, never enforced.

export function AboutMore({
  course,
  onOpenCourse,
}: {
  course: Course;
  onOpenCourse: (code: CourseCode) => void;
}) {
  const rows: { label: string; value: ReactNode }[] = [];
  for (const note of course.otherNotes)
    rows.push({ label: note.label, value: note.text });
  if (course.genEds.length > 0)
    rows.push({
      label: "Gen-eds",
      value: (
        <ul className="space-y-0.5">
          {course.genEds.map((group) => (
            <li key={genEdGroupWords(group)}>
              <span className="ident">{genEdGroupWords(group)}</span>
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
                className="ident underline underline-offset-2 hover:text-muted"
              >
                {code}
              </button>
            </WithTooltip>
          ))}
        </span>
      ),
    });
  if (course.gradingMethods.length > 0)
    rows.push({ label: "Grading", value: course.gradingMethods.join(", ") });

  return (
    <div className="text-sm leading-5">
      <p className="text-muted">
        {course.description ?? "Testudo has no description for this course."}
      </p>
      {rows.length > 0 ? (
        <dl className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="font-medium">{r.label}</dt>
              <dd className="text-muted">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
