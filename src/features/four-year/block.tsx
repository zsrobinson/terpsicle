import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { MoreHorizontal } from "lucide-react";
import type { DragEvent } from "react";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { messageToText } from "~/components/message-text";
import { wildcardDetail, wildcardLabel } from "~/core/catalog/wildcard";
import { isUnknownCourse } from "~/core/four-year/course-lookup";
import { entryCredits } from "~/core/four-year/credits";
import { displayTitle } from "~/core/four-year/display-title";
import type { GenEdPick } from "~/core/four-year/gen-ed";
import {
  entriesInTerm,
  fourYearTermLabel,
  isSemester,
  nextSemester,
} from "~/core/four-year/terms";
import { courseSlug } from "~/core/reviews/slugs";
import { GEN_ED_LABELS, planetTerpCourseUrl, type TermId } from "~/core/schema";
import {
  type FourYearCourseEntry,
  type FourYearEntry,
  type FourYearTerm,
  type FourYearTermStatus,
  WILDCARD_CREDITS,
} from "~/core/schema/four-year";
import { useAccount } from "~/features/auth/account-store";
import { crossLinkClicked } from "~/lib/cross-link";
import {
  ActionMenu,
  ActionMenuGroup,
  ActionMenuItem,
  ActionMenuLinkItem,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
  ActionMenuSub,
} from "~/ui/action-menu";
import { Button } from "~/ui/button";
import { OUTSIDE_TAB, OutsideArrow } from "~/ui/outside-link";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import {
  entryName,
  moveEntry,
  removeEntry,
  setCredits,
  setGenEdChoice,
} from "./actions";
import { creditKind } from "./credit-panel";
import { CLOSE_DRILL, useModel, usePlanNav, usePlanReadOnly } from "./model";
import { focusSearch } from "./search-panel";

// A block: one course, placeholder or transfer credit in a semester (V3
// §2.13). Code, credits (and the grade, once taken), title and GenEd chips.
// Drag it to another semester, or use its menu ("Move to…"), which is also
// the keyboard's and touch's way. A problem shows as a thin warning inset,
// never a red outline (DESIGN §5); the Problems tab says what it is.

/** The drag's payload type: an entry id, only between Plan's own columns. */
export const ENTRY_DRAG_TYPE = "application/x-terpsicle-four-year-entry";

