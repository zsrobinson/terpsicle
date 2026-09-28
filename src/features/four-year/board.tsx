import { cn } from "cn";
import { Plus } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { termTagOf } from "~/core/catalog/term-tag";
import { columnLabel } from "~/core/four-year/credits";
import {
  academicYearLabel,
  academicYearOf,
  entriesInTerm,
  fourYearTermLabel,
  fourYearTermShortLabel,
} from "~/core/four-year/terms";
import type { FourYearTerm, FourYearTermStatus } from "~/core/schema/four-year";
import { Button } from "~/ui/button";
import { TermTag } from "~/ui/term-tag";
import { WithTooltip } from "~/ui/tooltip";
import { moveEntry } from "./actions";
import { ENTRY_DRAG_TYPE, EntryBlock } from "./block";
import { ViewSchedule, ViewTodos } from "./column-links";
import { CLOSE_DRILL, useModel, usePlanNav, usePlanReadOnly } from "./model";
import { focusSearch } from "./search-panel";

// The semesters (V3 §2.13), the workbench's canvas. Desktop: "Before UMD"
// across the top, then each school year's fall and spring (and any summer
// or winter) side by side, two years to a row when the canvas is wide.
// Phone: a strip of semesters with their credits, and one semester's list
// under it.

export const STATUS_WORDS: Record<FourYearTermStatus, string> = {
  done: "Done",
  "in-progress": "In progress",
  planned: "Planned",
};

