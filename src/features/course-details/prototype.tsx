import { cn } from "cn";
import { ChevronDown, Star } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { switchSection } from "~/app/actions";
import { PanelBody } from "~/app/panel";
import {
  collapsedGroupKey,
  groupSectionsByInstructor,
  groupSectionsByTime,
  sameMeeting,
} from "~/core/catalog";
import { defaultCourseColor } from "~/core/color";
import { countFittingSections, type FitContext, fitLabel } from "~/core/fit";
import {
  formatGpa,
  formatRating,
  gradeBars,
  gradeSentence,
  gradeSummary,
} from "~/core/grades";
import {
  type Course,
  type CourseDetailsTab,
  type Meeting,
  type PlanetTerpDept,
  type Section,
  sectionKey,
  type TermId,
} from "~/core/schema";
import {
  canWatchSeats,
  type SeatsMap,
  seatCounts,
  seatStatus,
} from "~/core/seats";
import { dotStyle } from "~/features/calendar/tint";
import { openCourse } from "~/features/courses/actions";
import { CourseColorPicker } from "~/features/courses/color-picker";
import { SeatMeter } from "~/features/courses/seat-meter";
import { deptOf } from "~/state/catalog-store";
import { useInstructors } from "~/state/data-hooks";
import { type CurrentPlan, useFitContext, useTermCatalog } from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { AboutTab } from "./about-tab";
import { Actions, creditWords, SeatsFreshness } from "./course-details";
import { Bars, GradesTab } from "./grades-tab";
import { InstructorCard, InstructorsTab } from "./instructors-tab";
import { instructorFor } from "./planetterp";
import { SeatBell } from "./seat-bell";
import { SectionGroups } from "./section-list";
import {
  fitTone,
  fitWords,
  meetingWords,
  shortFitWords,
  shortSeatWords,
} from "./words";

// DESIGN PROTOTYPE (docs/UX-REVIEW.md §4). Three candidate structures for
// course details, switched with `?cd=a|b|c` in `pnpm dev:mock` only, so the
// owner can compare them on the same data. Not production code: the work
// package that builds the chosen structure replaces this file.

export type PrototypeVariant = "a" | "b" | "c";

/** `?cd=` in mock mode; null everywhere else (production never sees this). */
export function prototypeVariant(): PrototypeVariant | null {
  if (import.meta.env.MODE !== "mock" || typeof window === "undefined")
    return null;
  const v = new URLSearchParams(window.location.search).get("cd");
  return v === "a" || v === "b" || v === "c" ? v : null;
}

/** `?many=time` groups a one-instructor, many-section course by meeting time. */
function manyMode(): "time" | "flat" {
  if (typeof window === "undefined") return "flat";
  return new URLSearchParams(window.location.search).get("many") === "time"
    ? "time"
    : "flat";
}

/** Past this many sections rows go to one line and the plan's section is pinned. */
const MANY = 20;
/** From this many, the "Only fits" filter shows. */
const FILTER_FROM = 9;

const TONE = {
  ok: "text-ok",
  warn: "text-warn",
  plain: "text-fg font-medium",
  muted: "text-muted",
} as const;

export function PrototypeDetails({
  variant,
  course,
  termId,
  current,
}: {
  variant: PrototypeVariant;
  course: Course;
  termId: TermId;
  current: CurrentPlan | null;
}) {
  const catalog = useTermCatalog(termId);
  const fit = useFitContext();
  const planetTerp = useInstructors(deptOf(course.code));
  const seats = catalog?.seats?.seats ?? null;
  const entry = current?.plan.courses.find((c) => c.courseCode === course.code);
  const readOnly = current?.readOnly ?? true;
  const ctx: Ctx = {
    course,
    termId,
    fit,
    seats,
    readOnly,
    placedCode: entry?.sectionCode ?? null,
    inPlan: Boolean(entry),
    planetTerp: planetTerp.data,
    ptLoading: planetTerp.state === "loading" || planetTerp.state === "idle",
  };
  const header = (
    <Header course={course} current={current} ctx={ctx} variant={variant} />
  );
  if (variant === "b") return <TopTabs ctx={ctx} header={header} />;
  return <OnePage ctx={ctx} header={header} variant={variant} />;
}

