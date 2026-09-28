import { cn } from "cn";
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useRef,
  useState,
} from "react";
import { isFiltering, type SearchFilters } from "~/core/search/filters";
import {
  type FilterToken,
  filterTokenName,
  hasFilterToken,
  takeFilterToken,
  withFilterToken,
  withoutFilterToken,
  withoutLastChip,
} from "~/core/search/tokens";
import type { WildcardSearchInfo } from "~/core/search/wildcards";
import { SearchField } from "./input";
import { Kbd } from "./kbd";
import { ListRow } from "./list-row";
import { WithTooltip } from "./tooltip";

// One course search box and one result row for every product (owner,
// 2026-09-28: "familiarity carries over"): Schedule's Search, Plan's Search
// and Generate's course field. The words people type mean the same
// everywhere (~/core/search/tokens), and so do the keys:
//
//   ↓ ↑     move through the results (they stop at the ends)
//   Enter   a filter token at the end becomes its chip; otherwise it acts on
//           the highlighted result, or the top one
//   Space   after a filter token ("DSNS "), it becomes its chip
//   ⌫       in an empty box, takes the last chip off (the newest typed one
//           first)
//   Esc     clears the box; in an empty one, it's the page's (leave, go back)

export type FilterTokenSupport = {
  /** The departments and GenEd codes the product knows. */
  readonly info: WildcardSearchInfo;
  readonly filters: SearchFilters;
  /** A typed token turned a chip on or off: which kind, when it knows. */
  readonly onFiltersChange: (
    next: SearchFilters,
    kind: FilterToken["kind"] | null,
  ) => void;
};

/** How the box explains itself, in its tooltip. */
export const COURSE_SEARCH_TIP = {
  withInstructors:
    "Search by course code, title or instructor. CMSC4XX lists a level; a GenEd like DSNS, 400s or 3cr becomes a filter",
  withoutInstructors:
    "Search by course code or title. CMSC4XX lists a level; a GenEd like DSNS, 400s or 3cr becomes a filter",
} as const;

export function CourseSearchField({
  query,
  onQueryChange,
  tokens,
  count,
  active,
  onActiveChange,
  onPick,
  label = "Search courses",
  placeholder,
  tooltip,
  shortcut,
  combobox,
  inputRef,
  className,
  ...rest
}: Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "onKeyDown" | "ref" | "role"
> & {
  query: string;
  onQueryChange: (next: string) => void;
  /** Filter tokens become chips (a product with filter chips). */
  tokens?: FilterTokenSupport;
  /** How many results there are to move through. */
  count: number;
  /** The highlighted result; -1 for none. */
  active: number;
  onActiveChange: (index: number) => void;
  /** Enter on a result: the highlighted one, or the top one. */
  onPick: (index: number) => void;
  label?: string;
  placeholder: string;
  tooltip: string;
  /** The page's key for the box (`/`), shown in its tooltip and inside it. */
  shortcut?: { key: string; label: string };
  /**
   * The results are a listbox of options: the box is its combobox. Rows
   * with their own buttons (Plan's Add) can't be options, so their box says
   * which row is highlighted aloud instead.
   */
  combobox?: { listId: string; optionId: (index: number) => string };
  inputRef?: Ref<HTMLInputElement>;
}) {
  const own = useRef<HTMLInputElement | null>(null);
  const typed = useRef<FilterToken[]>([]);
  const [said, setSaid] = useState("");

  const applyToken = (token: FilterToken) => {
    if (!tokens) return;
    typed.current = [...typed.current, token];
    tokens.onFiltersChange(withFilterToken(tokens.filters, token), token.kind);
    setSaid(`${filterTokenName(token)} filter on`);
  };

  /** Takes a token off the end of `text`; true when it did. */
  const take = (text: string): boolean => {
    if (!tokens) return false;
    const found = takeFilterToken(text, tokens.info);
    if (!found) return false;
    onQueryChange(found.text);
    applyToken(found.token);
    return true;
  };

  /** Backspace in an empty box: the newest typed chip, else the line's last. */
  const dropChip = () => {
    if (!tokens || !isFiltering(tokens.filters)) return false;
    let stack = typed.current;
    while (stack.length > 0) {
      const last = stack[stack.length - 1];
      stack = stack.slice(0, -1);
      if (last && hasFilterToken(tokens.filters, last)) {
        typed.current = stack;
        tokens.onFiltersChange(
          withoutFilterToken(tokens.filters, last),
          last.kind,
        );
        setSaid(`${filterTokenName(last)} filter off`);
        return true;
      }
    }
    typed.current = [];
    tokens.onFiltersChange(withoutLastChip(tokens.filters), null);
    setSaid("Filter off");
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (count === 0) return;
        event.preventDefault();
        onActiveChange(
          event.key === "ArrowDown"
            ? Math.min(count - 1, active + 1)
            : Math.max(0, active - 1),
        );
        return;
      }
      case "Enter": {
        if (take(query)) {
          event.preventDefault();
          return;
        }
        if (count === 0) return;
        event.preventDefault();
        onPick(active >= 0 && active < count ? active : 0);
        return;
      }
      case "Escape": {
        if (query === "") return;
        // Clear the box first; the next Esc is the page's.
        event.preventDefault();
        event.stopPropagation();
        onQueryChange("");
        return;
      }
      case "Backspace": {
        if (query !== "" || event.currentTarget.selectionStart !== 0) return;
        if (dropChip()) event.preventDefault();
        return;
      }
    }
  };

  const field = (
    <SearchField
      {...rest}
      ref={(el: HTMLInputElement | null) => {
        own.current = el;
        if (typeof inputRef === "function") inputRef(el);
        else if (inputRef) inputRef.current = el;
      }}
      role={combobox ? "combobox" : undefined}
      aria-expanded={combobox ? count > 0 : undefined}
      aria-controls={combobox?.listId}
      aria-autocomplete={combobox ? "list" : undefined}
      aria-activedescendant={
        combobox && active >= 0 && active < count
          ? combobox.optionId(active)
          : undefined
      }
      aria-label={label}
      placeholder={placeholder}
      // Course codes aren't words: no red squiggles or autocorrect.
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      value={query}
      onChange={(e) => {
        const next = e.target.value;
        // Space after a token: it becomes its chip.
        if (/\s$/.test(next) && take(next)) return;
        onQueryChange(next);
      }}
      onKeyDown={onKeyDown}
      onClear={() => {
        onQueryChange("");
        own.current?.focus();
      }}
      className={className}
      hint={
        shortcut ? (
          <WithTooltip label={shortcut.label} shortcut={shortcut.key}>
            <span>
              <Kbd>{shortcut.key}</Kbd>
            </span>
          </WithTooltip>
        ) : undefined
      }
    />
  );
  return (
    <>
      {/* Above the field, so it never covers the filters or results. */}
      <WithTooltip label={tooltip} shortcut={shortcut?.key} side="top">
        {field}
      </WithTooltip>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>
    </>
  );
}

