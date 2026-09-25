import { cn } from "cn";
import { type Ref, useId, useMemo, useState } from "react";
import type { CatalogIndex } from "~/core/catalog";
import type { CourseCode } from "~/core/schema";
import {
  type CourseSearch,
  createCourseSearch,
  searchCourses,
} from "~/core/search";
import { WithTooltip } from "~/ui/tooltip";

// Type a code or title words, pick from the suggestions. The search index is
// built once per catalog, the first time someone types here.

const searches = new WeakMap<CatalogIndex, CourseSearch>();
function searchFor(index: CatalogIndex): CourseSearch {
  let search = searches.get(index);
  if (!search) {
    search = createCourseSearch(index.courses.values());
    searches.set(index, search);
  }
  return search;
}

const MAX_SUGGESTIONS = 6;

export function CourseField({
  index,
  exclude,
  onAdd,
  placeholder,
  label,
  inputRef,
}: {
  index: CatalogIndex | undefined;
  /** Courses already listed; not suggested again. */
  exclude: ReadonlySet<CourseCode>;
  onAdd: (courseCode: CourseCode) => void;
  placeholder: string;
  label: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();

  const suggestions = useMemo(() => {
    if (!index || query.trim() === "") return [];
    return searchCourses(searchFor(index), query)
      .filter((code) => !exclude.has(code))
      .slice(0, MAX_SUGGESTIONS)
      .flatMap((code) => {
        const course = index.courses.get(code);
        return course ? [course] : [];
      });
  }, [index, query, exclude]);

  const add = (code: CourseCode) => {
    onAdd(code);
    setQuery("");
    setActive(0);
  };
  const showList = open && suggestions.length > 0;

  return (
    <div className="relative">
      <WithTooltip label="Type a course code or words from its title">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && suggestions.length > 0) {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a + 1) % suggestions.length);
            } else if (e.key === "ArrowUp" && suggestions.length > 0) {
              e.preventDefault();
              setActive(
                (a) => (a - 1 + suggestions.length) % suggestions.length,
              );
            } else if (e.key === "Enter") {
              const pick = suggestions[active] ?? suggestions[0];
              if (pick) {
                e.preventDefault();
                add(pick.code);
              }
            } else if (e.key === "Escape" && query !== "") {
              // Clear the field first; a second Esc leaves it.
              e.preventDefault();
              e.stopPropagation();
              setQuery("");
            }
          }}
          className="h-7 w-full rounded-md border border-hairline-strong bg-bg px-2 text-[12.5px] outline-none placeholder:text-faint focus:border-fg/40"
        />
      </WithTooltip>
      {showList ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Suggested courses"
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-hairline bg-raised py-1 shadow-pop"
        >
          {suggestions.map((course, i) => (
            <div
              key={course.code}
              id={`${listId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => add(course.code)}
              onKeyDown={() => {}}
              className={cn(
                "flex cursor-default items-baseline gap-2 px-2 py-1 text-[12px]",
                i === active && "bg-hover",
              )}
            >
              <span className="font-mono font-semibold text-[11.5px]">
                {course.code}
              </span>
              <span className="truncate text-muted">{course.title}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
