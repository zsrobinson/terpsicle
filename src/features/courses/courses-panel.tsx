import { cn } from "cn";
import {
  Bookmark,
  BookmarkPlus,
  Ellipsis,
  PanelRightOpen,
  Trash2,
} from "lucide-react";
import { Fragment, type ReactElement, useMemo } from "react";
import { TONE_TEXT } from "~/app/emphasis";
import { MessageText, messageToText } from "~/app/message-text";
import {
  EmptyState,
  ListRow,
  PanelBody,
  PanelHeader,
  SectionHeader,
} from "~/app/panel";
import { planLabel } from "~/app/plan-label";
import type { CatalogIndex } from "~/core/catalog";
import type {
  CourseCode,
  CourseColor,
  PlanCourse,
  Problem,
} from "~/core/schema";
import { parseSectionKey, sectionKey } from "~/core/schema";
import type { SeatsMap } from "~/core/seats";
import {
  useActiveTerm,
  useCreditsLabel,
  useCurrentPlan,
  usePlanProblems,
  useTermCatalog,
} from "~/state/hooks";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { openCourse, removeCourse, saveCourseForLater } from "./actions";
import { CourseColorPicker } from "./color-picker";
import { FirstVisit } from "./first-visit";
import { mostSevere, problemWords, severityTone } from "./problem-words";
import { SeatMeter } from "./seat-meter";
import { sectionLine } from "./section-words";

// The Courses tab (SPEC §3.2): the plan's courses with their sections, seats
// and problems, then what's saved for later. An empty plan shows the two ways
// to start instead.