type Ctx = {
  course: Course;
  termId: TermId;
  fit: FitContext | null;
  seats: SeatsMap | null;
  readOnly: boolean;
  placedCode: string | null;
  inPlan: boolean;
  planetTerp: PlanetTerpDept | null;
  ptLoading: boolean;
};

// ---------- header: identity, the facts students need first, actions ----------

function Header({
  course,
  current,
  ctx,
  variant,
}: {
  course: Course;
  current: CurrentPlan | null;
  ctx: Ctx;
  variant: PrototypeVariant;
}) {
  const [more, setMore] = useState(false);
  const color =
    current?.colors[course.code] ?? defaultCourseColor(course.code, []);
  const genEds = [
    ...new Set(course.genEds.flatMap((g) => g.map((o) => o.code))),
  ];
  const courseGrades = ctx.planetTerp?.courses[course.code]?.all;
  const sentence = courseGrades
    ? gradeSentence(gradeSummary(courseGrades.counts))
    : null;
  return (
    <header className="px-4 pt-4 pb-3">
      <div className="flex items-center gap-2">
        {ctx.inPlan && !ctx.readOnly ? (
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
        <span className="tnum text-[12px] text-muted">
          {creditWords(course)}
        </span>
        {genEds.map((code) => (
          <span
            key={code}
            className="rounded border border-hairline px-1 font-mono text-[11px] text-muted"
          >
            {code}
          </span>
        ))}
      </div>
      <h2 className="mt-1 text-balance font-semibold text-[15px] leading-snug">
        {course.title}
      </h2>
      {variant === "b" ? null : (
        <div className="mt-2 space-y-1 text-[12px] leading-relaxed">
          {course.prerequisite ? (
            <Fact label="Prerequisite">{course.prerequisite}</Fact>
          ) : null}
          {course.restriction ? (
            <Fact label="Restriction">{course.restriction}</Fact>
          ) : null}
          {variant === "c" && sentence ? (
            <Fact label="Grades">{sentence}</Fact>
          ) : null}
          {more ? (
            <div className="pt-1">
              <AboutTab course={course} onOpenCourse={openCourse} />
            </div>
          ) : course.description ? (
            <p className="line-clamp-2 text-muted">{course.description}</p>
          ) : null}
          <WithTooltip
            label={more ? "Show less" : "Description, gen-eds, cross-listings"}
          >
            <button
              type="button"
              onClick={() => setMore(!more)}
              className="text-[12px] text-muted underline underline-offset-2 hover:text-fg"
            >
              {more ? "Less" : "More about this course"}
            </button>
          </WithTooltip>
        </div>
      )}
      {ctx.readOnly || !current ? null : (
        <Actions course={course} current={current} />
      )}
    </header>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="line-clamp-2">
      <span className="font-medium text-fg">{label}</span>{" "}
      <span className="text-muted">{children}</span>
    </p>
  );
}

// ---------- B: tabs at the top, Sections is one of them ----------

function TopTabs({ ctx, header }: { ctx: Ctx; header: ReactNode }) {
  const [tab, setTab] = useState<"sections" | CourseDetailsTab>("sections");
  const n = ctx.course.sections.length;
  const tabs = [
    { id: "sections", label: `Sections ${n}` },
    { id: "instructors", label: "Instructors" },
    { id: "grades", label: "Grades" },
    { id: "about", label: "About" },
  ] as const;
  return (
    <PanelBody>
      {header}
      <div
        role="tablist"
        aria-label="Course details"
        className="sticky top-0 z-20 flex gap-1 border-hairline border-b bg-bg px-3 py-1.5"
      >
        {tabs.map((t) => (
          <WithTooltip key={t.id} label={t.label}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "tnum h-7 rounded-md px-2.5 text-[12px] transition-colors",
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
      {tab === "sections" ? (
        <SectionGroups
          course={ctx.course}
          termId={ctx.termId}
          placedCode={ctx.placedCode}
          inPlan={ctx.inPlan}
          readOnly={ctx.readOnly}
          fit={ctx.fit}
          seats={ctx.seats}
          planetTerp={ctx.planetTerp}
          compact={n > MANY}
        />
      ) : (
        <div className="px-4 pt-3 pb-6">
          {tab === "instructors" ? (
            <InstructorsTab
              course={ctx.course}
              planetTerp={ctx.planetTerp}
              loading={ctx.ptLoading}
              active
            />
          ) : tab === "grades" ? (
            <GradesTab
              course={ctx.course}
              planetTerp={ctx.planetTerp}
              loading={ctx.ptLoading}
            />
          ) : (
            <AboutTab course={ctx.course} onOpenCourse={openCourse} />
          )}
        </div>
      )}
    </PanelBody>
  );
}

// ---------- A and C: one scrolling page ----------

function OnePage({
  ctx,
  header,
  variant,
}: {
  ctx: Ctx;
  header: ReactNode;
  variant: PrototypeVariant;
}) {
  const { course } = ctx;
  const n = course.sections.length;
  const [onlyFits, setOnlyFits] = useState(false);
  const gradesRef = useRef<HTMLElement>(null);
  const fitting = ctx.fit ? countFittingSections(ctx.fit, course) : null;
  const many = n > MANY;
  const shown = course.sections.filter(
    (s) =>
      !onlyFits ||
      s.code === ctx.placedCode ||
      (ctx.fit ? fitLabel(ctx.fit, course, s)?.kind === "fits" : true),
  );
  const placed = course.sections.find((s) => s.code === ctx.placedCode);

  return (
    <PanelBody>
      {header}
      {n === 1 && course.sections[0] ? (
        <SingleSection ctx={ctx} section={course.sections[0]} />
      ) : (
        <section aria-label="Sections">
          <div className="sticky top-0 z-20 flex h-9 items-center gap-2 whitespace-nowrap border-hairline border-y bg-bg px-4 text-[12px]">
            <span className="font-medium">Sections</span>
            {fitting !== null ? (
              <span className="tnum text-muted">
                {fitting} of {n} fit
              </span>
            ) : (
              <span className="tnum text-muted">{n}</span>
            )}
            {n >= FILTER_FROM ? (
              <WithTooltip
                label={
                  onlyFits
                    ? "Show every section"
                    : "Hide sections that don't fit"
                }
              >
                <button
                  type="button"
                  aria-pressed={onlyFits}
                  onClick={() => setOnlyFits(!onlyFits)}
                  className={cn(
                    "h-6 rounded-md border px-2 text-[11px] transition-colors",
                    onlyFits
                      ? "border-transparent bg-accent text-accent-fg"
                      : "border-hairline text-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  Only fits
                </button>
              </WithTooltip>
            ) : null}
            <span className="ml-auto flex items-center gap-3">
              {variant === "a" ? (
                <WithTooltip label="Jump to grades">
                  <button
                    type="button"
                    onClick={() =>
                      gradesRef.current?.scrollIntoView({ block: "start" })
                    }
                    className="text-muted hover:text-fg"
                  >
                    Grades ↓
                  </button>
                </WithTooltip>
              ) : null}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 pt-2 pb-1 text-[11px]">
            <span className="font-medium text-muted">
              {placed && n > MANY ? "Your section" : null}
            </span>
            <SeatsFreshness termId={ctx.termId} />
          </div>
          {placed && n > MANY ? (
            <div className="border-hairline border-b">
              <Row ctx={ctx} section={placed} compact showWho />
            </div>
          ) : null}
          <Groups ctx={ctx} sections={shown} compact={many} variant={variant} />
        </section>
      )}
      {variant === "a" ? (
        <section
          ref={gradesRef}
          aria-label="Grades"
          className="scroll-mt-0 pb-6"
        >
          <div className="sticky top-0 z-20 flex h-9 items-center border-hairline border-y bg-bg px-4 font-medium text-[12px]">
            Grades
            <span className="ml-2 font-normal text-muted">
              every past semester, from PlanetTerp
            </span>
          </div>
          <div className="px-4 pt-3">
            <GradesTab
              course={course}
              planetTerp={ctx.planetTerp}
              loading={ctx.ptLoading}
            />
          </div>
        </section>
      ) : (
        <div className="h-6" />
      )}
    </PanelBody>
  );
}

// ---------- one section: "this is the class" ----------

function SingleSection({ ctx, section }: { ctx: Ctx; section: Section }) {
  const key = sectionKey(ctx.course.code, section.code);
  const label = ctx.fit ? fitLabel(ctx.fit, ctx.course, section) : null;
  const who = section.instructors.join(", ") || "Instructor TBA";
  const pt = section.instructors[0]
    ? instructorFor(ctx.planetTerp, section.instructors[0])
    : null;
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label="The one section"
      className="border-hairline border-y"
      data-section={section.code}
    >
      <div className="flex h-9 items-center gap-2 border-hairline border-b px-4 text-[12px]">
        <span className="font-medium">One section</span>
        <span className="font-mono text-muted">{section.code}</span>
        <span className="ml-auto">
          <SeatsFreshness termId={ctx.termId} />
        </span>
      </div>
      <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 px-4 py-3 text-[12.5px]">
        <dt className="text-muted">Meets</dt>
        <dd className="tnum">
          {section.meetings.length === 0
            ? "Contact the department for times"
            : section.meetings.map((m) => (
                <div key={meetingWords(m)}>{meetingWords(m)}</div>
              ))}
        </dd>
        <dt className="text-muted">Taught by</dt>
        <dd>
          <InstructorLine ctx={ctx} names={section.instructors} name={who} />
          {pt ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="mt-0.5 block text-[11.5px] text-muted underline underline-offset-2 hover:text-fg"
            >
              {open ? "Hide reviews" : "Reviews and grades"}
            </button>
          ) : null}
        </dd>
        <dt className="text-muted">Fit</dt>
        <dd className={label ? TONE[fitTone(label)] : "text-muted"}>
          {label ? fitWords(label) : "…"}
        </dd>
        <dt className="text-muted">Seats</dt>
        <dd className="flex items-center gap-2">
          <SeatMeter seats={ctx.seats} sectionKey={key} />
          {!ctx.readOnly && canWatchSeats(seatCounts(ctx.seats, key)) ? (
            <SeatBell termId={ctx.termId} sectionKey={key} compact />
          ) : null}
        </dd>
        {section.restriction ? (
          <>
            <dt className="text-muted">Note</dt>
            <dd className="text-warn">{section.restriction}</dd>
          </>
        ) : null}
      </dl>
      {open && section.instructors[0] ? (
        <div className="px-4 pb-3">
          <InstructorCard
            name={section.instructors[0]}
            course={ctx.course}
            planetTerp={ctx.planetTerp}
            loading={ctx.ptLoading}
            active
          />
        </div>
      ) : null}
    </section>
  );
}

function InstructorLine({
  ctx,
  names,
  name,
}: {
  ctx: Ctx;
  names: readonly string[];
  name: string;
}) {
  const first = names[0];
  const pt = first ? instructorFor(ctx.planetTerp, first) : null;
  const rating = pt ? formatRating(pt.rating, pt.reviewCount) : null;
  const grades = pt
    ? ctx.planetTerp?.courses[ctx.course.code]?.byInstructor[pt.slug]
    : undefined;
  const gpa = grades ? gradeSummary(grades.counts).averageGpa : null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate font-medium">{name}</span>
      {rating?.rating ? (
        <span className="tnum inline-flex shrink-0 items-center gap-0.5 text-[12px]">
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
        <span className="tnum shrink-0 text-[12px] text-muted">
          · GPA {formatGpa(gpa)}
        </span>
      ) : null}
    </span>
  );
}

// ---------- groups ----------

/** "MWF 9am–9:50am": days and times without the room, for one-line rows. */
function shortMeetingWords(m: Meeting): string {
  return meetingWords({ ...m, building: null, room: null, kind: "lecture" });
}

/** A section's lecture-like meetings (not discussions or labs), as one key. */
function lectureKey(s: Section): string {
  return s.meetings
    .filter((m) => m.kind !== "discussion" && m.kind !== "lab")
    .map(meetingWords)
    .join(" · ");
}

function SharedLine({ meetings }: { meetings: readonly Meeting[] }) {
  if (meetings.length === 0) return null;
  return (
    <div className="tnum truncate border-hairline border-b px-4 py-1.5 text-[11.5px] text-muted">
      <span className="text-faint">All meet </span>
      {meetings.map(meetingWords).join(" · ")}
    </div>
  );
}

/** Meetings every section in the list shares (a common lecture), and what's left per section. */
function factorMeetings(sections: readonly Section[]): {
  shared: Meeting[];
  rest: (s: Section) => Meeting[];
} {
  const [first, ...others] = sections;
  if (!first || others.length === 0)
    return { shared: [], rest: (s) => [...s.meetings] };
  const shared = first.meetings.filter((m) =>
    others.every((s) => s.meetings.some((o) => sameMeeting(m, o))),
  );
  return {
    shared,
    rest: (s) =>
      s.meetings.filter((m) => !shared.some((x) => sameMeeting(m, x))),
  };
}

function Groups({
  ctx,
  sections,
  compact,
  variant,
}: {
  ctx: Ctx;
  sections: readonly Section[];
  compact: boolean;
  variant: PrototypeVariant;
}) {
  const collapsed = useUi((s) => s.collapsedGroups);
  const byInstructor = groupSectionsByInstructor({
    ...ctx.course,
    sections: [...sections],
  });
  // One group of everything (all "Instructor TBA", say) is no grouping at all.
  const degenerate = byInstructor.length === 1 && sections.length > MANY;
  if (degenerate && manyMode() === "time") {
    const byTime = groupSectionsByTime({
      ...ctx.course,
      sections: [...sections],
    });
    return (
      <div>
        <GroupNote ctx={ctx} name={byInstructor[0]?.name ?? ""} />
        {byTime.map((g) => {
          const key = `${ctx.course.code}|t|${g.signature}`;
          return (
            <Group
              key={key}
              groupKey={key}
              closed={collapsed.includes(key)}
              title={
                <span className="tnum font-medium">
                  {g.sections[0]
                    ? g.sections[0].meetings
                        .filter((m) => m.timed)
                        .map((m) =>
                          meetingWords(m).split(" ").slice(0, 2).join(" "),
                        )
                        .join(" + ")
                    : ""}
                </span>
              }
              sections={g.sections}
              ctx={ctx}
              compact
              whereOnly
              variant={variant}
            />
          );
        })}
      </div>
    );
  }
  if (degenerate) {
    const { rest } = factorMeetings(sections);
    return (
      <div>
        <GroupNote ctx={ctx} name={byInstructor[0]?.name ?? ""} />
        {sections.map((s) => (
          <Row key={s.code} ctx={ctx} section={s} compact meetings={rest(s)} />
        ))}
      </div>
    );
  }
  return (
    <div>
      {byInstructor.map((g) => {
        const key = collapsedGroupKey(ctx.course.code, g);
        return (
          <Group
            key={key}
            groupKey={key}
            closed={collapsed.includes(key)}
            title={
              <InstructorLine
                ctx={ctx}
                names={g.instructors}
                name={g.name || "Instructor TBA"}
              />
            }
            instructor={g.instructors[0]}
            sections={g.sections}
            ctx={ctx}
            compact={compact}
            variant={variant}
          />
        );
      })}
    </div>
  );
}

function GroupNote({ ctx, name }: { ctx: Ctx; name: string }) {
  return (
    <div className="border-hairline border-b px-4 py-1.5 text-[11.5px] text-muted">
      {name ? (
        <InstructorLine ctx={ctx} names={[name]} name={name} />
      ) : (
        "Testudo hasn't named instructors for these sections yet."
      )}
    </div>
  );
}

function Group({
  groupKey,
  closed,
  title,
  instructor,
  sections,
  ctx,
  compact,
  whereOnly = false,
  variant,
}: {
  groupKey: string;
  closed: boolean;
  title: ReactNode;
  instructor?: string;
  sections: readonly Section[];
  ctx: Ctx;
  compact: boolean;
  /** The header already says when (time groups): rows say where. */
  whereOnly?: boolean;
  variant: PrototypeVariant;
}) {
  const toggle = useUi((s) => s.toggleGroup);
  const [about, setAbout] = useState(false);
  const { shared, rest } = factorMeetings(sections);
  // An instructor's sections that split across lectures (CMSC330's 2pm and
  // 3:30pm) get a shared line per lecture, keeping section order.
  const byLecture: Section[][] = [];
  for (const s of sections) {
    const last = byLecture[byLecture.length - 1];
    if (last?.[0] && lectureKey(last[0]) === lectureKey(s)) last.push(s);
    else byLecture.push([s]);
  }
  const fits = ctx.fit
    ? sections.filter(
        (s) => ctx.fit && fitLabel(ctx.fit, ctx.course, s)?.kind === "fits",
      ).length
    : null;
  const pt = instructor ? instructorFor(ctx.planetTerp, instructor) : null;
  const record =
    pt && variant === "c"
      ? ctx.planetTerp?.courses[ctx.course.code]?.byInstructor[pt.slug]
      : undefined;
  return (
    <div>
      <div className="sticky top-9 z-10 flex h-9 items-center gap-2 border-hairline border-b bg-panel px-4 text-[12px]">
        <WithTooltip
          label={closed ? "Show these sections" : "Hide these sections"}
        >
          <button
            type="button"
            aria-expanded={!closed}
            onClick={() => toggle(groupKey)}
            className="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={cn(
                "shrink-0 text-muted transition-transform duration-150",
                closed && "-rotate-90",
              )}
            />
            {title}
          </button>
        </WithTooltip>
        <span className="tnum shrink-0 text-[11px] text-muted">
          {fits !== null
            ? `${fits} of ${sections.length} fit`
            : sections.length}
        </span>
        {pt ? (
          <WithTooltip label={about ? "Hide reviews" : "Reviews and grades"}>
            <button
              type="button"
              aria-expanded={about}
              onClick={() => setAbout(!about)}
              className={cn(
                "shrink-0 rounded px-1.5 text-[11px] transition-colors",
                about ? "bg-hover text-fg" : "text-muted hover:text-fg",
              )}
            >
              Reviews
            </button>
          </WithTooltip>
        ) : null}
      </div>
      {about && instructor ? (
        <div className="border-hairline border-b px-4 py-3">
          <InstructorCard
            name={instructor}
            course={ctx.course}
            planetTerp={ctx.planetTerp}
            loading={ctx.ptLoading}
            active
          />
          {record ? (
            <div className="mt-3">
              <p className="tnum text-[12px]">
                {gradeSentence(gradeSummary(record.counts))}
              </p>
              <Bars bars={gradeBars(record.counts)} />
            </div>
          ) : null}
        </div>
      ) : null}
      {closed ? null : shared.length > 0 || byLecture.length <= 1 ? (
        <>
          <SharedLine meetings={shared} />
          {sections.map((s) => (
            <Row
              key={s.code}
              ctx={ctx}
              section={s}
              compact={compact}
              meetings={rest(s)}
              whereOnly={whereOnly}
            />
          ))}
        </>
      ) : (
        byLecture.map((part) => {
          const f = factorMeetings(part);
          return (
            <div key={part[0]?.code}>
              <SharedLine meetings={f.shared} />
              {part.map((s) => (
                <Row
                  key={s.code}
                  ctx={ctx}
                  section={s}
                  compact={compact}
                  meetings={f.rest(s)}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

// ---------- rows: code | when and where | seats | action ----------

function Row({
  ctx,
  section,
  compact,
  meetings,
  showWho = false,
  wrap = false,
  whereOnly = false,
}: {
  ctx: Ctx;
  section: Section;
  compact: boolean;
  meetings?: Meeting[];
  showWho?: boolean;
  /** Let the meeting line wrap instead of truncating (the pinned row). */
  wrap?: boolean;
  /** Rooms only: the group header already says when. */
  whereOnly?: boolean;
}) {
  const { course } = ctx;
  const key = sectionKey(course.code, section.code);
  const previewed = useUi((s) => s.previewSection === key);
  const setPreview = useUi((s) => s.setPreviewSection);
  const ref = useRef<HTMLDivElement>(null);
  const current = section.code === ctx.placedCode;
  const label = ctx.fit ? fitLabel(ctx.fit, course, section) : null;
  const counts = seatCounts(ctx.seats, key);
  const shownMeetings = meetings ?? [...section.meetings];
  const when = whereOnly
    ? [
        ...new Set(
          section.meetings.map((m) =>
            m.online
              ? "Online"
              : [m.building, m.room].filter(Boolean).join(" "),
          ),
        ),
      ].join(" · ")
    : shownMeetings.length === 0
      ? section.meetings.length === 0
        ? "Times TBA"
        : "Only the shared meetings"
      : shownMeetings
          .map((m) =>
            compact
              ? shortMeetingWords(m)
              : meetingWords({ ...m, kind: "lecture" }),
          )
          .join(" · ");

  useEffect(() => {
    if (previewed) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [previewed]);

  const action = current ? (
    <span className="w-14 shrink-0 text-center font-medium text-[11.5px]">
      Current
    </span>
  ) : ctx.readOnly ? null : (
    <WithTooltip
      label={
        ctx.placedCode
          ? `Replace ${ctx.placedCode} with ${section.code}`
          : `Add ${course.code} ${section.code}`
      }
      shortcut={previewed ? "↵" : undefined}
    >
      <Button
        variant="outline"
        size="sm"
        className="h-6 w-14 shrink-0 px-0 text-[11.5px]"
        onClick={() => switchSection(course.code, section.code, "list")}
      >
        {ctx.inPlan ? "Switch" : "Add"}
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
        "grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-x-3 border-hairline border-b px-4 last:border-b-0",
        compact ? "py-1" : "py-2",
        previewed ? "bg-hover" : current && "bg-accent-soft",
      )}
    >
      <span className="font-mono font-semibold text-[12px]">
        {section.code}
      </span>
      <div className="min-w-0 text-[12px]">
        <WithTooltip label={when}>
          <div className={cn("tnum", !wrap && "truncate")}>{when}</div>
        </WithTooltip>
        {showWho ? (
          <div className="truncate text-[11.5px] text-muted">
            {section.instructors.join(", ") || "Instructor TBA"}
          </div>
        ) : null}
        {compact ? null : (
          <div
            className={cn(
              "truncate text-[11.5px]",
              label ? TONE[fitTone(label)] : "text-muted",
            )}
          >
            {label ? fitWords(label) : null}
            {section.restriction ? (
              <span className="text-warn"> · {section.restriction}</span>
            ) : null}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 text-right">
        {compact ? (
          <span
            className={cn(
              "text-[11.5px]",
              label ? TONE[fitTone(label)] : "text-muted",
            )}
          >
            {label ? shortFitWords(label) : null}
          </span>
        ) : null}
        <span
          className={cn(
            "tnum w-12 text-[11.5px]",
            seatStatus(counts).level === "open"
              ? "text-muted"
              : seatStatus(counts).level === "low"
                ? "text-warn"
                : seatStatus(counts).level === "full"
                  ? "text-error"
                  : "text-faint",
          )}
        >
          {shortSeatWords(counts)}
        </span>
      </div>
      {action ?? <span />}
    </div>
  );
}
