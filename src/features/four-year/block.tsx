import { cn } from "cn";
import { MoreHorizontal } from "lucide-react";
import type { DragEvent } from "react";
import { wildcardDetail, wildcardLabel } from "~/core/catalog/wildcard";
import { isUnknownCourse } from "~/core/four-year/course-lookup";
import { entryCredits } from "~/core/four-year/credits";
import type { GenEdPick } from "~/core/four-year/gen-ed";
import {
  fourYearTermLabel,
  isSemester,
  nextSemester,
} from "~/core/four-year/terms";
import { GEN_ED_LABELS, type TermId } from "~/core/schema";
import {
  type FourYearEntry,
  type FourYearTerm,
  type FourYearTermStatus,
  WILDCARD_CREDITS,
} from "~/core/schema/four-year";
import { useCourseIndex } from "~/state/course-index-store";
import { Button } from "~/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import {
  entryName,
  moveEntry,
  removeEntry,
  setCredits,
  setGenEdChoice,
} from "./actions";
import { useModel, usePlanNav } from "./model";
import { focusSearch } from "./search-panel";

// A block: one course, placeholder or transfer credit in a semester (V3
// §2.13). Code, credits (and the grade, once taken), title and GenEd chips.
// Drag it to another semester, or use its menu ("Move to…"), which is also
// the keyboard's and touch's way. A problem shows as a thin warning inset,
// never a red outline (DESIGN §5); the Problems tab says what it is.

/** The drag's payload type: an entry id, only between Plan's own columns. */
export const ENTRY_DRAG_TYPE = "application/x-terpsicle-four-year-entry";

/** Menu rows are 44px on phones, like every other target there. */
export const MENU_ITEM = "max-md:min-h-11";

function Chips({ picks }: { picks: readonly GenEdPick[] }) {
  const shown = picks.filter((p) => p.code !== null);
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((p) => (
        <span
          key={p.group}
          className={cn(
            "border border-hairline px-1 font-mono text-2xs leading-[14px]",
            p.counts ? "text-muted" : "text-faint line-through",
          )}
        >
          {p.code}
          {p.condition ? "*" : ""}
        </span>
      ))}
    </span>
  );
}

function CodeChips({ codes }: { codes: readonly string[] }) {
  if (codes.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <span
          key={code}
          className="border border-hairline px-1 font-mono text-2xs text-muted leading-[14px]"
        >
          {code}
        </span>
      ))}
    </span>
  );
}

/** The terms a block can move to: every column, then the summers and winters between. */
function moveTargets(
  columns: readonly FourYearTerm[],
  entry: FourYearEntry,
): { columns: FourYearTerm[]; extra: TermId[] } {
  if (entry.kind === "credit") return { columns: [], extra: [] };
  const semesters = columns.filter(isSemester);
  const extra: TermId[] = [];
  for (const term of semesters.slice(0, -1)) {
    const year = Number(term.slice(0, 4));
    // A fall is followed by its winter; a spring by its summer.
    const between: TermId = term.endsWith("08") ? `${year}12` : `${year}05`;
    if (!columns.includes(between)) extra.push(between);
  }
  return {
    columns: columns.filter((t) => t !== entry.term),
    extra: extra.filter((t) => t < nextSemester(semesters.at(-1) ?? t)),
  };
}