/** Where in a column a drop at `y` lands: before the first block whose middle is below it. */
function dropIndex(
  list: HTMLElement,
  y: number,
  dragged: string | null,
): number {
  const blocks = [
    ...list.querySelectorAll<HTMLElement>("[data-entry-id]"),
  ].filter((el) => el.dataset.entryId !== dragged);
  const i = blocks.findIndex((el) => {
    const box = el.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
  return i === -1 ? blocks.length : i;
}

function useDrop(term: FourYearTerm) {
  const { doc } = useModel();
  const [over, setOver] = useState(false);
  const accepts = (event: DragEvent) =>
    event.dataTransfer.types.includes(ENTRY_DRAG_TYPE);
  return {
    over,
    handlers: {
      onDragEnter: (event: DragEvent) => {
        if (accepts(event)) setOver(true);
      },
      onDragOver: (event: DragEvent) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (event: DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOver(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        setOver(false);
        const id = event.dataTransfer.getData(ENTRY_DRAG_TYPE);
        const entry = doc.entries.find((e) => e.id === id);
        if (!entry) return;
        event.preventDefault();
        const list = event.currentTarget.querySelector("ul");
        const index = list ? dropIndex(list, event.clientY, id) : undefined;
        moveEntry(doc, entry, term, "drag", index);
      },
    },
  };
}

function AddButton({
  term,
  compact = false,
}: {
  term: FourYearTerm;
  compact?: boolean;
}) {
  const nav = usePlanNav();
  const label = `Add a course to ${fourYearTermLabel(term)}`;
  return (
    <WithTooltip label={label}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={label}
        onClick={() => {
          nav.go({
            tab: "search",
            semester: term,
            ...CLOSE_DRILL,
            wildcard: undefined,
            gened: undefined,
            credits: undefined,
            level: undefined,
            q: undefined,
          });
          focusSearch("column");
        }}
        className={cn(
          "w-full justify-start px-2 font-medium text-muted",
          compact && "w-auto",
        )}
      >
        <Plus aria-hidden="true" />
        {term === "before" ? "Add AP, exam or transfer credit" : "Add a course"}
      </Button>
    </WithTooltip>
  );
}

/** One semester: its header, its blocks and "Add a course". */
export function TermColumn({
  term,
  className,
  heading: Heading = "h3",
}: {
  term: FourYearTerm;
  className?: string;
  /** h3 under a year's heading on desktop; h2 alone on a phone. */
  heading?: "h2" | "h3";
}) {
  const { doc, statusOf, summaries, handoffTerm, tags } = useModel();
  const nav = usePlanNav();
  const readOnly = usePlanReadOnly();
  const drop = useDrop(term);
  const { over, handlers } = readOnly ? { over: false, handlers: {} } : drop;
  const entries = entriesInTerm(doc, term);
  const status = statusOf(term);
  const tag = termTagOf(term, tags);
  const summary = summaries.get(term);
  const picked = nav.search.tab === "search" && nav.search.semester === term;
  const id = `term-${term}`;
  return (
    <section
      aria-labelledby={id}
      data-term={term}
      {...handlers}
      className={cn(
        "flex min-w-0 flex-col border border-hairline bg-panel",
        // A rule in Plan's color, not a fill: a whole column of green-900
        // was a heavy olive block in the dark theme (QA P6).
        status === "in-progress" && "border-t-2 border-t-product-plan-line",
        picked && "border-fg",
        over && "outline-2 outline-fg outline-dashed -outline-offset-2",
        className,
      )}
    >
      <header className="flex items-baseline gap-2 px-2 pt-2 pb-1.5">
        <Heading id={id} className="font-semibold">
          {fourYearTermLabel(term)}
        </Heading>
        {tag ? (
          // Now and Next, as every product tags them; the status says the rest.
          <TermTag tag={tag} className="self-center" />
        ) : (
          <span className="text-muted text-xs">{STATUS_WORDS[status]}</span>
        )}
        <span className="tnum ml-auto text-muted text-xs">
          {summary && summary.entries > 0 ? columnLabel(summary) : null}
        </span>
      </header>
      <ul
        aria-label={`${fourYearTermLabel(term)} courses`}
        className="flex flex-1 flex-col gap-1 px-1.5"
      >
        {entries.map((entry) => (
          <EntryBlock key={entry.id} entry={entry} status={status} />
        ))}
      </ul>
      {readOnly ? (
        entries.length === 0 ? (
          <p className="px-2 pb-2 text-faint text-sm">No courses yet</p>
        ) : (
          <div className="pb-1.5" />
        )
      ) : (
        <>
          <div className="p-1.5 pt-1">
            <AddButton term={term} />
          </div>
          {term === handoffTerm ? <ViewSchedule termId={term} /> : null}
          {status === "in-progress" ? <ViewTodos /> : null}
        </>
      )}
    </section>
  );
}

/** AP, exam and transfer credit, across the top. */
function BeforeRow() {
  const { doc, summaries } = useModel();
  const nav = usePlanNav();
  const readOnly = usePlanReadOnly();
  const drop = useDrop("before");
  const { over, handlers } = readOnly ? { over: false, handlers: {} } : drop;
  const entries = entriesInTerm(doc, "before");
  const summary = summaries.get("before");
  const picked =
    nav.search.tab === "search" && nav.search.semester === "before";
  return (
    <section
      aria-labelledby="term-before"
      data-term="before"
      {...handlers}
      className={cn(
        "border border-hairline bg-panel",
        picked && "border-fg",
        over && "outline-2 outline-fg outline-dashed -outline-offset-2",
      )}
    >
      <header className="flex items-baseline gap-2 px-2 pt-2 pb-1.5">
        <h2 id="term-before" className="font-semibold">
          Before UMD
        </h2>
        <span className="text-muted text-xs">AP, exam and transfer credit</span>
        <span className="tnum ml-auto text-muted text-xs">
          {summary && summary.entries > 0 ? columnLabel(summary) : null}
        </span>
      </header>
      <div className="flex flex-wrap items-start gap-1.5 px-1.5 pb-1.5">
        {entries.length > 0 ? (
          <ul
            aria-label="Before UMD courses"
            className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-1"
          >
            {entries.map((entry) => (
              <EntryBlock key={entry.id} entry={entry} status="done" />
            ))}
          </ul>
        ) : readOnly ? (
          <p className="px-0.5 pb-0.5 text-faint text-sm">None</p>
        ) : null}
        {readOnly ? null : <AddButton term="before" compact />}
      </div>
    </section>
  );
}

/** Desktop: every semester at once. */
export function Board() {
  const { columns } = useModel();
  const years = new Map<number, FourYearTerm[]>();
  for (const term of columns) {
    if (term === "before") continue;
    const year = academicYearOf(term);
    years.set(year, [...(years.get(year) ?? []), term]);
  }
  const ordered = [...years.entries()].sort(([a], [b]) => a - b);
  return (
    <div className="@container space-y-3">
      <BeforeRow />
      <div className="grid gap-x-3 gap-y-4 @4xl:grid-cols-2">
        {ordered.map(([year, terms], i) => (
          <section
            key={year}
            aria-label={`Year ${i + 1}, ${academicYearLabel(year)}`}
          >
            <h2 className="mb-1.5 flex items-baseline gap-2 text-muted text-xs">
              <span className="font-medium text-fg">Year {i + 1}</span>
              <span className="tnum">{academicYearLabel(year)}</span>
            </h2>
            {/* A year's semesters side by side, or stacked in a narrow
                canvas (a tablet, with the sidebar open). */}
            <div className="grid gap-1.5 @xl:auto-cols-[minmax(0,1fr)] @xl:grid-flow-col">
              {terms.map((term) => (
                <TermColumn key={term} term={term} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Phone: the strip of semesters, and the picked one's list. */
export function PhoneBoard({ selected }: { selected: FourYearTerm }) {
  const { columns, summaries, statusOf, tags } = useModel();
  const nav = usePlanNav();
  const strip = useRef<HTMLElement>(null);
  // Keep the picked semester in view as it changes (an Add, a problem).
  useEffect(() => {
    strip.current
      ?.querySelector(`[data-strip-term="${selected}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  return (
    <div className="space-y-2">
      <nav
        ref={strip}
        aria-label="Semesters"
        className="-mx-4 scroll-px-4 overflow-x-auto px-4 pb-1"
      >
        <ul className="flex gap-1.5">
          {columns.map((term) => {
            const summary = summaries.get(term);
            const current = term === selected;
            return (
              <li key={term}>
                <WithTooltip
                  label={`${fourYearTermLabel(term)}, ${STATUS_WORDS[statusOf(term)].toLowerCase()}`}
                >
                  <button
                    type="button"
                    data-strip-term={term}
                    aria-current={current ? "true" : undefined}
                    onClick={() => nav.go({ semester: term })}
                    className={cn(
                      "flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border px-3 text-sm",
                      current
                        ? "border-hairline-strong bg-accent-soft font-medium text-fg"
                        : "border-hairline bg-raised text-muted",
                      // Plan's color as a rule, as on the column (QA P6).
                      statusOf(term) === "in-progress" &&
                        "border-t-2 border-t-product-plan-line",
                    )}
                  >
                    {fourYearTermShortLabel(term)}
                    {term === "before" ? null : (
                      <TermTag tag={termTagOf(term, tags)} />
                    )}
                    <span className="tnum text-muted">
                      · {summary?.credits ?? 0} cr
                    </span>
                  </button>
                </WithTooltip>
              </li>
            );
          })}
        </ul>
      </nav>
      {selected === "before" ? (
        <BeforeRow />
      ) : (
        <TermColumn term={selected} heading="h2" />
      )}
    </div>
  );
}
