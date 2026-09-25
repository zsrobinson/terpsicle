import { cn } from "cn";
import { memo, type ReactNode, useEffect, useRef, useState } from "react";
import { switchSection } from "~/app/actions";
import { track } from "~/app/analytics";
import { TEXT, TONE_TEXT } from "~/app/emphasis";
import { MessageText } from "~/app/message-text";
import { EmptyState, GroupHeader, ListRow, SectionHeader } from "~/app/panel";
import {
  collapsedGroupKey,
  factorMeetings,
  groupSectionsByInstructor,
  groupSectionsByTime,
  ONLY_FITS_FROM,
  type SectionCountSize,
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
  type FitLabel,
  type Meeting,
  type PlanetTerpDept,
  type Problem,
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
import { SeatMeter } from "~/features/courses/seat-meter";
import { usePlanProblems } from "~/state/hooks";
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
  compactMeetingWords,
  deliveryWords,
  fitTone,
  fitWords,
  meetingWords,
  restMeetingWords,
  sectionMeetingWords,
  shortFitWords,
  shortSeatWords,
} from "./words";

// Sections (SPEC §3.4, UX review §3.4–3.5), shaped by how many there are:
// one reads as "this is the class"; a few get full rows grouped by
// instructor; many get one-line rows, "Only fits", and the plan's own
// section pinned. In every group, meetings all its sections share are said
// once ("All meet TuTh 9:30–10:45am IRB 0324") and rows show what differs.
// Rows preview on the calendar when hovered; ↑/↓/↵ there move the same
// highlight. Section order never changes.

