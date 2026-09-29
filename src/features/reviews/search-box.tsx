import { Autocomplete } from "@base-ui/react/autocomplete";
import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowRight } from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { courseSlug, instructorSlug } from "~/core/reviews";
import type { CourseCode, InstructorId } from "~/core/schema";
import { useIsMobile } from "~/hooks/use-media-query";
import { InlineError } from "~/ui/inline-error";
import { SearchField } from "~/ui/input";
import { POPUP_CARD, POPUP_LAYER, POPUP_MOTION, POSITIONER } from "~/ui/popup";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import {
  browserReader,
  loadCourseSearch,
  loadPlanetTerpIndex,
  useLoaded,
} from "./data";
import { isDeptQuery, searchResults } from "./page-data";
import {
  SEARCH_LABEL,
  type SearchBoxProps,
  searchPlaceholder,
} from "./search-words";

// Reviews' one search (owner, 2026-09-29: the results show "above the page,
// like how you'd expect an autocomplete box to actually do instead of
// replacing the page contents"). Base UI's Autocomplete, in the kit's popup
// card: a combobox over a listbox, ↓ ↑ through the results, Enter to open
// the highlighted one (the first, as you type), Esc to close it and again
// to clear. Instructors and courses are equals; the last row goes to every
// result, `/reviews?q=`, the page search engines and "see all" read.
//
// Three places: the big box on /reviews (`page`), the small one in the
// family bar on every other Reviews page (`bar`), and a phone's sheet
// (`sheet`), where the results sit under the box rather than over the page.
// Its code loads after the page, behind a stand-in box (./search.tsx).

/** Rows of each kind the box shows; every result is a row away. */
const SHOWN = { instructors: 5, courses: 6 } as const;

type Hit =
  | { kind: "instructor"; id: InstructorId; name: string; depts: string[] }
  | { kind: "course"; code: CourseCode; title: string }
  | { kind: "all"; q: string; label: string };

interface HitGroup {
  value: string;
  items: Hit[];
}

const hitLabel = (hit: Hit) =>
  hit.kind === "instructor"
    ? hit.name
    : hit.kind === "course"
      ? hit.code
      : hit.q;

const hitKey = (hit: Hit) =>
  hit.kind === "instructor"
    ? `i:${hit.id}`
    : hit.kind === "course"
      ? `c:${hit.code}`
      : `all:${hit.q}`;

/** The course list and PlanetTerp's index, read once the search is used. */
function useSearchData(wanted: boolean) {
  return useLoaded(wanted ? "reviews-search" : null, async () => {
    const reader = await browserReader();
    const [rows, index] = await Promise.all([
      loadCourseSearch(reader),
      loadPlanetTerpIndex(reader).catch(() => null),
    ]);
    return { rows, index };
  });
}

/** What the box lists for `query`, in groups; empty until the lists load. */
function useHits(query: string, wanted: boolean) {
  const lists = useSearchData(wanted);
  const typed = query.trim();
  const groups = useMemo((): HitGroup[] => {
    if (typed === "" || lists.status !== "ready") return [];
    const { rows, index } = lists.data;
    const found = searchResults(rows, index, typed);
    const dept = isDeptQuery(typed) && found.courses.length > 1;
    const instructors: Hit[] = found.instructors
      .slice(0, SHOWN.instructors)
      .map(([id, name]) => ({
        kind: "instructor",
        id,
        name,
        depts: index?.instructors[id]?.[1] ?? [],
      }));
    const courses: Hit[] = found.courses
      .slice(0, SHOWN.courses)
      .map(([code, title]) => ({ kind: "course", code, title }));
    const more =
      found.instructors.length > SHOWN.instructors ||
      found.courses.length > SHOWN.courses;
    const all: Hit = {
      kind: "all",
      q: dept ? typed.toUpperCase() : typed,
      label: dept
        ? `Every ${typed.toUpperCase()} course (${found.courses.length})`
        : `Every result for “${typed}”`,
    };
    return [
      // A department's code is a browse: its whole list leads.
      ...(dept ? [{ value: "Department", items: [all] }] : []),
      ...(instructors.length > 0
        ? [{ value: "Instructors", items: instructors }]
        : []),
      ...(courses.length > 0 ? [{ value: "Courses", items: courses }] : []),
      ...(!dept && more ? [{ value: "More", items: [all] }] : []),
    ];
  }, [typed, lists]);
  return { groups, status: typed === "" ? "ready" : lists.status, lists };
}

/** Where a hit goes, as the router's link props. */
function hitLink(hit: Hit) {
  return hit.kind === "instructor"
    ? ({
        to: "/reviews/$slug",
        params: { slug: instructorSlug(hit.id) },
      } as const)
    : hit.kind === "course"
      ? ({
          to: "/reviews/$slug",
          params: { slug: courseSlug(hit.code) },
        } as const)
      : ({ to: "/reviews", search: { q: hit.q } } as const);
}