export function CoursesPanel() {
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  const { term } = useActiveTerm();
  const credits = useCreditsLabel();
  const problems = usePlanProblems();
  const flagged = useMemo(() => problemsByCourse(problems), [problems]);

  if (!current) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="Courses" />
        <RowsSkeleton />
      </div>
    );
  }

  const { plan, readOnly, colors } = current;
  const placed = plan.courses.filter((c) => c.sectionCode !== null);
  const saved = plan.courses.filter((c) => c.sectionCode === null);
  const count = `${placed.length} ${placed.length === 1 ? "course" : "courses"}`;
  const seats = catalog?.seats?.seats ?? null;
  const index = catalog?.index;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title={planLabel(current)}
        sub={credits ? `${count} · ${credits}` : count}
      />
      <PanelBody>
        {placed.length === 0 && !readOnly ? (
          <FirstVisit termName={term?.name} />
        ) : null}
        {placed.length > 0 ? (
          <ul aria-label={`Courses in ${plan.name}`}>
            {placed.map((entry) => (
              <PlacedRow
                key={entry.courseCode}
                entry={entry}
                index={index}
                seats={seats}
                color={colors[entry.courseCode] ?? "blue"}
                problems={flagged.get(entry.courseCode)}
                readOnly={readOnly}
              />
            ))}
          </ul>
        ) : null}
        {/* A shared plan can't save anything, so it gets no "save one" hint. */}
        {saved.length > 0 || (placed.length > 0 && !readOnly) ? (
          <>
            <SectionHeader
              variant="label"
              title="Saved for later"
              count={saved.length > 0 ? saved.length : undefined}
            />
            {saved.length > 0 ? (
              <ul aria-label="Saved for later" className="pb-3">
                {saved.map((entry) => (
                  <SavedRow
                    key={entry.courseCode}
                    courseCode={entry.courseCode}
                    title={index?.courses.get(entry.courseCode)?.title}
                    readOnly={readOnly}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState className="pt-0 text-faint">
                Courses you're considering but haven't placed show up here. Save
                one from its details.
              </EmptyState>
            )}
          </>
        ) : null}
      </PanelBody>
    </div>
  );
}

/** Errors and warnings by the course they're about (info doesn't get the icon). */
function problemsByCourse(
  problems: readonly Problem[],
): Map<CourseCode, Problem[]> {
  const out = new Map<CourseCode, Problem[]>();
  for (const p of problems) {
    if (p.severity === "info") continue;
    const courses = new Set<CourseCode>();
    for (const s of p.subjects) {
      if (s.kind === "course") courses.add(s.courseCode);
      if (s.kind === "section") {
        const parsed = parseSectionKey(s.sectionKey);
        if (parsed) courses.add(parsed.courseCode);
      }
    }
    for (const code of courses) out.set(code, [...(out.get(code) ?? []), p]);
  }
  return out;
}

function PlacedRow({
  entry,
  index,
  seats,
  color,
  problems,
  readOnly,
}: {
  entry: PlanCourse;
  index: CatalogIndex | undefined;
  seats: SeatsMap | null;
  color: CourseColor;
  problems: readonly Problem[] | undefined;
  readOnly: boolean;
}) {
  const { courseCode, sectionCode } = entry;
  // Placed rows always have both; the filter above guarantees it.
  if (sectionCode === null || entry.snapshot === null) return null;
  const key = sectionKey(courseCode, sectionCode);
  const course = index?.courses.get(courseCode);
  // The live section when the catalog has it; the plan's snapshot otherwise
  // (still loading, or cancelled: Problems says which).
  const section = index?.sections.get(key)?.section ?? entry.snapshot;
  const problemText = problems?.map((p) => messageToText(p.title)).join(" · ");
  // What's wrong, in a few words on the row itself (UX-REVIEW §4.4). Seat
  // problems are the seat words' job, so a flagged row can have no words.
  const said = (problems ?? []).flatMap((p) => {
    const words = problemWords(p, courseCode);
    return words ? [{ words, severity: p.severity }] : [];
  });
  // Each phrase in its own severity's color; the line (separators, the
  // ellipsis when it truncates) in the most severe one's.
  const worst = mostSevere(problems ?? []);

  const row = (
    <ListRow
      className="group items-start hover:bg-hover has-[button[data-state=open]]:bg-hover"
      lead={
        <CourseColorPicker
          courseCode={courseCode}
          color={color}
          readOnly={readOnly}
        />
      }
      trail={
        // The ⋯ menu sits under the seats, in the trail column, instead of
        // an action column that would take 68px from every title.
        <span className="flex flex-col items-end gap-1">
          <SeatMeter seats={seats} sectionKey={key} stacked />
          {readOnly ? null : (
            <RowMenu courseCode={courseCode} placed className="-mr-1" />
          )}
        </span>
      }
    >
      <WithTooltip
        label={
          problemText
            ? `See details. ${problemText}`
            : "See sections and details"
        }
      >
        <button
          type="button"
          onClick={() => openCourse(courseCode)}
          className="block w-full text-left"
          data-testid={`course-row-${courseCode}`}
        >
          <span className="flex items-baseline gap-2">
            <span className="ident font-semibold text-base">{courseCode}</span>
            <span className="ident text-muted text-sm">{sectionCode}</span>
            {problems ? (
              <span className="sr-only">
                {`${problems.length} ${problems.length === 1 ? "problem" : "problems"}`}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-sm">
            {course?.title ?? "\u00a0"}
          </span>
          <span className="block truncate text-muted text-sm">
            {sectionLine(section)}
          </span>
          {said.length > 0 ? (
            <span
              className={cn(
                "block truncate text-sm",
                worst && TONE_TEXT[severityTone(worst)],
              )}
            >
              {said.map(({ words, severity }, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: problems keep their order
                <Fragment key={i}>
                  {i > 0 ? " · " : null}
                  <span className={TONE_TEXT[severityTone(severity)]}>
                    <MessageText message={words} />
                  </span>
                </Fragment>
              ))}
            </span>
          ) : null}
        </button>
      </WithTooltip>
    </ListRow>
  );

  return (
    <li>
      {readOnly ? (
        row
      ) : (
        <WithContextMenu courseCode={courseCode} placed>
          {row}
        </WithContextMenu>
      )}
    </li>
  );
}

function SavedRow({
  courseCode,
  title,
  readOnly,
}: {
  courseCode: CourseCode;
  title: string | undefined;
  readOnly: boolean;
}) {
  const row = (
    <ListRow
      density="compact"
      className="group hover:bg-hover has-[button[data-state=open]]:bg-hover"
      lead={
        <Bookmark size={12} className="mx-px shrink-0 text-muted" aria-hidden />
      }
      trail={
        readOnly ? undefined : (
          <RowMenu courseCode={courseCode} placed={false} className="-mr-1" />
        )
      }
    >
      <WithTooltip label="Pick a section">
        <button
          type="button"
          onClick={() => openCourse(courseCode)}
          className="flex w-full items-baseline gap-2 text-left"
        >
          <span className="ident font-semibold text-base">{courseCode}</span>
          <span className="truncate text-muted text-sm">{title}</span>
        </button>
      </WithTooltip>
    </ListRow>
  );
  return (
    <li>
      {readOnly ? (
        row
      ) : (
        <WithContextMenu courseCode={courseCode} placed={false}>
          {row}
        </WithContextMenu>
      )}
    </li>
  );
}

interface MenuAction {
  key: string;
  label: string;
  icon: typeof Trash2;
  run: () => void;
  separatorBefore?: boolean;
}

function menuActions(courseCode: CourseCode, placed: boolean): MenuAction[] {
  return [
    {
      key: "open",
      label: placed ? "See sections and details" : "Pick a section",
      icon: PanelRightOpen,
      run: () => openCourse(courseCode),
    },
    ...(placed
      ? [
          {
            key: "save",
            label: "Save for later",
            icon: BookmarkPlus,
            run: () => {
              saveCourseForLater(courseCode, "menu");
            },
          },
        ]
      : []),
    {
      key: "remove",
      label: "Remove from plan",
      icon: Trash2,
      separatorBefore: true,
      run: () => {
        removeCourse(courseCode, "menu");
      },
    },
  ];
}

/** The row's ⋯ button: the same actions as its right-click menu. */
function RowMenu({
  courseCode,
  placed,
  className,
}: {
  courseCode: CourseCode;
  placed: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <WithTooltip label={`Actions for ${courseCode}`}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${courseCode}`}
            className={cn(
              "flex size-6 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-raised hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 data-[state=open]:bg-raised data-[state=open]:opacity-100",
              className,
            )}
          >
            <Ellipsis size={14} aria-hidden />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end">
        {menuActions(courseCode, placed).map((a) => (
          <MenuItemPair key={a.key} action={a} kind="dropdown" />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WithContextMenu({
  courseCode,
  placed,
  children,
}: {
  courseCode: CourseCode;
  placed: boolean;
  children: ReactElement;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {menuActions(courseCode, placed).map((a) => (
          <MenuItemPair key={a.key} action={a} kind="context" />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MenuItemPair({
  action,
  kind,
}: {
  action: MenuAction;
  kind: "dropdown" | "context";
}) {
  const Icon = action.icon;
  const Item = kind === "dropdown" ? DropdownMenuItem : ContextMenuItem;
  const Separator =
    kind === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator;
  return (
    <>
      {action.separatorBefore ? <Separator /> : null}
      <Item onSelect={action.run}>
        <Icon aria-hidden className="text-muted" />
        {action.label}
      </Item>
    </>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col">
      {[0.62, 0.5, 0.7].map((w) => (
        <div
          key={w}
          className="flex flex-col gap-2 border-hairline border-b px-4 py-3"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-4 h-3" style={{ width: `${w * 100}%` }} />
        </div>
      ))}
    </div>
  );
}
