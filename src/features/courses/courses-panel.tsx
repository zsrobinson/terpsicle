import { cn } from "cn";
import {
  Bookmark,
  BookmarkPlus,
  Ellipsis,
  PanelRightOpen,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { type ReactElement, useMemo } from "react";
import { messageToText } from "~/app/message-text";
import { PanelBody, PanelHeader, PanelLabel } from "~/app/panel";
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
        title={plan.name}
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
        {saved.length > 0 || placed.length > 0 ? (
          <>
            <PanelLabel>Saved for later</PanelLabel>
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
              <p className="px-4 pb-4 text-[12px] text-faint">
                Courses you're considering but haven't placed show up here. Save
                one from its details.
              </p>
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

  const row = (
    <div className="group relative border-hairline border-b transition-colors hover:bg-hover has-[button[data-state=open]]:bg-hover">
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
          className="block w-full py-2.5 pr-4 pl-8 text-left"
          data-testid={`course-row-${courseCode}`}
        >
          <span className="flex items-center gap-2">
            <span className="font-mono font-semibold text-[12.5px]">
              {courseCode}
            </span>
            <span className="font-mono text-[11.5px] text-muted">
              {sectionCode}
            </span>
            {problems ? (
              <TriangleAlert
                size={12}
                className="shrink-0 text-warn"
                aria-label={`${problems.length} ${problems.length === 1 ? "problem" : "problems"}`}
              />
            ) : null}
            <SeatMeter seats={seats} sectionKey={key} className="ml-auto" />
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted">
            {course?.title ?? "\u00a0"}
          </span>
          <span className="mt-0.5 block truncate pr-7 text-[11.5px] text-muted">
            {sectionLine(section)}
          </span>
        </button>
      </WithTooltip>
      <div className="absolute top-[13px] left-[11px]">
        <CourseColorPicker
          courseCode={courseCode}
          color={color}
          readOnly={readOnly}
        />
      </div>
      {readOnly ? null : (
        <RowMenu
          courseCode={courseCode}
          placed
          className="absolute right-2 bottom-1.5"
        />
      )}
    </div>
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
    <div className="group relative transition-colors hover:bg-hover has-[button[data-state=open]]:bg-hover">
      <WithTooltip label="Pick a section">
        <button
          type="button"
          onClick={() => openCourse(courseCode)}
          className="flex w-full items-center gap-2 py-2 pr-10 pl-4 text-left"
        >
          <Bookmark size={12} className="shrink-0 text-muted" aria-hidden />
          <span className="font-mono font-semibold text-[12.5px]">
            {courseCode}
          </span>
          <span className="truncate text-[12px] text-muted">{title}</span>
        </button>
      </WithTooltip>
      {readOnly ? null : (
        <RowMenu
          courseCode={courseCode}
          placed={false}
          className="-translate-y-1/2 absolute top-1/2 right-2"
        />
      )}
    </div>
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
