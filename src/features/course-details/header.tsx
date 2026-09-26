import { Bookmark, BookmarkCheck, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Course, CourseColor } from "~/core/schema";
import { dotStyle } from "~/features/calendar/tint";
import {
  bookmarkInstead,
  openCourse,
  removeCourse,
} from "~/features/courses/actions";
import { CourseColorPicker } from "~/features/courses/color-picker";
import type { CurrentPlan } from "~/state/hooks";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { AboutMore } from "./about";
import { bookmarkCourse } from "./actions";
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

/**
 * Course-level actions (SPEC §3.4). You add a section, not a course: that's
 * each row's button. The header bookmarks a course you're weighing, and
 * takes it back out.
 */
function Actions({
  course,
  current,
}: {
  course: Course;
  current: CurrentPlan;
}) {
  const entry = current.plan.courses.find((c) => c.courseCode === course.code);
  const name = current.plan.name;

  if (!entry)
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <WithTooltip
          label={`Keep ${course.code} in Courses without picking a section`}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => bookmarkCourse(course.code)}
          >
            <Bookmark aria-hidden="true" />
            Bookmark
          </Button>
        </WithTooltip>
      </div>
    );
  if (!entry.sectionCode)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <WithTooltip
          label="Remove the bookmark. You can undo this"
          shortcut="⌘Z"
        >
          <Button
            variant="outline"
            size="sm"
            aria-pressed="true"
            onClick={() => removeCourse(course.code, "details")}
          >
            <BookmarkCheck aria-hidden="true" />
            Bookmarked
          </Button>
        </WithTooltip>
        <span className="text-sm text-muted">Pick a section below</span>
      </div>
    );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
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
      <WithTooltip
        label={`Take ${entry.sectionCode} off the calendar and keep ${course.code} bookmarked`}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => bookmarkInstead(course.code, "details")}
        >
          <Bookmark aria-hidden="true" />
          Bookmark instead
        </Button>
      </WithTooltip>
    </div>
  );
}
