import { useCallback, useEffect, useRef, useState } from "react";
import { PanelBody, SectionHeader } from "~/components/panel";
import { groupSectionsByInstructor } from "~/core/catalog";
import { defaultCourseColor } from "~/core/color";
import { gradesSourceWords } from "~/core/grades";
import type {
  Course,
  CourseCode,
  CourseDetailsTab,
  TermId,
} from "~/core/schema";
import { openCourse } from "~/features/courses/actions";
import { usePushAskCard } from "~/features/notifications/push-ask";
import { PushAskCard } from "~/features/notifications/push-ask-card";
import { useReadCourseNotifications } from "~/features/notifications/read-here";
import { switchTerm } from "~/features/schedule/actions";
import { useDrillEntry } from "~/features/schedule/drill-entry";
import { track } from "~/lib/analytics";
import { deptOf, useCatalog } from "~/state/catalog-store";
import { useCourseDept, useInstructors } from "~/state/data-hooks";
import {
  type CurrentPlan,
  useActiveTerm,
  useCurrentPlan,
  useFitContext,
  useTermCatalog,
} from "~/state/hooks";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Grades } from "./grades";
import { DetailsHeader } from "./header";
import { UsuallyOffered, useCourseOffering } from "./offering";
import { hasReviews } from "./reviews";
import { Sections } from "./sections";

// Course details (SPEC §3.4; UX review §3.4, the owner's option A): one page,
// no tabs. The title, then the facts that could rule the course out, then
// sections grouped by professor (rating, GPA and "Reviews" in each group's
// header, where the choice is made), then one course-wide Grades section,
// a click away from the sticky Sections bar. Opened the one way
// (`openCourse`), from anywhere.

/** The course drill-in (`/schedule/course/$code`). */
export function CourseDetails() {
  const entry = useDrillEntry("course");
  const { termId, term } = useActiveTerm();
  const catalog = useTermCatalog(termId);
  const current = useCurrentPlan();
  const course = catalog?.index.courses.get(entry.courseCode);
  // Its department first, ahead of the other ~200: no waiting on them.
  const dept = deptOf(entry.courseCode);
  useCourseDept(termId, dept);
  // A watch can start before the course has loaded (on the way back from
  // signing in): the drill-in holds its ask's place from the start.
  usePushAskCard("seat-watch");

  // A missing course is known to be missing once its department has loaded,
  // or when the term has no such department.
  const settled =
    catalog?.complete ||
    catalog?.depts[dept] === "ready" ||
    (catalog?.manifest &&
      !catalog.manifest.departments.some((d) => d.code === dept));
  if (!termId || !catalog || (!course && !settled)) return <DetailsSkeleton />;
  if (!course)
    return (
      <NotOffered
        code={entry.courseCode}
        termId={termId}
        termName={term?.name ?? "this term"}
      />
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
  // Opening the course reads its seat openings (V2.md §6.7).
  useReadCourseNotifications(termId, course.code);
  const planetTerp = useInstructors(deptOf(course.code));
  const stale = useCatalog((s) => s.appStale);
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
        termId={termId}
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
      {/* After a watch starts here: notifications on this device? (V2 §6.7) */}
      <PushAskCard moment="seat-watch" className="mx-4 mt-3" />
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
            onRetry={planetTerp.retry}
            stale={stale}
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

/**
 * A course the term doesn't have (opened from a link, or from Search's
 * greyed rows): what it is and when it's offered, and the term that has it
 * when Testudo lists one (the owner, 2026-10-05).
 */
function NotOffered({
  code,
  termId,
  termName,
}: {
  code: CourseCode;
  termId: TermId;
  termName: string;
}) {
  const offering = useCourseOffering([code], termId, false);
  const next = offering?.listedNext ?? null;
  return (
    <PanelBody className="px-4 py-4">
      {offering?.title ? (
        <h2 className="emph-title mb-2 text-balance text-lg leading-5">
          {offering.title}
        </h2>
      ) : null}
      <p className="text-base">
        <span className="ident font-semibold">{code}</span> isn't offered in{" "}
        {termName}.
      </p>
      {offering ? (
        <div className="mt-2 text-sm leading-4">
          <UsuallyOffered offering={offering} />
        </div>
      ) : null}
      {next ? (
        <WithTooltip label={`Switch to ${next.name}, which lists ${code}`}>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              switchTerm(next);
              openCourse(code);
            }}
          >
            Open {next.name}
          </Button>
        </WithTooltip>
      ) : null}
    </PanelBody>
  );
}
