import { cn } from "cn";
import { ArrowRightLeft, Check, Minus, Plus } from "lucide-react";
import { memo, type ReactNode, useEffect, useRef, useState } from "react";
import { switchSection } from "~/app/actions";
import { track } from "~/app/analytics";
import { TEXT, TONE_TEXT } from "~/app/emphasis";
import { EmptyState, GroupHeader, ListRow, SectionHeader } from "~/app/panel";
import {
  bySectionCode,
  collapsedGroupKey,
  groupSectionsByInstructor,
  hasGroupHeaders,
  type InstructorGroup,
  ONLY_FITS_FROM,
  sectionCountSize,
} from "~/core/catalog";
import {
  countFittingSections,
  type FitContext,
  fitLabel,
  sectionFits,
} from "~/core/fit";
import {
  type Course,
  type Meeting,
  type PlanetTerpDept,
  type Section,
  type SectionCode,
  type SectionKey,
  sectionKey,
  type TermId,
} from "~/core/schema";
import {
  canWatchSeats,
  type SeatStatus,
  type SeatsMap,
  seatCounts,
  seatStatus,
} from "~/core/seats";
import { formatDateSpan } from "~/core/time";
import { useSeatAlert } from "~/features/alerts/seat-alerts";
import { removeCourse } from "~/features/courses/actions";
import { SeatMeter } from "~/features/courses/seat-meter";
import { useUi } from "~/state/ui-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import {
  hasReviews,
  InstructorLine,
  InstructorMeta,
  InstructorReviews,
} from "./reviews";
import { SeatBell } from "./seat-bell";
import { SeatsFreshness } from "./seats-freshness";
import {
  deliveryWords,
  fitTone,
  fitWords,
  meetingKindWords,
  meetingWords,
  sectionMeetingWords,
} from "./words";

// Sections (SPEC §3.4): one list for every course, whether it has one
// section or ninety. One level of grouping, by professor, and only when
// there's more than one; section codes already say which sections go
// together. Every row shows all of its meetings (lecture, discussion, lab),
// its fit and its seats, and an icon button that adds it, switches to it,
// or takes it back out. Full sections can be added: their bell watches for
// a seat. Many sections add "Only fits" and pin the plan's own section on
// top. Rows preview on the calendar when hovered; ↑/↓/↵ there move the same
// highlight.

export interface SectionsProps {
  course: Course;
  termId: TermId;
  /** The plan's section of this course, if placed. */
  placedCode: SectionCode | null;
  /** The course is in the plan (placed or bookmarked). */
  inPlan: boolean;
  /** The open plan's name: "Add 0101 to Plan A". */
  planName: string;
  readOnly: boolean;
  fit: FitContext | null;
  seats: SeatsMap | null;
  planetTerp: PlanetTerpDept | null;
  ptLoading: boolean;
  /** Instructors whose "Reviews" are open. */
  openReviews: ReadonlySet<string>;
  onToggleReviews: (name: string) => void;
  onJumpToGrades: () => void;
}

/** Seat words' colors: the same as the seat meter's. */
const SEAT_TONE: Record<SeatStatus["level"], string> = {
  open: TONE_TEXT.muted,
  low: TONE_TEXT.warn,
  full: TONE_TEXT.error,
  unknown: TEXT.tertiary,
};

function GradesJump({ onJump }: { onJump: () => void }) {
  return (
    <WithTooltip label="Jump to this course's grades">
      <button
        type="button"
        onClick={onJump}
        // A 24px target (WCAG 2.5.8) in the bar's line height.
        className="-my-1 ml-auto flex h-6 items-center rounded-md px-1 text-muted text-sm hover:text-fg"
      >
        Grades ↓
      </button>
    </WithTooltip>
  );
}

export function Sections(props: SectionsProps) {
  if (props.course.sections.length === 0)
    return (
      // Theses, research and internships: Testudo lists them without sections.
      <EmptyState>
        Testudo lists no sections of {props.course.code} this term. The
        department can tell you how to register for it.
      </EmptyState>
    );
  return <SectionList {...props} />;
}