/** "3 cr", "1–4 cr". */
export function creditsLabel(min: number, max: number): string {
  return min === max ? `${min} cr` : `${min}–${max} cr`;
}

/**
 * One course in any product's results: the code, credits and GenEds, then
 * the title, then what that product knows about it (`meta`: sections and
 * fit in Schedule). `compact` is one line, for a suggestion list. The rest
 * of the props go to the kit's `ListRow`.
 */
export function CourseResultRow({
  code,
  title,
  credits,
  genEds,
  note,
  meta,
  density = "regular",
  children,
  className,
  ...rest
}: Omit<ComponentProps<typeof ListRow>, "children" | "density"> & {
  code: string;
  title: string;
  credits?: { readonly min: number; readonly max: number };
  genEds?: readonly string[];
  /** Right of the code line: "In Fall 2026". */
  note?: ReactNode;
  /** The third line, muted. */
  meta?: ReactNode;
  density?: "regular" | "compact";
  /** Replaces the lines: a row that wraps them in its own button. */
  children?: (lines: ReactNode) => ReactNode;
}) {
  const lines =
    density === "compact" ? (
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="ident shrink-0 font-semibold text-sm">{code}</span>
        <span className="truncate text-muted text-sm">{title}</span>
        {meta ? (
          <span className="ml-auto shrink-0 text-muted text-xs">{meta}</span>
        ) : null}
      </span>
    ) : (
      <>
        <span className="flex items-baseline gap-2">
          <span className="ident font-semibold text-base">{code}</span>
          {credits ? (
            <span className="tnum text-muted text-sm">
              {creditsLabel(credits.min, credits.max)}
            </span>
          ) : null}
          {genEds?.slice(0, 3).map((g) => (
            <span
              key={g}
              className="ident rounded border border-hairline px-1 text-2xs text-muted"
            >
              {g}
            </span>
          ))}
          {note ? (
            <span className="ml-auto min-w-0 truncate text-muted text-xs">
              {note}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-base">{title}</span>
        {meta ? (
          <span className="tnum mt-0.5 block truncate text-muted text-sm">
            {meta}
          </span>
        ) : null}
      </>
    );
  return (
    <ListRow
      {...rest}
      density={density}
      className={cn(density === "compact" && "px-2", className)}
    >
      {children ? children(lines) : lines}
    </ListRow>
  );
}
