import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "~/app/analytics";
import { PanelBody, SectionHeader } from "~/app/panel";
import type { DrillViewProps } from "~/app/registry";
import { groupSectionsByInstructor } from "~/core/catalog";
import { defaultCourseColor } from "~/core/color";
import { gradesSourceWords } from "~/core/grades";
import type { Course, CourseDetailsTab, TermId } from "~/core/schema";
import { deptOf } from "~/state/catalog-store";
import { useInstructors } from "~/state/data-hooks";
import {
  type CurrentPlan,
  useActiveTerm,
  useCurrentPlan,
  useFitContext,
  useTermCatalog,
} from "~/state/hooks";
import { Skeleton } from "~/ui/skeleton";
import { Grades } from "./grades";
import { DetailsHeader } from "./header";
import { hasReviews } from "./reviews";
import { Sections } from "./sections";

// Course details (SPEC §3.4; UX review §3.4, the owner's option A): one page,
// no tabs. The title, then the facts that could rule the course out, then
// sections grouped by professor (rating, GPA and "Reviews" in each group's
// header, where the choice is made), then one course-wide Grades section,
// a click away from the sticky Sections bar. Opened the one way
// (`openCourse`), from anywhere.

export function CourseDetails({ entry }: DrillViewProps<"course">) {
  const { termId, term } = useActiveTerm();
  const catalog = useTermCatalog(termId);
  const current = useCurrentPlan();
  const course = catalog?.index.courses.get(entry.courseCode);

  // A missing course is known to be missing once its department has loaded,
  // or when the term has no such department: no waiting on the other ~200.
  const dept = deptOf(entry.courseCode);
  const settled =
    catalog?.complete ||
    catalog?.depts[dept] === "ready" ||
    (catalog?.manifest &&
      !catalog.manifest.departments.some((d) => d.code === dept));
  if (!termId || !catalog || (!course && !settled)) return <DetailsSkeleton />;
  if (!course)
    return (
      <PanelBody className="px-4 py-4 text-base">
        <p>
          <span className="ident font-semibold">{entry.courseCode}</span> isn't
          offered in {term?.name ?? "this term"}.
        </p>
      </PanelBody>
    );
  return (
    <Details
      key={course.code}
      course={course}
      termId={termId}
      current={current}
      jumpTo={entry.tab ?? null}
    />
  );
}

function Details({
  course,
  termId,
  current,
  jumpTo,
}: {
  course: Course;
  termId: TermId;
  current: CurrentPlan | null;
  /**
   * A remembered or linked drill's `tab`, which now means "take me there":
   * grades scrolls to Grades, about opens "More about this course", and
   * instructors opens the first instructor's reviews.
   */
  jumpTo: CourseDetailsTab | null;
}) {
  const catalog = useTermCatalog(termId);
  const fit = useFitContext();
  const planetTerp = useInstructors(deptOf(course.code));
  const seats = catalog?.seats?.seats ?? null;
  const entry = current?.plan.courses.find((c) => c.courseCode === course.code);
  const readOnly = current?.readOnly ?? true;
  const color =
    current?.colors[course.code] ?? defaultCourseColor(course.code, []);
  const ptLoading =
    planetTerp.state === "loading" || planetTerp.state === "idle";
  const gradesRef = useRef<HTMLElement>(null);
  const [aboutOpen, setAboutOpen] = useState(jumpTo === "about");
  const [openReviews, setOpenReviews] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Stable, so 92 memoized rows don't all re-render when one thing changes.
  const jumpToGrades = useCallback(() => {
    track("course_details_tab", { tab: "grades" });
    // CSS can't stop a scripted smooth scroll: ask (WCAG 2.3.3).
    const still = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    gradesRef.current?.scrollIntoView?.({
      block: "start",
      behavior: still ? "auto" : "smooth",
    });
  }, []);
  const toggleReviews = useCallback((name: string) => {
    setOpenReviews((open) => {
      const next = new Set(open);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Honor a deep link once, when the data it points at is there.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !jumpTo) return;
    if (jumpTo === "grades") {
      jumped.current = true;
      gradesRef.current?.scrollIntoView?.({ block: "start" });
    } else if (jumpTo === "instructors" && !ptLoading) {
      jumped.current = true;
      const first = groupSectionsByInstructor(course)
        .flatMap((g) => g.instructors)
        .find((name) => hasReviews(planetTerp.data, name));
      if (first) setOpenReviews(new Set([first]));
    }
  }, [jumpTo, ptLoading, course, planetTerp.data]);

  return (
    <PanelBody>
      <DetailsHeader
        course={course}
        current={current}
        color={color}
        inPlan={Boolean(entry)}
        readOnly={readOnly}
        aboutOpen={aboutOpen}
        onAbout={(open) => {
          if (open) track("course_details_tab", { tab: "about" });
          setAboutOpen(open);
        }}
      />
      <Sections
        course={course}
        termId={termId}
        placedCode={entry?.sectionCode ?? null}
        inPlan={Boolean(entry)}
        planName={current?.plan.name ?? "your plan"}
        readOnly={readOnly}
        fit={fit}
        seats={seats}
        planetTerp={planetTerp.data}
        ptLoading={ptLoading}
        openReviews={openReviews}
        onToggleReviews={toggleReviews}
        onJumpToGrades={jumpToGrades}
      />
      <section
        ref={gradesRef}
        aria-label="Grades"
        className="mt-6 scroll-mt-0 pb-6"
        data-testid="grades"
      >
        <SectionHeader
          sticky
          title="Grades"
          count={gradesSourceWords(planetTerp.source?.gradesThrough ?? null)}
        />
        <div className="px-4 pt-3">
          <Grades
            course={course}
            planetTerp={planetTerp.data}
            loading={ptLoading}
            failed={planetTerp.state === "error"}
          />
        </div>
      </section>
    </PanelBody>
  );
}

function DetailsSkeleton() {
  return (
    <div
      className="flex flex-col gap-2 px-4 py-4"
      data-testid="details-loading"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}