function SectionList(props: SectionsProps) {
  const { course, fit, placedCode } = props;
  const [onlyFits, setOnlyFits] = useState(false);
  const collapsed = useUi((s) => s.collapsedGroups);
  const toggleGroup = useUi((s) => s.toggleGroup);
  const n = course.sections.length;
  const many = sectionCountSize(n) === "many";
  const fitting = fit ? countFittingSections(fit, course) : null;
  // Core's rule, so the bar, the groups and "Only fits" agree: a section
  // with no set times fits (ARHU338's sections all "Contact the department").
  const fits = (s: Section) => !fit || sectionFits(fit, course, s);
  const visible = (s: Section) => !onlyFits || s.code === placedCode || fits(s);
  const placed = course.sections.find((s) => s.code === placedCode);

  const groups = groupSectionsByInstructor(course);
  const headed = hasGroupHeaders(groups);
  const [only] = groups;

  return (
    <section aria-label="Sections" data-testid="sections">
      <SectionHeader
        sticky
        title="Sections"
        count={fitting !== null ? `${fitting} of ${n} fit` : `${n}`}
        right={
          <>
            {n >= ONLY_FITS_FROM ? (
              <WithTooltip
                label={
                  onlyFits
                    ? "Show every section"
                    : "Hide sections that don't fit your plan"
                }
              >
                <button
                  type="button"
                  aria-pressed={onlyFits}
                  onClick={() => setOnlyFits(!onlyFits)}
                  className={cn(
                    "h-6 rounded-md border px-2 text-xs transition-colors",
                    onlyFits
                      ? "border-fg bg-fg text-bg hover:bg-fg/85"
                      : "border-hairline text-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  Only fits
                </button>
              </WithTooltip>
            ) : null}
            <GradesJump onJump={props.onJumpToGrades} />
          </>
        }
      />
      <div className="flex h-7 items-center justify-between gap-2 px-4 text-xs">
        <span className="font-medium text-muted">
          {many && placed ? "Your section" : null}
        </span>
        <SeatsFreshness termId={props.termId} />
      </div>
      {many && placed ? (
        <ul
          aria-label="Your section"
          className="border-hairline border-y"
          data-testid="your-section"
        >
          <SectionRow {...props} section={placed} pinned />
        </ul>
      ) : null}
      {!headed && only ? <GroupNote {...props} group={only} /> : null}
      {headed
        ? groups.map((g) => (
            <InstructorGroupRows
              key={g.name}
              {...props}
              group={g}
              sections={g.sections.filter(visible)}
              closed={collapsed.includes(collapsedGroupKey(course.code, g))}
              onToggle={() => toggleGroup(collapsedGroupKey(course.code, g))}
              fits={fits}
            />
          ))
        : only
          ? rows(props, only.sections.filter(visible))
          : null}
      {onlyFits && !course.sections.some(visible) ? (
        <EmptyState
          action={
            <WithTooltip label="Show every section">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOnlyFits(false)}
              >
                Show every section
              </Button>
            </WithTooltip>
          }
        >
          No section of {course.code} fits your plan.
        </EmptyState>
      ) : null}
    </section>
  );
}

/** A list, so a screen reader says how many sections there are and can skip past them. */
function rows(props: SectionsProps, sections: readonly Section[]): ReactNode {
  if (sections.length === 0) return null;
  return (
    <ul>
      {[...sections].sort(bySectionCode).map((s) => (
        <SectionRow key={s.code} {...props} section={s} />
      ))}
    </ul>
  );
}

function InstructorGroupRows({
  group,
  sections,
  closed,
  onToggle,
  fits,
  ...props
}: SectionsProps & {
  group: InstructorGroup;
  /** What "Only fits" leaves. */
  sections: readonly Section[];
  closed: boolean;
  onToggle: () => void;
  fits: (s: Section) => boolean;
}) {
  const { course, fit, planetTerp } = props;
  if (sections.length === 0) return null;
  const key = collapsedGroupKey(course.code, group);
  const instructor =
    group.instructors.length === 1 ? (group.instructors[0] ?? null) : null;
  const inGroup = fit ? sections.filter(fits).length : null;
  const reviewsOpen = instructor !== null && props.openReviews.has(instructor);
  return (
    <div data-group={key}>
      <GroupHeader
        sticky
        open={!closed}
        onToggle={onToggle}
        toggleLabel={`${closed ? "Show" : "Hide"} ${group.name ? `${group.name}'s sections` : "the TBA sections"}`}
        title={group.name || "Instructor TBA"}
        meta={
          <InstructorMeta
            name={instructor ? group.name : ""}
            course={course}
            planetTerp={planetTerp}
          />
        }
        right={
          <>
            <span className="tnum">
              {inGroup !== null
                ? `${inGroup} of ${sections.length} fit`
                : sections.length}
            </span>
            {instructor && hasReviews(planetTerp, instructor) ? (
              <ReviewsToggle
                open={reviewsOpen}
                onToggle={() => props.onToggleReviews(instructor)}
              />
            ) : null}
          </>
        }
      />
      {reviewsOpen && instructor ? (
        <InstructorReviews
          name={instructor}
          course={course}
          planetTerp={planetTerp}
          loading={props.ptLoading}
        />
      ) : null}
      {closed ? null : rows(props, sections)}
    </div>
  );
}

/**
 * One professor (or nobody named yet): no group header, just who teaches,
 * with their rating, GPA and "Reviews" (UX review §3.5).
 */
function GroupNote({
  group,
  ...props
}: SectionsProps & { group: InstructorGroup }) {
  const one = group.instructors.length === 1 ? group.name : null;
  const open = one !== null && props.openReviews.has(one);
  return (
    <>
      <div className="flex items-center gap-2 border-hairline border-b px-4 py-1.5 text-sm text-muted">
        {group.name ? (
          <InstructorLine
            name={group.name}
            course={props.course}
            planetTerp={props.planetTerp}
          />
        ) : (
          "Testudo hasn't named instructors for these sections yet."
        )}
        {one && hasReviews(props.planetTerp, one) ? (
          <span className="ml-auto">
            <ReviewsToggle
              open={open}
              onToggle={() => props.onToggleReviews(one)}
            />
          </span>
        ) : null}
      </div>
      {open && one ? (
        <div className="border-hairline border-b">
          <InstructorReviews
            name={one}
            course={props.course}
            planetTerp={props.planetTerp}
            loading={props.ptLoading}
          />
        </div>
      ) : null}
    </>
  );
}

function ReviewsToggle({
  open,
  onToggle: toggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const onToggle = () => {
    if (!open) track("course_details_tab", { tab: "instructors" });
    toggle();
  };
  return (
    <WithTooltip
      label={open ? "Hide reviews" : "What students say, from PlanetTerp"}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "h-6 shrink-0 rounded-md px-1.5 text-xs transition-colors",
          open ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg",
        )}
      >
        Reviews
      </button>
    </WithTooltip>
  );
}

function useWatchable(
  termId: TermId,
  key: SectionKey,
  readOnly: boolean,
  counts: ReturnType<typeof seatCounts>,
): boolean {
  const alert = useSeatAlert(termId, key);
  // A watched section keeps its bell after seats open up, so "Watching"
  // stays visible where it was set.
  return (
    !readOnly &&
    (canWatchSeats(counts) ||
      alert.kind === "watching" ||
      alert.kind === "pending")
  );
}

/** One meeting on its own line: "Lec  MWF 10–10:50am  IRB 0324". */
function MeetingLine({ meeting }: { meeting: Meeting }) {
  const when = meetingWords(meeting, { kind: false, place: false });
  const place = meeting.online
    ? meeting.timed
      ? "Online"
      : ""
    : [meeting.building, meeting.room].filter(Boolean).join(" ");
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="w-7 shrink-0 text-muted text-xs">
        {meetingKindWords(meeting.kind).short}
      </span>
      <span className="tnum shrink-0">{when}</span>
      {place ? <span className="truncate text-muted">{place}</span> : null}
    </span>
  );
}

