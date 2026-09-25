import { cn } from "cn";
import { ChevronDown, Rows2, Rows3, Star } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { switchSection } from "~/app/actions";
import {
  collapsedGroupKey,
  groupSectionsByInstructor,
  type InstructorGroup,
} from "~/core/catalog";
import { type FitContext, fitLabel } from "~/core/fit";
import { formatGpa, formatRating, gradeSummary } from "~/core/grades";
import {
  type Course,
  type PlanetTerpDept,
  type Section,
  type SectionCode,
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
import { SeatMeter } from "~/features/courses/seat-meter";
import { useUi } from "~/state/ui-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { instructorFor } from "./planetterp";
import { SeatBell } from "./seat-bell";
import {
  compactMeetingWords,
  deliveryWords,
  fitTone,
  fitWords,
  sectionMeetingWords,
  shortFitWords,
  shortSeatWords,
} from "./words";

// Sections grouped by instructor (SPEC §3.4), in section-number order within
// and between groups. Groups collapse; rows preview on the calendar when
// hovered, and ↑/↓/↵ (the calendar's keys) move the same highlight.

export interface SectionListProps {
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
  compact: boolean;
}

const TONE = {
  ok: "text-ok",
  warn: "text-warn",
  plain: "text-fg font-medium",
  muted: "text-muted",
} as const;

/** The seat meter's word colors, for compact rows that show words alone. */
const SEAT_TONE: Record<SeatStatus["level"], string> = {
  open: "text-muted",
  low: "text-warn",
  full: "text-error",
  unknown: "text-faint",
};

export function SectionGroups(props: SectionListProps) {
  const groups = groupSectionsByInstructor(props.course);
  const collapsed = useUi((s) => s.collapsedGroups);
  return (
    <div className="border-hairline border-y" data-testid="sections">
      {groups.map((group) => {
        const key = collapsedGroupKey(props.course.code, group);
        return (
          <Group
            key={key}
            group={group}
            groupKey={key}
            closed={collapsed.includes(key)}
            {...props}
          />
        );
      })}
    </div>
  );
}

function Group({
  group,
  groupKey,
  closed,
  ...props
}: SectionListProps & {
  group: InstructorGroup;
  groupKey: string;
  closed: boolean;
}) {
  const toggle = useUi((s) => s.toggleGroup);
  const name = group.name || "Instructor TBA";
  const first = group.instructors[0];
  const pt = first ? instructorFor(props.planetTerp, first) : null;
  const rating = pt ? formatRating(pt.rating, pt.reviewCount) : null;
  const grades = pt
    ? props.planetTerp?.courses[props.course.code]?.byInstructor[pt.slug]
    : undefined;
  const gpa = grades ? gradeSummary(grades.counts).averageGpa : null;
  const n = group.sections.length;
  return (
    <div>
      <WithTooltip
        label={closed ? `Show ${name}'s sections` : `Hide ${name}'s sections`}
      >
        <button
          type="button"
          aria-expanded={!closed}
          onClick={() => toggle(groupKey)}
          className="flex w-full items-center gap-2 border-hairline border-b bg-panel px-4 py-2 text-left text-[12px] transition-colors hover:bg-hover"
        >
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={cn(
              "-ml-1 shrink-0 text-muted transition-transform duration-150",
              closed && "-rotate-90",
            )}
          />
          <span className="truncate font-medium">{name}</span>
          {rating?.rating ? (
            <span className="tnum inline-flex shrink-0 items-center gap-0.5">
              <Star
                size={11}
                aria-hidden="true"
                className="fill-current text-warn"
              />
              {rating.rating}
              <span className="text-muted">({pt?.reviewCount})</span>
            </span>
          ) : null}
          {gpa !== null ? (
            <span className="tnum shrink-0 text-muted">
              · avg GPA {formatGpa(gpa)}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[11px] text-faint">
            {n} section{n === 1 ? "" : "s"}
          </span>
        </button>
      </WithTooltip>
      {closed
        ? null
        : group.sections.map((section) => (
            <SectionRow key={section.code} section={section} {...props} />
          ))}
    </div>
  );
}

const SectionRow = memo(function SectionRow({
  section,
  course,
  termId,
  placedCode,
  inPlan,
  readOnly,
  fit,
  seats,
  compact,
}: SectionListProps & { section: Section }) {
  const key = sectionKey(course.code, section.code);
  const previewed = useUi((s) => s.previewSection === key);
  const setPreview = useUi((s) => s.setPreviewSection);
  const ref = useRef<HTMLDivElement>(null);
  const current = section.code === placedCode;
  const label = fit ? fitLabel(fit, course, section) : null;
  const delivery = deliveryWords(section.delivery);
  const counts = seatCounts(seats, key);
  const watchable = !readOnly && canWatchSeats(counts);

  // ↑/↓ on the calendar move the preview; keep its row in view.
  useEffect(() => {
    if (previewed) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [previewed]);

  const action = current ? (
    <span
      className={cn(
        "shrink-0 text-center font-medium text-[11.5px]",
        compact ? "w-[52px]" : "w-[64px]",
      )}
    >
      Current
    </span>
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
        size="sm"
        className={cn(
          "shrink-0",
          compact ? "h-6 w-[52px] px-0 text-[11.5px]" : "w-[64px]",
        )}
        onClick={() => switchSection(course.code, section.code, "list")}
      >
        {inPlan ? "Switch" : "Add"}
      </Button>
    </WithTooltip>
  );

  return (
    <div
      ref={ref}
      data-section={section.code}
      aria-current={current ? "true" : undefined}
      onPointerEnter={() => setPreview(current ? null : key)}
      onPointerLeave={() => {
        if (useUi.getState().previewSection === key) setPreview(null);
      }}
      className={cn(
        "flex items-center gap-3 border-hairline border-b px-4 last:border-b-0",
        compact ? "py-1.5" : "py-2.5",
        previewed ? "bg-hover" : current && "bg-accent-soft",
      )}
    >
      {compact ? (
        <WithTooltip
          label={[
            sectionMeetingWords(section),
            label ? fitWords(label) : null,
            seatStatus(counts).words,
            section.restriction,
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[11.5px]">
            <span className="w-10 shrink-0 font-mono font-semibold text-[12px]">
              {section.code}
            </span>
            <span className="tnum w-[68px] shrink-0 truncate text-muted">
              {compactMeetingWords(section)}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                label ? TONE[fitTone(label)] : "text-muted",
              )}
            >
              {label ? shortFitWords(label) : null}
              {section.restriction ? (
                <span className="text-warn"> · Restricted</span>
              ) : null}
            </span>
            <span
              className={cn(
                "tnum shrink-0 text-right",
                SEAT_TONE[seatStatus(counts).level],
              )}
            >
              {shortSeatWords(counts)}
            </span>
          </div>
        </WithTooltip>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-[12.5px]">
              {section.code}
            </span>
            {delivery ? (
              <span className="rounded border border-hairline px-1 text-[10.5px] text-muted">
                {delivery}
              </span>
            ) : null}
            {section.dates ? (
              <span className="tnum text-[11px] text-muted">
                {formatDateSpan(section.dates)}
              </span>
            ) : null}
          </div>
          <WithTooltip label={sectionMeetingWords(section)}>
            <div className="tnum mt-0.5 truncate text-[11.5px] text-muted">
              {sectionMeetingWords(section)}
            </div>
          </WithTooltip>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]">
            {label ? (
              <span className={TONE[fitTone(label)]}>{fitWords(label)}</span>
            ) : null}
            <SeatMeter seats={seats} sectionKey={key} />
          </div>
          {section.restriction ? (
            <div className="mt-0.5 text-[11.5px] text-warn">
              {section.restriction}
            </div>
          ) : null}
        </div>
      )}
      {watchable ? (
        <SeatBell termId={termId} sectionKey={key} compact={compact} />
      ) : null}
      {action}
    </div>
  );
});

/** A toggle between full and compact rows; compact by default for long lists. */
export function RowModeToggle({
  compact,
  onChange,
}: {
  compact: boolean;
  onChange: (compact: boolean) => void;
}) {
  const Icon = compact ? Rows3 : Rows2;
  return (
    <WithTooltip label={compact ? "Show full rows" : "Show compact rows"}>
      <button
        type="button"
        aria-pressed={compact}
        aria-label="Compact rows"
        onClick={() => onChange(!compact)}
        className="flex size-6 items-center justify-center rounded text-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <Icon size={13} aria-hidden="true" />
      </button>
    </WithTooltip>
  );
}
