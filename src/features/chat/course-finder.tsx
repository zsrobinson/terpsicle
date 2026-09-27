import { ChevronRight, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { matchCourses } from "~/core/reviews/find";
import { type CourseCode, courseRoomId } from "~/core/schema";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { useChatHome } from "./chat-home";
import type { ChatGo } from "./nav";

// Finding any course's chat from the chat list (V2.md §8.2: course rooms
// are open to anyone signed in), for someone with no classes in a synced
// plan yet. It searches the course index's search file, the same rows and
// matching as Reviews' course search, and opens the course's room with its
// room tree beside it, where Join keeps it in the list.

/** As many as fit under the box without scrolling past the scheduler link. */
const SHOWN = 8;

export function CourseFinder({ go }: { go: ChatGo }) {
  const termId = useChatHome((s) => s.termId);
  const termName = useChatHome(
    (s) => s.terms.find((t) => t.id === s.termId)?.name ?? "this term",
  );
  const rows = useChatHome((s) => s.courseRows);
  const rowsState = useChatHome((s) => s.courseRowsState);
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<CourseCode | null>(null);
  const [notOffered, setNotOffered] = useState<CourseCode | null>(null);
  const id = useId();
  const typed = query.trim();
  const results = useMemo(
    () => (rows ? matchCourses(rows, typed).slice(0, SHOWN) : []),
    [rows, typed],
  );

  // Loaded on first use, so /chat's first load doesn't carry every course.
  const wake = () => void useChatHome.getState().ensureCourseRows();

  const open = async (code: CourseCode) => {
    if (!termId || opening) return;
    setOpening(code);
    setNotOffered(null);
    // The index lists every term's courses; rooms exist only for this one's.
    const course = await useChatHome.getState().ensureCourse(code);
    setOpening(null);
    if (!course) {
      setNotOffered(code);
      return;
    }
    go({ course: code, room: courseRoomId(termId, code) });
  };

  return (
    <form
      aria-label="Find a course's chat"
      onSubmit={(e) => {
        e.preventDefault();
        const first = results[0];
        if (first) void open(first[0]);
      }}
    >
      <label htmlFor={`${id}-input`} className="sr-only">
        Find a course's chat
      </label>
      <div className="mx-4 flex h-8 items-center gap-2 border border-hairline-strong bg-raised px-2.5 focus-within:border-fg max-md:h-11">
        <Search size={14} aria-hidden="true" className="text-faint" />
        <WithTooltip label="Search by course code or title">
          <input
            id={`${id}-input`}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setNotOffered(null);
              wake();
            }}
            onFocus={wake}
            placeholder="CMSC131, algorithms, ENGL…"
            autoComplete="off"
            spellCheck={false}
            aria-controls={`${id}-results`}
            className="h-full min-w-0 flex-1 bg-transparent text-base placeholder:text-faint focus:outline-none"
          />
        </WithTooltip>
      </div>
      <div id={`${id}-results`} role="status" className="empty:hidden">
        {typed === "" ? null : rowsState === "error" ? (
          <div className="flex items-center gap-2 px-4 pt-2 text-muted text-sm">
            <span className="min-w-0 flex-1">
              We couldn't load the course list. Check your connection and try
              again.
            </span>
            <WithTooltip label="Load the course list again">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-md:h-11"
                onClick={wake}
              >
                Try again
              </Button>
            </WithTooltip>
          </div>
        ) : !rows ? (
          <p className="px-4 pt-2 text-muted text-sm">Loading courses…</p>
        ) : results.length === 0 ? (
          <p className="px-4 pt-2 text-muted text-sm">
            No course matches “{typed}”.
          </p>
        ) : null}
      </div>
      {typed !== "" && results.length > 0 ? (
        <ul aria-label="Courses" className="mt-2">
          {results.map(([code, title], i) => (
            <li key={code}>
              <WithTooltip
                label={`Open ${code}'s course room`}
                shortcut={i === 0 ? "↵" : undefined}
              >
                <button
                  type="button"
                  disabled={opening !== null}
                  onClick={() => void open(code)}
                  className="flex h-9 w-full items-center gap-2 px-4 text-left text-sm transition-colors hover:bg-hover disabled:opacity-60 max-md:h-11"
                >
                  <span className="ident font-semibold">{code}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {title}
                  </span>
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className="text-muted"
                  />
                </button>
              </WithTooltip>
            </li>
          ))}
        </ul>
      ) : null}
      {notOffered ? (
        <p role="status" className="px-4 pt-2 text-muted text-sm">
          {notOffered} isn't offered in {termName}, so it has no chat this term.
        </p>
      ) : null}
    </form>
  );
}