function BlockMenu({ entry }: { entry: FourYearEntry }) {
  const { doc, columns, lookup, genEds, summaries } = useModel();
  const nav = usePlanNav();
  const course =
    entry.kind === "course" ? lookup.courses.get(entry.code) : null;
  const targets = moveTargets(columns, entry);
  const name = entryName(entry);
  const variable = course && course.credits.min !== course.credits.max;
  const creditChoices =
    entry.kind === "wildcard"
      ? range(WILDCARD_CREDITS.min, WILDCARD_CREDITS.max)
      : variable
        ? range(course.credits.min, course.credits.max)
        : [];
  const orGroups =
    entry.kind === "course" && course
      ? course.genEds
          .map((group, index) => ({ group, index }))
          .filter(({ group }) => group.length > 1)
      : [];
  const picks = genEds.picks.get(entry.id) ?? [];
  const summaryOf = (t: FourYearTerm) => {
    const s = summaries.get(t);
    return s ? `${s.credits} cr` : "";
  };
  return (
    <DropdownMenu>
      <WithTooltip label={`Move, remove or change ${name}`}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${name} options`}
            className="size-11 shrink-0 md:size-6"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end" className="w-[220px]">
        {entry.kind === "course" ? (
          <DropdownMenuItem
            className={MENU_ITEM}
            onSelect={() => nav.go({ course: entry.code })}
          >
            About {entry.code}
          </DropdownMenuItem>
        ) : null}
        {entry.kind === "wildcard" ? (
          <DropdownMenuItem
            className={MENU_ITEM}
            onSelect={() => {
              nav.go({
                tab: "search",
                wildcard: entry.id,
                semester: entry.term,
                course: undefined,
              });
              focusSearch();
            }}
          >
            Pick a course
          </DropdownMenuItem>
        ) : null}
        {targets.columns.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={MENU_ITEM}>
              Move to…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-[200px]">
              {targets.columns.map((term) => (
                <DropdownMenuItem
                  key={term}
                  className={MENU_ITEM}
                  onSelect={() => moveEntry(doc, entry, term, "menu")}
                >
                  <span className="flex-1">{fourYearTermLabel(term)}</span>
                  <span className="tnum text-muted text-xs">
                    {summaryOf(term)}
                  </span>
                </DropdownMenuItem>
              ))}
              {targets.extra.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Summer and winter</DropdownMenuLabel>
                  {targets.extra.map((term) => (
                    <DropdownMenuItem
                      key={term}
                      className={MENU_ITEM}
                      onSelect={() => moveEntry(doc, entry, term, "menu")}
                    >
                      {fourYearTermLabel(term)}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {creditChoices.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={MENU_ITEM}>
              Credits
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-[160px]">
              <DropdownMenuRadioGroup
                value={String(entryCredits(entry, lookup))}
                onValueChange={(value) => setCredits(doc, entry, Number(value))}
              >
                {creditChoices.map((n) => (
                  <DropdownMenuRadioItem
                    key={n}
                    value={String(n)}
                    className={MENU_ITEM}
                  >
                    {n} {n === 1 ? "credit" : "credits"}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {orGroups.map(({ group, index }) => {
          const chosen =
            entry.kind === "course" ? entry.genEdChoices[String(index)] : null;
          const counted = picks.find((p) => p.group === index)?.code ?? null;
          return (
            <DropdownMenuSub key={index}>
              <DropdownMenuSubTrigger className={MENU_ITEM}>
                Counts as {counted ?? "…"}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-[240px]">
                <DropdownMenuRadioGroup
                  value={chosen ?? "auto"}
                  onValueChange={(value) =>
                    setGenEdChoice(
                      doc,
                      entry,
                      index,
                      value === "auto" ? null : value,
                    )
                  }
                >
                  <DropdownMenuRadioItem value="auto" className={MENU_ITEM}>
                    Where it helps most
                  </DropdownMenuRadioItem>
                  {group.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.code}
                      value={option.code}
                      className={MENU_ITEM}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-mono">{option.code}</span>{" "}
                        <span className="text-muted">
                          {option.condition ?? GEN_ED_LABELS[option.code] ?? ""}
                        </span>
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={MENU_ITEM}
          onSelect={() => removeEntry(doc, entry)}
        >
          Remove from {fourYearTermLabel(entry.term)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = Math.ceil(min); n <= max; n++) out.push(n);
  return out;
}

/** The second line: the catalog's title, or what we know instead. */
function CourseTitle({ code }: { code: string }) {
  const { lookup } = useModel();
  const failed = useCourseIndex(
    (s) => s.deptsState[code.slice(0, 4)] === "error",
  );
  const course = lookup.courses.get(code);
  if (course)
    return (
      <span className="block truncate text-muted text-sm">{course.title}</span>
    );
  if (isUnknownCourse(lookup, code))
    return (
      <span className="block truncate text-muted text-sm">
        Not in Testudo's course list
      </span>
    );
  if (failed)
    return (
      <span className="block truncate text-muted text-sm">
        Couldn't load its title
      </span>
    );
  return <Skeleton className="my-0.5 h-3 w-3/4" />;
}

export function EntryBlock({
  entry,
  status,
}: {
  entry: FourYearEntry;
  status: FourYearTermStatus;
}) {
  const { doc, lookup, genEds, problemsByEntry } = useModel();
  const nav = usePlanNav();
  const problems = problemsByEntry.get(entry.id) ?? [];
  const credits = entryCredits(entry, lookup);
  const known =
    entry.kind !== "course" ||
    lookup.courses.has(entry.code) ||
    entry.credits !== null;
  const grade = entry.kind === "course" ? doc.grades[entry.id] : undefined;
  const open = entry.kind === "course" && nav.search.course === entry.code;
  const done = status === "done";

  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData(ENTRY_DRAG_TYPE, entry.id);
    event.dataTransfer.effectAllowed = "move";
  };

  const creditsText = known ? `${credits} cr` : "– cr";
  const main =
    entry.kind === "course" ? (
      <>
        <span className="flex items-baseline gap-2">
          <span className="font-mono font-semibold">{entry.code}</span>
          <span className="ml-auto flex shrink-0 items-baseline gap-1.5 text-sm">
            {grade ? (
              <span data-private className="font-semibold">
                {grade}
              </span>
            ) : null}
            <span className="tnum text-muted">{creditsText}</span>
          </span>
        </span>
        <CourseTitle code={entry.code} />
      </>
    ) : entry.kind === "wildcard" ? (
      <>
        <span className="flex items-baseline gap-2">
          <span className="truncate font-semibold">
            {entry.wildcard.kind === "pattern" ? (
              <span className="font-mono">{entry.wildcard.pattern}</span>
            ) : (
              <>
                Any <span className="font-mono">{entry.wildcard.code}</span>{" "}
                course
              </>
            )}
          </span>
          <span className="tnum ml-auto shrink-0 text-muted text-sm">
            {creditsText}
          </span>
        </span>
        <span className="block truncate text-muted text-sm">
          {entry.wildcard.kind === "pattern"
            ? wildcardLabel(entry.wildcard)
            : (wildcardDetail(entry.wildcard) ?? "Any course with that GenEd")}
        </span>
      </>
    ) : (
      <>
        <span className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{entry.title}</span>
          <span className="tnum ml-auto shrink-0 text-muted text-sm">
            {creditsText}
          </span>
        </span>
        <span className="block truncate text-muted text-sm">
          Transfer credit
        </span>
      </>
    );

  const label =
    entry.kind === "course"
      ? `About ${entry.code}`
      : entry.kind === "wildcard"
        ? `Pick a course for ${entryName(entry)}`
        : entry.title;

  return (
    <li
      data-entry-id={entry.id}
      draggable
      onDragStart={onDragStart}
      aria-label={
        problems.length > 0 ? `${entryName(entry)}, has a problem` : undefined
      }
      className={cn(
        "group flex items-start gap-1 border bg-raised transition-colors",
        entry.kind === "wildcard"
          ? "border-hairline-strong border-dashed"
          : "border-hairline",
        done && "bg-transparent",
        open && "bg-accent-soft",
        problems.length > 0 && "shadow-[inset_2px_0_0_var(--color-warn)]",
        "cursor-grab active:cursor-grabbing",
      )}
    >
      {entry.kind === "credit" ? (
        <div className="min-w-0 flex-1 px-2 py-1.5">
          {main}
          <CodeChips codes={entry.genEds} />
        </div>
      ) : (
        <WithTooltip label={label}>
          <button
            type="button"
            onClick={() => {
              if (entry.kind === "course") {
                nav.go({ course: open ? undefined : entry.code });
                return;
              }
              nav.go({
                tab: "search",
                wildcard: entry.id,
                semester: entry.term,
                course: undefined,
              });
              focusSearch();
            }}
            className={cn(
              "min-w-0 flex-1 space-y-0.5 px-2 py-1.5 text-left hover:bg-hover",
              done && "text-muted",
            )}
          >
            {main}
            {entry.kind === "course" ? (
              <Chips picks={genEds.picks.get(entry.id) ?? []} />
            ) : null}
          </button>
        </WithTooltip>
      )}
      <div className="py-0.5 pr-0.5 md:py-1 md:pr-1">
        <BlockMenu entry={entry} />
      </div>
    </li>
  );
}
