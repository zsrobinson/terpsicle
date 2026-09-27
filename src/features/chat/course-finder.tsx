import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PanelNote } from "~/app/panel";
import { matchCourses } from "~/core/reviews/find";
import { type CourseCode, courseRoomId } from "~/core/schema";
import { InlineError } from "~/ui/inline-error";
import { SearchField } from "~/ui/input";
import { ListRow } from "~/ui/list-row";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { useChatHome } from "./chat-home";
import type { ChatGo } from "./nav";
import { ROW_LINK } from "./room-row";

// Finding any course's chat from the chat list (V2.md §8.2: course rooms
// are open to anyone signed in), for someone with no classes in a synced
// plan yet. It searches the course index's search file, the same rows and
// matching as Reviews' course search, and opens the course's room with its
// room tree beside it, where Join keeps it in the list.

/** As many as fit under the box without scrolling past the scheduler link. */
const SHOWN = 8;

export function CourseFinder({
  go,
  focus = 0,
}: {
  go: ChatGo;
  /** Focuses the box each time it goes up ("Find a course"). */
  focus?: number;
}) {
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
  const box = useRef<HTMLInputElement>(null);
  const typed = query.trim();
  const results = useMemo(
    () => (rows ? matchCourses(rows, typed).slice(0, SHOWN) : []),
    [rows, typed],
  );

  useEffect(() => {
    if (focus > 0) box.current?.focus();
  }, [focus]);

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
      className="flex flex-col gap-2 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        const first = results[0];
        if (first) void open(first[0]);
      }}
    >
      <div className="px-4">
        <WithTooltip label="Search by course code or title">
          <SearchField
            ref={box}
            aria-label="Find a course's chat"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setNotOffered(null);
              wake();
            }}
            onClear={() => {
              setQuery("");
              setNotOffered(null);
              box.current?.focus();
            }}
            onFocus={wake}
            placeholder="CMSC131, algorithms, ENGL…"
            autoComplete="off"
            spellCheck={false}
            aria-controls={`${id}-results`}
          />
        </WithTooltip>
      </div>
      {/* Each state below announces itself (a status). */}
      <div id={`${id}-results`} className="empty:hidden">
        {typed === "" ? null : rowsState === "error" ? (
          <InlineError
            className="px-4 py-0"
            message="We couldn't load the course list. Check your connection and try again."
            onRetry={wake}
            retryTooltip="Load the course list again"
          />
        ) : !rows ? (
          <RowSkeleton rows={2} label="Loading courses" />
        ) : results.length === 0 ? (
          <PanelNote className="py-0">
            <span role="status">No course matches “{typed}”.</span>
          </PanelNote>
        ) : null}
      </div>
      {typed !== "" && results.length > 0 ? (
        <ul aria-label="Courses" className="border-hairline border-y">
          {results.map(([code, title], i) => (
            <ListRow
              key={code}
              as="li"
              density="compact"
              trail={
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className="text-muted"
                />
              }
              className={cn(
                "relative hover:bg-hover max-md:min-h-11",
                opening !== null && "opacity-60",
              )}
            >
              <WithTooltip
                label={`Open ${code}'s course room`}
                shortcut={i === 0 ? "↵" : undefined}
              >
                <button
                  type="button"
                  disabled={opening !== null}
                  onClick={() => void open(code)}
                  className={cn(
                    ROW_LINK,
                    "block w-full truncate text-left text-sm",
                  )}
                >
                  <span className="ident font-semibold">{code}</span>
                  <span className="ml-2 text-muted">{title}</span>
                </button>
              </WithTooltip>
            </ListRow>
          ))}
        </ul>
      ) : null}
      {notOffered ? (
        <PanelNote className="py-0">
          <span role="status">
            {notOffered} isn't offered in {termName}, so it has no chat this
            term.
          </span>
        </PanelNote>
      ) : null}
    </form>
  );
}
