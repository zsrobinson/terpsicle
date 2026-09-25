import { cn } from "cn";
import { Bookmark, BookmarkCheck, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { track } from "~/app/analytics";
import { PanelBody } from "~/app/panel";
import type { DrillViewProps } from "~/app/registry";
import { defaultCourseColor } from "~/core/color";
import { countFittingSections, sectionFits } from "~/core/fit";
import type { Course, CourseDetailsTab, TermId } from "~/core/schema";
import { dotStyle } from "~/features/calendar/tint";
import {
  openCourse,
  removeCourse,
  saveCourseForLater,
} from "~/features/courses/actions";
import { CourseColorPicker } from "~/features/courses/color-picker";
import { deptOf } from "~/state/catalog-store";
import {
  type SeatsFreshnessState,
  useInstructors,
  useSeatsFreshness,
} from "~/state/data-hooks";
import {
  type CurrentPlan,
  useActiveTerm,
  useCurrentPlan,
  useFitContext,
  useTermCatalog,
} from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { AboutTab } from "./about-tab";
import { addToPlan, saveNewCourseForLater } from "./actions";
import { GradesTab } from "./grades-tab";
import { InstructorsTab } from "./instructors-tab";
import { PrototypeDetails, prototypeVariant } from "./prototype";
import { RowModeToggle, SectionGroups } from "./section-list";

// Course details (SPEC §3.4): what the course is, every section grouped by
// instructor with how it fits, then Instructors, Grades and About. Opened the
// one way (`openCourse`), from anywhere.

/** Past this many sections, rows start compact (ENGL101 has 92). */
export const COMPACT_FROM = 20;

const TABS: readonly { id: CourseDetailsTab; label: string }[] = [
  { id: "instructors", label: "Instructors" },
  { id: "grades", label: "Grades" },
  { id: "about", label: "About" },
];

export function CourseDetails({ entry }: DrillViewProps<"course">) {
  const { termId, term } = useActiveTerm();
  const catalog = useTermCatalog(termId);
  const current = useCurrentPlan();
  const course = catalog?.index.courses.get(entry.courseCode);

  if (!termId || !catalog || (!course && !catalog.complete))
    return <DetailsSkeleton />;
  if (!course)
    return (
      <PanelBody className="px-4 py-4 text-[12.5px]">
        <p>
          <span className="font-mono font-semibold">{entry.courseCode}</span>{" "}
          isn't offered in {term?.name ?? "this term"}.
        </p>
      </PanelBody>
    );
  // Design prototype (docs/UX-REVIEW.md §4): `?cd=a|b|c` in mock mode only.
  const variant = prototypeVariant();
  if (variant)
    return (
      <PrototypeDetails
        variant={variant}
        course={course}
        termId={termId}
        current={current}
      />
    );
  return (
    <Details
      course={course}
      termId={termId}
      current={current}
      tab={entry.tab ?? "instructors"}
      onTab={(tab) => {
        track("course_details_tab", { tab });
        useUi.getState().replaceDrill({ ...entry, tab });
      }}
    />
  );
}

function Details({
  course,
  termId,
  current,
  tab,
  onTab,
}: {
  course: Course;
  termId: TermId;
  current: CurrentPlan | null;
  tab: CourseDetailsTab;
  onTab: (tab: CourseDetailsTab) => void;
}) {
  const catalog = useTermCatalog(termId);
  const fit = useFitContext();
  const planetTerp = useInstructors(deptOf(course.code));
  const [compact, setCompact] = useState(course.sections.length > COMPACT_FROM);
  const seats = catalog?.seats?.seats ?? null;
  const entry = current?.plan.courses.find((c) => c.courseCode === course.code);
  const readOnly = current?.readOnly ?? true;
  const color =
    current?.colors[course.code] ?? defaultCourseColor(course.code, []);
  const fitting = fit ? countFittingSections(fit, course) : null;
  const ptLoading =
    planetTerp.state === "loading" || planetTerp.state === "idle";

  return (
    <PanelBody>
      <header className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          {entry && !readOnly ? (
            <CourseColorPicker courseCode={course.code} color={color} />
          ) : (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={dotStyle(color)}
            />
          )}
          <span className="font-mono font-semibold text-[13px]">
            {course.code}
          </span>
          <span className="tnum text-[11.5px] text-muted">
            {creditWords(course)}
          </span>
          {[...new Set(course.genEds.flatMap((g) => g.map((o) => o.code)))].map(
            (code) => (
              <span
                key={code}
                className="rounded border border-hairline px-1 font-mono text-[10px] text-muted"
              >
                {code}
              </span>
            ),
          )}
        </div>
        <h2 className="mt-1 text-balance font-semibold text-[15px] leading-snug">
          {course.title}
        </h2>
        {readOnly || !current ? null : (
          <Actions course={course} current={current} />
        )}
      </header>

      <div className="flex items-center justify-between gap-2 px-4 pt-1 pb-1.5">
        <span className="font-medium text-[11px] text-muted">
          Sections
          {fitting !== null ? (
            <>
              {" · "}
              <span className={fitting > 0 ? "text-ok" : undefined}>
                {fitting} fit
              </span>
            </>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          <SeatsFreshness termId={termId} />
          <RowModeToggle compact={compact} onChange={setCompact} />
        </span>
      </div>
      <SectionGroups
        course={course}
        termId={termId}
        placedCode={entry?.sectionCode ?? null}
        inPlan={Boolean(entry)}
        readOnly={readOnly}
        fit={fit}
        seats={seats}
        planetTerp={planetTerp.data}
        compact={compact}
      />

      <div
        role="tablist"
        aria-label="More about this course"
        className="mt-3 flex gap-1 px-4"
      >
        {TABS.map((t) => (
          <WithTooltip key={t.id} label={`${t.label} for ${course.code}`}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`course-tab-${t.id}`}
              onClick={() => onTab(t.id)}
              className={cn(
                "h-7 rounded-md px-2.5 text-[12px] transition-colors",
                tab === t.id
                  ? "bg-hover font-medium"
                  : "text-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          </WithTooltip>
        ))}
      </div>
      <div role="tabpanel" id={`course-tab-${tab}`} className="px-4 pt-2 pb-6">
        {tab === "instructors" ? (
          <InstructorsTab
            course={course}
            planetTerp={planetTerp.data}
            loading={ptLoading}
            active
          />
        ) : tab === "grades" ? (
          <GradesTab
            course={course}
            planetTerp={planetTerp.data}
            loading={ptLoading}
          />
        ) : (
          <AboutTab course={course} onOpenCourse={openCourse} />
        )}
      </div>
    </PanelBody>
  );
}

export function creditWords(course: Course): string {
  const { min, max } = course.credits;
  if (min === max) return `${min} credit${min === 1 ? "" : "s"}`;
  return `${min}–${max} credits`;
}

export function Actions({
  course,
  current,
}: {
  course: Course;
  current: CurrentPlan;
}) {
  const fit = useFitContext();
  const entry = current.plan.courses.find((c) => c.courseCode === course.code);
  const name = current.plan.name;
  if (!entry) {
    const first =
      (fit && course.sections.find((s) => sectionFits(fit, course, s))) ??
      course.sections[0];
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {first ? (
          <WithTooltip
            label={`Adds section ${first.code}${fit && sectionFits(fit, course, first) ? ", the first that fits" : ""}; switch on the calendar`}
          >
            <Button size="sm" onClick={() => addToPlan(course, first.code)}>
              <Plus aria-hidden="true" />
              Add to {name}
            </Button>
          </WithTooltip>
        ) : null}
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
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
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
      ) : (
        <span className="flex items-center gap-1 text-[12px] text-muted">
          <BookmarkCheck size={13} aria-hidden="true" />
          Saved for later: pick a section below
        </span>
      )}
    </div>
  );
}

const FRESHNESS_TIP: Record<SeatsFreshnessState, string> = {
  loading: "",
  live: "Seat counts come from Testudo every few minutes",
  offline: "You're offline: these are the last seat counts saved here",
  archived: "Past terms keep the seat counts they had at the end",
  unknown: "Testudo hasn't given seat counts for this term yet",
};

/** "Seats as of 2 min ago", from Testudo's own time when it gave one. */
export function SeatsFreshness({ termId }: { termId: TermId }) {
  const fresh = useSeatsFreshness(termId);
  if (!fresh.text) return null;
  return (
    <WithTooltip label={FRESHNESS_TIP[fresh.state]}>
      <span className="flex items-center gap-1.5 text-[11px] text-faint">
        {fresh.state === "live" ? (
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ok" />
        ) : null}
        {fresh.text}
      </span>
    </WithTooltip>
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