function Chips({ picks }: { picks: readonly GenEdPick[] }) {
  const shown = picks.filter((p) => p.code !== null);
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((p) => (
        <span
          key={p.group}
          className={cn(
            "ident border border-hairline px-1 text-2xs leading-[14px]",
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
          className="ident border border-hairline px-1 text-2xs text-muted leading-[14px]"
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
  // Our Reviews pages, or PlanetTerp's course page while they're off.
  const reviewsOn = useAccount(
    (s) => s.flags.reviewsPages && s.flags.reviews !== "off",
  );
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
  // Reordering within a semester, for the keyboard and touch (drag does it too).
  const siblings = entriesInTerm(doc, entry.term);
  const at = siblings.findIndex((e) => e.id === entry.id);
  const summaryOf = (t: FourYearTerm) => {
    const s = summaries.get(t);
    return s ? `${s.credits} cr` : "";
  };
  return (
    <ActionMenu
      title={name}
      tooltip={`Move, remove or change ${name}`}
      align="end"
      className="w-[220px]"
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${name} options`}
          className="size-6 shrink-0"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      }
    >
      {entry.kind === "credit" ? (
        <ActionMenuItem
          onSelect={() =>
            nav.go({ credit: entry.id, course: undefined }, { drill: true })
          }
        >
          What it counts as
        </ActionMenuItem>
      ) : null}
      {entry.kind === "course" ? (
        <ActionMenuItem
          onSelect={() =>
            nav.go({ course: entry.code, credit: undefined }, { drill: true })
          }
        >
          {!isUnknownCourse(lookup, entry.code)
            ? `About ${entry.code}`
            : entry.details
              ? "Edit course info"
              : "Add course info"}
        </ActionMenuItem>
      ) : null}
      {entry.kind === "course" && reviewsOn ? (
        <ActionMenuLinkItem
          tooltip={`${entry.code}'s grades and reviews`}
          render={
            <Link
              to="/reviews/$slug"
              params={{ slug: courseSlug(entry.code) }}
              onClick={() => crossLinkClicked("plan", "reviews")}
            />
          }
        >
          <IntegrationLabel product="reviews" />
        </ActionMenuLinkItem>
      ) : null}
      {entry.kind === "course" && !reviewsOn ? (
        <ActionMenuLinkItem
          tooltip={`${entry.code}'s reviews and grades on PlanetTerp, in a new tab`}
          render={<a href={planetTerpCourseUrl(entry.code)} {...OUTSIDE_TAB} />}
        >
          <span className="inline-flex items-center gap-0.5">
            <IntegrationLabel product="reviews">
              Reviews on PlanetTerp
            </IntegrationLabel>
            <OutsideArrow />
          </span>
        </ActionMenuLinkItem>
      ) : null}
      {entry.kind === "wildcard" ? (
        <ActionMenuItem
          onSelect={() => {
            nav.go({
              tab: "search",
              wildcard: entry.id,
              gened: undefined,
              credits: undefined,
              level: undefined,
              semester: entry.term,
              ...CLOSE_DRILL,
              q: undefined,
            });
            focusSearch();
          }}
        >
          Pick a course
        </ActionMenuItem>
      ) : null}
      {at > 0 ? (
        <ActionMenuItem
          onSelect={() => moveEntry(doc, entry, entry.term, "menu", at - 1)}
        >
          Move up
        </ActionMenuItem>
      ) : null}
      {at >= 0 && at < siblings.length - 1 ? (
        <ActionMenuItem
          onSelect={() => moveEntry(doc, entry, entry.term, "menu", at + 1)}
        >
          Move down
        </ActionMenuItem>
      ) : null}
      {targets.columns.length > 0 ? (
        <ActionMenuSub label="Move to…" className="w-[200px]">
          {targets.columns.map((term) => (
            <ActionMenuItem
              key={term}
              hint={summaryOf(term) || undefined}
              onSelect={() => moveEntry(doc, entry, term, "menu")}
            >
              {fourYearTermLabel(term)}
            </ActionMenuItem>
          ))}
          {targets.extra.length > 0 ? (
            <>
              <ActionMenuSeparator />
              <ActionMenuGroup label="Summer and winter">
                {targets.extra.map((term) => (
                  <ActionMenuItem
                    key={term}
                    onSelect={() => moveEntry(doc, entry, term, "menu")}
                  >
                    {fourYearTermLabel(term)}
                  </ActionMenuItem>
                ))}
              </ActionMenuGroup>
            </>
          ) : null}
        </ActionMenuSub>
      ) : null}
      {creditChoices.length > 0 ? (
        <ActionMenuSub label="Credits" className="w-[160px]">
          <ActionMenuRadioGroup
            value={String(entryCredits(entry, lookup))}
            onValueChange={(value) => setCredits(doc, entry, Number(value))}
          >
            {creditChoices.map((n) => (
              <ActionMenuRadioItem key={n} value={String(n)}>
                {n} {n === 1 ? "credit" : "credits"}
              </ActionMenuRadioItem>
            ))}
          </ActionMenuRadioGroup>
        </ActionMenuSub>
      ) : null}
      {orGroups.map(({ group, index }) => {
        const chosen =
          entry.kind === "course" ? entry.genEdChoices[String(index)] : null;
        const counted = picks.find((p) => p.group === index)?.code ?? null;
        return (
          <ActionMenuSub
            key={index}
            label={`Counts as ${counted ?? "…"}`}
            className="w-[240px]"
          >
            <ActionMenuRadioGroup
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
              <ActionMenuRadioItem value="auto">
                Where it helps most
              </ActionMenuRadioItem>
              {group.map((option) => (
                <ActionMenuRadioItem
                  key={option.code}
                  value={option.code}
                  hint={option.condition ?? GEN_ED_LABELS[option.code]}
                >
                  <span className="ident">{option.code}</span>
                </ActionMenuRadioItem>
              ))}
            </ActionMenuRadioGroup>
          </ActionMenuSub>
        );
      })}
      <ActionMenuSeparator />
      <ActionMenuItem onSelect={() => removeEntry(doc, entry)}>
        Remove from {fourYearTermLabel(entry.term)}
      </ActionMenuItem>
    </ActionMenu>
  );
}

function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = Math.ceil(min); n <= max; n++) out.push(n);
  return out;
}

/** "Counts as CHEM131", under a block Testudo can't match. */
function CountsAsLine({ code }: { code: string | null }) {
  if (!code) return null;
  return (
    <span className="block truncate text-muted text-xs">
      Counts as <span className="ident">{code}</span>
    </span>
  );
}