const SectionRow = memo(function SectionRow({
  section,
  pinned = false,
  course,
  termId,
  placedCode,
  planName,
  readOnly,
  fit,
  seats,
}: SectionsProps & {
  section: Section;
  /** The copy under "Your section": it doesn't scroll itself into view. */
  pinned?: boolean;
}) {
  const key = sectionKey(course.code, section.code);
  const previewed = useUi((s) => s.previewSection === key);
  const setPreview = useUi((s) => s.setPreviewSection);
  const ref = useRef<HTMLDivElement>(null);
  const current = section.code === placedCode;
  const label = fit ? fitLabel(fit, course, section) : null;
  const counts = seatCounts(seats, key);
  const status = seatStatus(counts);
  const watch = useWatchable(termId, key, readOnly, counts);
  const delivery = deliveryWords(section.delivery);
  const dates = section.dates ? formatDateSpan(section.dates) : null;
  const full = [
    sectionMeetingWords(section),
    section.instructors.join(", ") || "Instructor TBA",
    delivery,
    dates,
    label ? fitWords(label) : null,
    status.words,
    section.restriction,
  ]
    .filter(Boolean)
    .join(" · ");

  // ↑/↓ on the calendar move the preview; keep its row in view.
  useEffect(() => {
    if (previewed && !pinned)
      ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [previewed, pinned]);

  return (
    <ListRow
      ref={ref}
      as="li"
      {...(pinned
        ? { "data-pinned-section": section.code }
        : { "data-section": section.code })}
      aria-current={current ? "true" : undefined}
      className="items-start gap-2"
      state={previewed ? "previewed" : current ? "current" : undefined}
      onPointerEnter={() => setPreview(current ? null : key)}
      onPointerLeave={() => {
        if (useUi.getState().previewSection === key) setPreview(null);
      }}
      lead={
        <span className="block w-9 ident font-semibold text-base leading-5">
          {section.code}
        </span>
      }
      trail={
        <span className="flex items-center gap-0.5">
          {watch ? (
            <SeatBell
              termId={termId}
              sectionKey={key}
              compact
              full={counts?.open === 0}
            />
          ) : null}
          {readOnly ? null : (
            <RowAction
              course={course}
              section={section}
              placedCode={placedCode}
              planName={planName}
              previewed={previewed}
              whole={full}
            />
          )}
        </span>
      }
    >
      <WithTooltip label={full}>
        <div className="min-w-0 text-sm leading-5">
          {section.meetings.length === 0 ? (
            <span className="text-muted">Contact the department for times</span>
          ) : (
            section.meetings.map((m, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a section's meetings keep their order
              <MeetingLine key={i} meeting={m} />
            ))
          )}
          <div className="truncate text-xs leading-4">
            {label && label.kind !== "in-plan" ? (
              <span className={TONE_TEXT[fitTone(label)]}>
                {fitWords(label)}
              </span>
            ) : current ? (
              <span>In {planName}</span>
            ) : null}
            <WithTooltip label={<SeatMeter seats={seats} sectionKey={key} />}>
              <span className={SEAT_TONE[status.level]}>
                {label || current ? " · " : ""}
                {status.words}
              </span>
            </WithTooltip>
            {[delivery, dates].filter(Boolean).map((w) => (
              <span key={w} className="text-muted">
                {" · "}
                {w}
              </span>
            ))}
            {section.restriction ? (
              <span className="text-warn"> · {section.restriction}</span>
            ) : null}
          </div>
        </div>
      </WithTooltip>
    </ListRow>
  );
});

/**
 * The row's one button, an icon (SPEC §3.4: you add a section, not a
 * course): plus adds it, arrows switch to it from the plan's other section,
 * and a check (a minus on hover) takes the plan's own section back out.
 * Full sections are addable like any other; Problems then offers the watch.
 */
function RowAction({
  course,
  section,
  placedCode,
  planName,
  previewed,
  whole,
}: {
  course: Course;
  section: Section;
  placedCode: SectionCode | null;
  planName: string;
  previewed: boolean;
  /** The row's whole text: its truncated parts are otherwise out of a keyboard's reach. */
  whole: string;
}) {
  const code = section.code;
  const kind = code === placedCode ? "remove" : placedCode ? "switch" : "add";
  const words =
    kind === "remove"
      ? `Remove ${course.code} ${code} from ${planName}`
      : kind === "switch"
        ? `Switch to ${code} (replaces ${placedCode})`
        : `Add ${course.code} ${code} to ${planName}`;
  const aria =
    kind === "remove"
      ? `Remove ${code} from ${planName}`
      : kind === "switch"
        ? `Switch to ${code}`
        : `Add ${code}`;
  return (
    <WithTooltip
      label={
        <span className="flex flex-col">
          <span>
            {words}
            {kind === "remove" ? ". You can undo this." : ""}
          </span>
          <span className="opacity-70">{whole}</span>
        </span>
      }
      shortcut={previewed && kind !== "remove" ? "↵" : undefined}
    >
      <Button
        variant={kind === "remove" ? "default" : "outline"}
        size="icon-sm"
        aria-label={aria}
        data-row-action={kind}
        className="group/action"
        onClick={() =>
          kind === "remove"
            ? removeCourse(course.code, "details")
            : switchSection(course.code, code, "list")
        }
      >
        {kind === "remove" ? (
          <>
            <Check
              aria-hidden="true"
              className="group-hover/action:hidden group-focus-visible/action:hidden"
            />
            <Minus
              aria-hidden="true"
              className="hidden group-hover/action:block group-focus-visible/action:block"
            />
          </>
        ) : kind === "switch" ? (
          <ArrowRightLeft aria-hidden="true" />
        ) : (
          <Plus aria-hidden="true" />
        )}
      </Button>
    </WithTooltip>
  );
}
