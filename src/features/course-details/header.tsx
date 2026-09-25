import { Bookmark, BookmarkCheck, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { sectionFits } from "~/core/fit";
import type { Course, CourseColor } from "~/core/schema";
import { dotStyle } from "~/features/calendar/tint";
import {
  openCourse,
  removeCourse,
  saveCourseForLater,
} from "~/features/courses/actions";
import { CourseColorPicker } from "~/features/courses/color-picker";
import { type CurrentPlan, useFitContext } from "~/state/hooks";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { AboutMore } from "./about";
import { addToPlan, saveNewCourseForLater } from "./actions";
import { permissionWords } from "./words";

// The top of course details (UX review §3.4): who the course is, then the
// facts that could rule it out (prerequisite, restriction) before anything
// else, the description clamped to two lines, and the actions.

export function creditWords(course: Course): string {
  const { min, max } = course.credits;
  if (min === max) return `${min} credit${min === 1 ? "" : "s"}`;
  return `${min}–${max} credits`;
}

export function DetailsHeader({
  course,
  current,
  color,
  inPlan,
  readOnly,
  aboutOpen,
  onAbout,
}: {
  course: Course;
  current: CurrentPlan | null;
  color: CourseColor;
  inPlan: boolean;
  readOnly: boolean;
  aboutOpen: boolean;
  onAbout: (open: boolean) => void;
}) {
  const genEds = [
    ...new Set(course.genEds.flatMap((g) => g.map((o) => o.code))),
  ];
  const facts: [string, string | null][] = [
    ["Prerequisite", course.prerequisite],
    ["Corequisite", course.corequisite],
    ["Restriction", course.restriction],
    [
      "Permission",
      course.permission ? permissionWords(course.permission) : null,
    ],
  ];
  return (
    <header className="px-4 pt-4 pb-3">
      <div className="flex items-center gap-2">
        {inPlan && !readOnly ? (
          <CourseColorPicker courseCode={course.code} color={color} />
        ) : (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={dotStyle(color)}
          />
        )}
        <span className="ident font-semibold text-base">{course.code}</span>
        <span className="tnum text-sm text-muted">{creditWords(course)}</span>
        {genEds.map((code) => (
          <span
            key={code}
            className="rounded border border-hairline px-1 ident text-xs text-muted"
          >
            {code}
          </span>
        ))}
      </div>
      <h2 className="mt-1 text-balance font-semibold text-lg leading-5">
        {course.title}
      </h2>
      <div className="mt-2 space-y-1 text-sm leading-4">
        {facts.map(([label, text]) =>
          text ? (
            <Fact key={label} label={label}>
              {text}
            </Fact>
          ) : null,
        )}
        {aboutOpen ? (
          <div className="pt-1" data-testid="about-course">
            <AboutMore course={course} onOpenCourse={openCourse} />
          </div>
        ) : course.description ? (
          <WithTooltip label={course.description}>
            <p className="line-clamp-2 text-muted">{course.description}</p>
          </WithTooltip>
        ) : null}
        <WithTooltip
          label={
            aboutOpen
              ? "Show less"
              : "The whole description, gen-eds, cross-listings and grading"
          }
        >
          <button
            type="button"
            aria-expanded={aboutOpen}
            onClick={() => onAbout(!aboutOpen)}
            className="text-sm text-muted underline underline-offset-2 hover:text-fg"
          >
            {aboutOpen ? "Less about this course" : "More about this course"}
          </button>
        </WithTooltip>
      </div>
      {readOnly || !current ? null : (
        <Actions course={course} current={current} />
      )}
    </header>
  );
}

/** "Prerequisite  Minimum grade of C- in …", two lines at most, the rest on hover. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <WithTooltip label={children}>
      <p className="line-clamp-2">
        <span className="font-medium text-fg">{label}</span>{" "}
        <span className="text-muted">{children}</span>
      </p>
    </WithTooltip>
  );
}

function Actions({
  course,
  current,
}: {
  course: Course;
  current: CurrentPlan;
}) {
  const fit = useFitContext();
  const entry = current.plan.courses.find((c) => c.courseCode === course.code);
  const name = current.plan.name;
  const first =
    (fit && course.sections.find((s) => sectionFits(fit, course, s))) ??
    course.sections[0];
  const add = first ? (
    <WithTooltip
      label={
        course.sections.length === 1
          ? `Adds section ${first.code}, the only one`
          : `Adds section ${first.code}${fit && sectionFits(fit, course, first) ? ", the first that fits" : ""}; switch on the calendar`
      }
    >
      <Button size="sm" onClick={() => addToPlan(course, first.code)}>
        <Plus aria-hidden="true" />
        Add to {name}
      </Button>
    </WithTooltip>
  ) : null;

  if (!entry)
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {add}
        <WithTooltip label="Keep it in Courses without picking a section">
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveNewCourseForLater(course.code)}
          >
            <Bookmark aria-hidden="true" />
            Save for later
          </Button>
        </WithTooltip>
      </div>
    );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {/* Saved for later with one section: there's no list to pick from. */}
      {!entry.sectionCode && course.sections.length === 1 ? add : null}
      <WithTooltip label="You can undo this" shortcut="⌘Z">
        <Button
          variant="outline"
          size="sm"
          onClick={() => removeCourse(course.code, "details")}
        >
          <Trash2 aria-hidden="true" />
          Remove from {name}
        </Button>
      </WithTooltip>
      {entry.sectionCode ? (
        <WithTooltip label="Take it off the calendar and keep it in Courses">
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveCourseForLater(course.code, "details")}
          >
            <Bookmark aria-hidden="true" />
            Save for later
          </Button>
        </WithTooltip>
      ) : course.sections.length > 1 ? (
        <span className="flex items-center gap-1 text-sm text-muted">
          <BookmarkCheck size={13} aria-hidden="true" />
          Saved for later: pick a section below
        </span>
      ) : null}
    </div>
  );
}