export interface SectionsProps {
  course: Course;
  termId: TermId;
  /** The plan's section of this course, if placed. */
  placedCode: SectionCode | null;
  /** The course is in the plan (placed or saved): "Switch" rather than "Add". */
  inPlan: boolean;
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

export function Sections(props: SectionsProps) {
  const size = sectionCountSize(props.course.sections.length);
  const only = props.course.sections[0];
  if (size === "one")
    return only ? (
      <OneSection {...props} section={only} />
    ) : (
      // Theses, research and internships: Testudo lists them without sections.
      <EmptyState>
        Testudo lists no sections of {props.course.code} this term. The
        department can tell you how to register for it.
      </EmptyState>
    );
  return <SectionList {...props} size={size} />;
}

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

// ---------- one section: "this is the class" ----------

function OneSection({
  section,
  ...props
}: SectionsProps & { section: Section }) {
  const { course, termId, readOnly, fit, seats, planetTerp } = props;
  const key = sectionKey(course.code, section.code);
  const counts = seatCounts(seats, key);
  const label = fit ? fitLabel(fit, course, section) : null;
  const name = section.instructors.join(", ");
  const first = section.instructors[0] ?? "";
  const delivery = deliveryWords(section.delivery);
  const watch = useWatchable(termId, key, readOnly, counts);
  return (
    <section aria-label="Sections" data-testid="sections">
      <SectionHeader
        sticky
        title="One section"
        count={<span className="ident">{section.code}</span>}
        right={<GradesJump onJump={props.onJumpToGrades} />}
      />
      <div className="flex h-7 items-center justify-end px-4">
        <SeatsFreshness termId={termId} />
      </div>
      <dl
        className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 pb-3 text-sm leading-4"
        data-section={section.code}
      >
        <dt className="text-muted">Meets</dt>
        <dd className="tnum">
          {section.meetings.length === 0
            ? "Contact the department for times"
            : section.meetings.map((m) => (
                <div key={meetingWords(m)}>{meetingWords(m)}</div>
              ))}
          {delivery || section.dates ? (
            <div className="text-muted">
              {[delivery, section.dates ? formatDateSpan(section.dates) : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          ) : null}
        </dd>
        <dt className="text-muted">Taught by</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2">
          <InstructorLine name={name} course={course} planetTerp={planetTerp} />
          {first && hasReviews(planetTerp, first) ? (
            <ReviewsToggle
              open={props.openReviews.has(first)}
              onToggle={() => props.onToggleReviews(first)}
            />
          ) : null}
        </dd>
        <dt className="text-muted">Fit</dt>
        <dd>
          <OneSectionFit
            label={label}
            courseCode={course.code}
            sectionKey={key}
            placed={section.code === props.placedCode}
          />
        </dd>
        <dt className="text-muted">Seats</dt>
        <dd className="flex items-center gap-2">
          <SeatMeter seats={seats} sectionKey={key} />
          {watch ? (
            <SeatBell
              termId={termId}
              sectionKey={key}
              compact
              full={counts?.open === 0}
            />
          ) : null}
        </dd>
        {section.restriction ? (
          <>
            <dt className="text-muted">Note</dt>
            <dd className="text-warn">{section.restriction}</dd>
          </>
        ) : null}
      </dl>
      {first && props.openReviews.has(first) ? (
        <div className="border-hairline border-t">
          <InstructorReviews
            name={first}
            course={course}
            planetTerp={planetTerp}
            loading={props.ptLoading}
          />
        </div>
      ) : null}
    </section>
  );
}

/**
 * The one section's fit in words. When it's already in the plan, "In your
 * plan", then whatever the plan's problems say about it, so a tight
 * connection reads as a sentence rather than "0 fit".
 */
function OneSectionFit({
  label,
  courseCode,
  sectionKey: key,
  placed,
}: {
  label: FitLabel | null;
  courseCode: string;
  sectionKey: SectionKey;
  placed: boolean;
}) {
  const problems = usePlanProblems();
  if (!placed)
    return label ? (
      <span className={TONE_TEXT[fitTone(label)]}>{fitWords(label)}</span>
    ) : (
      <span className="text-muted">Checking…</span>
    );
  const mine = problemsAbout(problems, courseCode, key);
  return (
    <div>
      <div>In your plan{mine.length === 0 ? ", with no problems" : ""}</div>
      {mine.map((p) => (
        <div
          key={p.id}
          className={
            p.severity === "error"
              ? "text-error"
              : p.severity === "warning"
                ? "text-warn"
                : "text-muted"
          }
        >
          <MessageText message={p.title} />
        </div>
      ))}
    </div>
  );
}

/** The plan's problems that name this course, its section, or a connection to or from it. */
export function problemsAbout(
  problems: readonly Problem[],
  courseCode: string,
  key: SectionKey,
): Problem[] {
  return problems.filter((p) =>
    p.subjects.some((s) =>
      s.kind === "course"
        ? s.courseCode === courseCode
        : s.kind === "section"
          ? s.sectionKey === key
          : s.kind === "connection"
            ? s.connectionId.includes(`${key}#`)
            : false,
    ),
  );
}

// ---------- a few or many: the list ----------

type GroupView = {
  key: string;
  title: ReactNode;
  /** Facts beside the title: an instructor's rating and GPA. */
  meta?: ReactNode;
  /** "Show …"/"Hide …" plus this: "Grace Kowalczyk's sections". */
  toggleLabel: string;
  /** The instructor behind "Reviews", when the group is one person. */
  instructor: string | null;
  sections: readonly Section[];
  /** The header says when: rows say only where. */
  whereOnly: boolean;
};

function SectionList({
  size,
  ...props
}: SectionsProps & { size: Exclude<SectionCountSize, "one"> }) {
  const { course, fit, placedCode, planetTerp } = props;
  const [onlyFits, setOnlyFits] = useState(false);
  const collapsed = useUi((s) => s.collapsedGroups);
  const toggleGroup = useUi((s) => s.toggleGroup);
  const n = course.sections.length;
  const many = size === "many";
  const fitting = fit ? countFittingSections(fit, course) : null;
  // Core's rule, so the bar, the groups and "Only fits" agree: a section
  // with no set times fits (ARHU338's sections all "Contact the department").
  const fits = (s: Section) => !fit || sectionFits(fit, course, s);
  const visible = (s: Section) => !onlyFits || s.code === placedCode || fits(s);
  const placed = course.sections.find((s) => s.code === placedCode);

  const byInstructor = groupSectionsByInstructor(course);
  // One group of everything (ENGL101: 92 sections, all TBA) groups nothing:
  // many of them group by meeting time instead, like the calendar's ghosts.
  const byTime = many && byInstructor.length === 1;
  const groups: GroupView[] = byTime
    ? timeGroups(course, course.sections.filter(visible))
    : byInstructor.map((g) => ({
        key: collapsedGroupKey(course.code, g),
        title: g.name || "Instructor TBA",
        meta: (
          <InstructorMeta
            name={g.instructors.length === 1 ? g.name : ""}
            course={course}
            planetTerp={planetTerp}
          />
        ),
        toggleLabel: g.name ? `${g.name}'s sections` : "the TBA sections",
        instructor:
          g.instructors.length === 1 ? (g.instructors[0] ?? null) : null,
        sections: g.sections.filter(visible),
        whereOnly: false,
      }));
  const shown = groups.filter((g) => g.sections.length > 0);
  const tba = byInstructor[0];

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
        <div className="border-hairline border-y" data-testid="your-section">
          <SectionRow
            {...props}
            section={placed}
            rest={placed.meetings}
            underShared={false}
            compact
            whereOnly={false}
            pinned
          />
        </div>
      ) : null}
      {byTime && tba ? <GroupNote {...props} name={tba.name} /> : null}
      {shown.length === 0 ? (
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
      {shown.map((g) => {
        const closed = collapsed.includes(g.key);
        const inGroup = fit ? g.sections.filter(fits).length : null;
        const reviewsOpen =
          g.instructor !== null && props.openReviews.has(g.instructor);
        return (
          <div key={g.key} data-group={g.key}>
            <GroupHeader
              sticky
              open={!closed}
              onToggle={() => toggleGroup(g.key)}
              toggleLabel={`${closed ? "Show" : "Hide"} ${g.toggleLabel}`}
              title={g.title}
              meta={g.meta}
              right={
                <>
                  <span className="tnum">
                    {inGroup !== null
                      ? `${inGroup} of ${g.sections.length} fit`
                      : g.sections.length}
                  </span>
                  {g.instructor && hasReviews(planetTerp, g.instructor) ? (
                    <ReviewsToggle
                      open={reviewsOpen}
                      onToggle={() =>
                        g.instructor && props.onToggleReviews(g.instructor)
                      }
                    />
                  ) : null}
                </>
              }
            />
            {reviewsOpen && g.instructor ? (
              <InstructorReviews
                name={g.instructor}
                course={course}
                planetTerp={planetTerp}
                loading={props.ptLoading}
              />
            ) : null}
            {closed ? null : <GroupRows {...props} group={g} compact={many} />}
          </div>
        );
      })}
    </section>
  );
}

/** Many sections, one instructor group: groups of sections that meet at the same times. */
function timeGroups(course: Course, sections: readonly Section[]): GroupView[] {
  const timed = groupSectionsByTime({ ...course, sections: [...sections] });
  const views: GroupView[] = timed.map((g) => {
    const when = g.sections[0]
      ? compactMeetingWords(g.sections[0].meetings)
      : "";
    return {
      key: `${course.code}|time|${g.signature}`,
      title: <span className="tnum">{when}</span>,
      toggleLabel: `the sections at ${when}`,
      instructor: null,
      sections: g.sections,
      whereOnly: true,
    };
  });
  const untimed = sections.filter((s) => !s.meetings.some((m) => m.timed));
  if (untimed.length > 0)
    views.push({
      key: `${course.code}|time|none`,
      title: "No set times",
      toggleLabel: "the sections with no set times",
      instructor: null,
      sections: untimed,
      whereOnly: false,
    });
  return views;
}

/** The one line that replaces a header-less group: who teaches, or that nobody's named yet. */
function GroupNote({ name, ...props }: SectionsProps & { name: string }) {
  const one = name && !name.includes(", ") ? name : null;
  return (
    <div className="flex items-center gap-2 border-hairline border-b px-4 py-1.5 text-sm text-muted">
      {name ? (
        <InstructorLine
          name={name}
          course={props.course}
          planetTerp={props.planetTerp}
        />
      ) : (
        "Testudo hasn't named instructors for these sections yet."
      )}
      {one && hasReviews(props.planetTerp, one) ? (
        <span className="ml-auto">
          <ReviewsToggle
            open={props.openReviews.has(one)}
            onToggle={() => props.onToggleReviews(one)}
          />
        </span>
      ) : null}
    </div>
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

function GroupRows({
  group,
  compact,
  ...props
}: SectionsProps & { group: GroupView; compact: boolean }) {
  if (group.whereOnly)
    return group.sections.map((s) => (
      <SectionRow
        key={s.code}
        {...props}
        section={s}
        rest={s.meetings}
        underShared={false}
        compact={compact}
        whereOnly
      />
    ));
  return factorMeetings(group.sections).map((run) => {
    const shared = run.sections.length > 1 && run.shared.length > 0;
    return (
      <div key={run.sections[0]?.section.code}>
        {shared ? <SharedLine meetings={run.shared} /> : null}
        {run.sections.map(({ section, rest }) => (
          <SectionRow
            key={section.code}
            {...props}
            section={section}
            rest={shared ? rest : section.meetings}
            underShared={shared}
            compact={compact}
            whereOnly={false}
          />
        ))}
      </div>
    );
  });
}

function SharedLine({ meetings }: { meetings: readonly Meeting[] }) {
  const words = meetings.map((m) => meetingWords(m)).join(" · ");
  return (
    <WithTooltip label={`Every section below meets ${words}`}>
      <div className="tnum truncate border-hairline border-b px-4 py-1.5 text-xs text-muted">
        All meet {words}
      </div>
    </WithTooltip>
  );
}

/** Where, for a row under a time group's header: rooms, or "Online". */
function placeWords(section: Section): string {
  const places = section.meetings.map((m) =>
    m.online
      ? "Online"
      : [m.building, m.room].filter(Boolean).join(" ") || "Room TBA",
  );
  return [...new Set(places)].join(" · ");
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

const SectionRow = memo(function SectionRow({
  section,
  rest,
  underShared,
  compact,
  whereOnly,
  pinned = false,
  course,
  termId,
  placedCode,
  inPlan,
  readOnly,
  fit,
  seats,
}: SectionsProps & {
  section: Section;
  rest: readonly Meeting[];
  underShared: boolean;
  compact: boolean;
  whereOnly: boolean;
  /** The copy under "Your section": it doesn't scroll itself into view. */
  pinned?: boolean;
}) {
  const key = sectionKey(course.code, section.code);
  const previewed = useUi((s) => s.previewSection === key);
  const setPreview = useUi((s) => s.setPreviewSection);
  const ref = useRef<HTMLDivElement>(null);
  const current = section.code === placedCode;
  const label = fit ? fitLabel(fit, course, section) : null;
  // "Current" already says "In your plan".
  const showLabel = label && label.kind !== "in-plan" ? label : null;
  const counts = seatCounts(seats, key);
  const status = seatStatus(counts);
  const watch = useWatchable(termId, key, readOnly, counts);
  const delivery = deliveryWords(section.delivery);
  const dates = section.dates ? formatDateSpan(section.dates) : null;
  const when = whereOnly
    ? placeWords(section)
    : restMeetingWords(rest, { underShared, compact });
  const full = [
    sectionMeetingWords(section),
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

  const action = current ? (
    <span className="font-medium text-sm">Current</span>
  ) : readOnly ? null : (
    <WithTooltip
      label={
        placedCode
          ? `Replace ${placedCode} with ${section.code}`
          : `Add ${course.code} ${section.code}`
      }
      shortcut={previewed ? "↵" : undefined}
    >
      <Button
        variant="outline"
        size="row"
        className="w-14 px-0"
        onClick={() => switchSection(course.code, section.code, "list")}
      >
        {inPlan ? "Switch" : "Add"}
      </Button>
    </WithTooltip>
  );

  const bell = watch ? (
    <SeatBell
      termId={termId}
      sectionKey={key}
      compact
      full={counts?.open === 0}
    />
  ) : null;

  return (
    <ListRow
      ref={ref}
      {...(pinned
        ? { "data-pinned-section": section.code }
        : { "data-section": section.code })}
      aria-current={current ? "true" : undefined}
      density={compact ? "compact" : "regular"}
      // Tighter columns than other lists: at 360px the times and the room
      // ("TuTh 10–10:50am MTH 0103") fit whole, which is what rows compare by.
      className="gap-2"
      state={previewed ? "previewed" : current ? "current" : undefined}
      onPointerEnter={() => setPreview(current ? null : key)}
      onPointerLeave={() => {
        if (useUi.getState().previewSection === key) setPreview(null);
      }}
      lead={
        <span className="block w-9 ident font-semibold text-base">
          {section.code}
        </span>
      }
      trail={
        <span className="flex items-center justify-end gap-1.5">
          {/* The current row's action already says "Current", so it gives
              the fit column's width to its times. */}
          {compact && !current ? (
            <span
              className={cn(
                "w-[52px] shrink-0 text-left text-sm",
                showLabel ? TONE_TEXT[fitTone(showLabel)] : undefined,
              )}
            >
              {showLabel ? shortFitWords(showLabel) : null}
            </span>
          ) : null}
          {/* The bell sits before the seats, so seat words line up down the list. */}
          {bell ??
            (compact ? <span aria-hidden="true" className="w-6" /> : null)}
          {/* Words only, so the row's own times never truncate; the meter
              and the whole count are in the tooltip. */}
          <WithTooltip label={<SeatMeter seats={seats} sectionKey={key} />}>
            <span
              className={cn(
                "tnum w-12 shrink-0 text-sm",
                SEAT_TONE[status.level],
              )}
            >
              {shortSeatWords(counts)}
            </span>
          </WithTooltip>
        </span>
      }
      action={action}
    >
      <WithTooltip label={full}>
        <div className="min-w-0 text-sm leading-4">
          <div className="tnum flex min-w-0 items-center gap-1.5">
            {delivery && !compact ? (
              <span className="shrink-0 rounded border border-hairline px-1 text-xs text-muted">
                {delivery}
              </span>
            ) : null}
            <span className="truncate">{when}</span>
          </div>
          {compact ? null : showLabel || section.restriction || dates ? (
            <div className="mt-0.5 truncate">
              {showLabel ? (
                <span className={TONE_TEXT[fitTone(showLabel)]}>
                  {fitWords(showLabel)}
                </span>
              ) : null}
              {dates ? (
                <span className="text-muted">
                  {showLabel ? " · " : ""}
                  {dates}
                </span>
              ) : null}
              {section.restriction ? (
                <span className="text-warn">
                  {showLabel || dates ? " · " : ""}
                  {section.restriction}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </WithTooltip>
    </ListRow>
  );
});