/** The second line: the catalog's title, or what we know instead. */
function CourseTitle({ entry }: { entry: FourYearCourseEntry }) {
  const { lookup, deptsFailed } = useModel();
  const { code } = entry;
  const failed = deptsFailed.has(code.slice(0, 4));
  const course = lookup.courses.get(code);
  if (course)
    return (
      <span className="block truncate text-muted text-sm">{course.title}</span>
    );
  if (isUnknownCourse(lookup, code)) {
    // The person's title, then the transcript's, then what's missing.
    const raw = entry.details?.title ?? entry.transcript?.title ?? null;
    const title = raw === null ? null : displayTitle(raw);
    return (
      <>
        <span className="block truncate text-muted text-sm">
          {title ?? "Not in Testudo's course list"}
        </span>
        <CountsAsLine code={entry.details?.countsAs ?? null} />
      </>
    );
  }
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
  const readOnly = usePlanReadOnly();
  // A shared plan's reader has no Problems view to say what an inset means.
  const problems = readOnly ? [] : (problemsByEntry.get(entry.id) ?? []);
  const credits = entryCredits(entry, lookup);
  const known =
    entry.kind !== "course" ||
    lookup.courses.has(entry.code) ||
    entry.credits !== null;
  const grade = entry.kind === "course" ? doc.grades[entry.id] : undefined;
  const open =
    entry.kind === "course"
      ? nav.search.course === entry.code
      : entry.kind === "credit" && nav.search.credit === entry.id;
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
          <span className="ident min-w-0 truncate font-semibold">
            {entry.code}
          </span>
          <span className="ml-auto flex shrink-0 items-baseline gap-1.5 text-sm">
            {grade ? (
              <span data-private className="font-semibold">
                {grade}
              </span>
            ) : null}
            <span className="tnum text-muted">{creditsText}</span>
          </span>
        </span>
        <CourseTitle entry={entry} />
      </>
    ) : entry.kind === "wildcard" ? (
      <>
        <span className="flex items-baseline gap-2">
          <span className="truncate font-semibold">
            {entry.wildcard.kind === "pattern" ? (
              <span className="ident">{entry.wildcard.pattern}</span>
            ) : (
              <>
                Any <span className="ident">{entry.wildcard.code}</span> course
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
          <span className="truncate font-semibold">
            {displayTitle(entry.title)}
          </span>
          <span className="tnum ml-auto shrink-0 text-muted text-sm">
            {creditsText}
          </span>
        </span>
        <span className="block truncate text-muted text-sm">
          {creditKind(entry)}
          {entry.equivalentPattern ? (
            <>
              {" · "}
              <span className="ident">{entry.equivalentPattern}</span>
            </>
          ) : null}
        </span>
        <CountsAsLine code={entry.countsAs ?? null} />
      </>
    );

  const action =
    entry.kind === "course"
      ? `About ${entry.code}`
      : entry.kind === "wildcard"
        ? `Pick a course for ${entryName(entry)}`
        : `What ${displayTitle(entry.title)} counts as`;
  // The inset says there's a problem; the tooltip says which, so a glance
  // doesn't need the Problems tab ("CMSC452 is usually spring only").
  const first = problems[0];
  const label = first ? `${action}. ${messageToText(first.title)}` : action;

  if (readOnly)
    return (
      <li
        data-entry-id={entry.id}
        className={cn(
          "space-y-0.5 border px-2 py-1.5",
          entry.kind === "wildcard"
            ? "border-hairline-strong border-dashed"
            : "border-hairline",
          done ? "text-muted" : "bg-raised",
        )}
      >
        {main}
        {entry.kind === "course" ? (
          <Chips picks={genEds.picks.get(entry.id) ?? []} />
        ) : entry.kind === "credit" ? (
          <CodeChips codes={entry.genEds} />
        ) : null}
      </li>
    );

  return (
    <li
      data-entry-id={entry.id}
      draggable
      onDragStart={onDragStart}
      className={cn(
        "group/block flex items-start gap-1 border bg-raised transition-colors",
        entry.kind === "wildcard"
          ? "border-hairline-strong border-dashed"
          : "border-hairline",
        done && "bg-transparent",
        open && "bg-accent-soft",
        problems.length > 0 && "shadow-[inset_2px_0_0_var(--color-warn)]",
        "cursor-grab active:cursor-grabbing",
      )}
    >
      <WithTooltip label={label}>
        <button
          type="button"
          onClick={() => {
            if (entry.kind !== "wildcard") {
              if (open) nav.back(CLOSE_DRILL);
              else
                nav.go(
                  entry.kind === "course"
                    ? { course: entry.code, credit: undefined }
                    : { credit: entry.id, course: undefined },
                  { drill: true },
                );
              return;
            }
            nav.go({
              tab: "search",
              wildcard: entry.id,
              gened: undefined,
              credits: undefined,
              level: undefined,
              semester: entry.term,
              ...CLOSE_DRILL,
              q: undefined,
            });
            focusSearch();
          }}
          className={cn(
            // Lit while the block's ⋯ menu is open, as under the pointer.
            "min-w-0 flex-1 space-y-0.5 px-2 py-1.5 text-left hover:bg-hover group-menu-open/block:bg-hover",
            done && "text-muted",
          )}
        >
          {main}
          {problems.length > 0 ? (
            <span className="sr-only">, has a problem (see Problems)</span>
          ) : null}
          {entry.kind === "course" ? (
            <Chips picks={genEds.picks.get(entry.id) ?? []} />
          ) : entry.kind === "credit" ? (
            <CodeChips codes={entry.genEds} />
          ) : null}
        </button>
      </WithTooltip>
      <div className="py-0.5 pr-0.5 md:py-1 md:pr-1">
        <BlockMenu entry={entry} />
      </div>
    </li>
  );
}