export function SearchBox({
  variant,
  initialQuery = "",
  placeholder,
  inputRef,
  onPicked,
  autoFocus = false,
}: SearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);
  // Typed into before this code came: carry on, results open.
  const [open, setOpen] = useState(autoFocus && initialQuery.trim() !== "");
  const [wanted, setWanted] = useState(initialQuery !== "");
  const phone = useIsMobile();
  const navigate = useNavigate();
  const { groups, status, lists } = useHits(query, wanted);
  const typed = query.trim();
  const inline = variant === "sheet";
  const anchor = useRef<HTMLDivElement>(null);

  const own = useRef<HTMLInputElement | null>(null);
  // The stand-in box had focus: this one takes it over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on mount only
  useEffect(() => {
    if (autoFocus) own.current?.focus();
  }, []);

  // Enter goes to the highlighted result. Typed faster than the lists
  // loaded, nothing is highlighted yet: then it's the first one.
  const highlighted = useRef<Hit | null>(null);
  const go = (hit: Hit) => {
    setOpen(false);
    onPicked?.();
    void navigate(hitLink(hit));
  };
  /** A pick: the router's move, unless a modifier asks the browser for a tab. */
  const pick = (hit: Hit) => (event: MouseEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    go(hit);
  };

  const list = (
    <>
      {status === "error" ? (
        <div className="p-2">
          <InlineError
            message="Couldn't load the search. Check your connection."
            onRetry={lists.retry}
          />
        </div>
      ) : status === "loading" ? (
        <RowSkeleton rows={3} inset={false} label="Loading the search" />
      ) : (
        <Autocomplete.Empty>
          <p className="px-2 py-3 text-muted">
            No instructor or course matches “{typed}”.
          </p>
        </Autocomplete.Empty>
      )}
      <Autocomplete.List className="outline-none data-empty:hidden">
        {(group: HitGroup) => (
          <Autocomplete.Group
            key={group.value}
            items={group.items}
            className="not-first:mt-1 not-first:border-hairline not-first:border-t not-first:pt-1"
          >
            {group.value === "More" || group.value === "Department" ? null : (
              <Autocomplete.GroupLabel className="px-2 pt-1.5 pb-1 font-medium text-muted text-xs">
                {group.value}
              </Autocomplete.GroupLabel>
            )}
            <Autocomplete.Collection>
              {(hit: Hit) => (
                <Autocomplete.Item
                  key={hitKey(hit)}
                  value={hit}
                  onClick={pick(hit)}
                  render={<Link {...hitLink(hit)} />}
                  className={cn(
                    "flex min-h-9 w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none data-highlighted:bg-hover max-md:min-h-11",
                    variant === "page" ? "text-lg" : "text-base",
                  )}
                >
                  <HitRow hit={hit} />
                </Autocomplete.Item>
              )}
            </Autocomplete.Collection>
          </Autocomplete.Group>
        )}
      </Autocomplete.List>
    </>
  );

  const field = (
    <Autocomplete.Input
      ref={(el: HTMLInputElement | null) => {
        own.current = el;
        if (typeof inputRef === "function") inputRef(el);
        else if (inputRef) inputRef.current = el;
      }}
      aria-label={SEARCH_LABEL}
      placeholder={placeholder ?? searchPlaceholder(variant, phone)}
      onFocus={() => setWanted(true)}
      onKeyDown={(event) => {
        const first = groups[0]?.items[0];
        if (
          event.key === "Enter" &&
          !event.nativeEvent.isComposing &&
          highlighted.current === null &&
          first
        ) {
          event.preventDefault();
          go(first);
        }
      }}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      render={(props) => (
        <SearchField
          {...props}
          onClear={() => {
            setQuery("");
          }}
          className={cn(variant === "page" && "h-12 pl-4 text-lg md:h-12")}
        />
      )}
    />
  );

  return (
    <Autocomplete.Root
      items={groups}
      filter={null}
      itemToStringValue={hitLabel}
      value={query}
      onValueChange={(next, details) => {
        // A pick moves on; the box keeps what was typed.
        if (details.reason === "item-press") return;
        setQuery(next);
      }}
      open={inline ? true : open && typed !== ""}
      onOpenChange={setOpen}
      inline={inline}
      autoHighlight
      onItemHighlighted={(hit) => {
        highlighted.current = hit ?? null;
      }}
      // A modal-free popup: the page stays scrollable and pressable.
      modal={false}
    >
      {/* The whole box, not just its text, is what the results line up with. */}
      <div ref={anchor} className={variant === "bar" ? "w-72 max-w-full" : ""}>
        {variant === "page" ? (
          <WithTooltip label="Search by an instructor's name, or a course's code, title or department">
            {field}
          </WithTooltip>
        ) : variant === "bar" ? (
          <WithTooltip label="Search instructors and courses" side="bottom">
            {field}
          </WithTooltip>
        ) : (
          field
        )}
      </div>
      {inline ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-2">
          {typed === "" ? (
            <p className="px-2 py-3 text-muted">
              An instructor's name, or a course's code, title or department.
            </p>
          ) : (
            list
          )}
        </div>
      ) : (
        <Autocomplete.Portal>
          <Autocomplete.Positioner
            anchor={anchor}
            sideOffset={6}
            align="start"
            collisionPadding={8}
            {...POSITIONER}
            className={POPUP_LAYER}
          >
            <Autocomplete.Popup
              data-slot="reviews-search-results"
              className={cn(
                POPUP_CARD,
                POPUP_MOTION,
                "max-h-[min(30rem,var(--available-height))] w-(--anchor-width) max-w-(--available-width) overflow-y-auto overscroll-contain p-1",
                variant === "bar" && "min-w-[26rem]",
              )}
            >
              {list}
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      )}
    </Autocomplete.Root>
  );
}

/** One result: a name with its departments, or a code with its title. */
function HitRow({ hit }: { hit: Hit }) {
  if (hit.kind === "instructor")
    return (
      <>
        <span className="min-w-0 flex-1 truncate font-medium">{hit.name}</span>
        {hit.depts.length > 0 ? (
          <span className="ident shrink-0 text-muted text-sm">
            {hit.depts.slice(0, 3).join(" · ")}
          </span>
        ) : null}
      </>
    );
  if (hit.kind === "course")
    return (
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="ident shrink-0 font-medium">{hit.code}</span>
        <span className="truncate text-base text-muted">{hit.title}</span>
      </span>
    );
  return (
    <>
      <span className="min-w-0 flex-1 truncate font-medium">{hit.label}</span>
      <ArrowRight size={14} aria-hidden="true" className="text-muted" />
    </>
  );
}
