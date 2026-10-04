import { cn } from "cn";
import { Info } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { create } from "zustand";
import type { CourseCode, CourseColor, IsoDate } from "~/core/schema";
import {
  listRange,
  minutesFromTimeField,
  newYorkClock,
  parseQuickAdd,
  type QuickAddChoice,
  type QuickAddKind,
  quickAddFields,
  timeFieldFromMinutes,
} from "~/core/todo";
import { dotStyle } from "~/features/calendar/tint";
import { track } from "~/lib/analytics";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { WithTooltip } from "~/ui/tooltip";
import { newTaskUid, saveFailedNote } from "./task-form";
import { useSaveTask } from "./use-todo";

// The composer (docs/V3.md §3.10): type a task the way you'd say it, "PS3
// due fri 11:59pm cmsc351", and the date, time and course it recognizes are
// marked in the text as you type and filled into the pickers under it,
// which set any of the three by hand too (clearing one takes it off). The
// title is plain text, `data-private`, and never reaches analytics.

/** What the field understands, in one example: its info icon's tooltip. */
const HINT =
  "Type the course, date and time the way you'd say them, like “PS3 due fri 11:59pm cmsc351”. They fill in the boxes below.";

/** The composer's field: the Q shortcut and "start a task on this day" land here. */
export const COMPOSER_ID = "todo-composer";

/** The Select's value for "No course" (Radix needs a non-empty one). */
const NO_COURSE = "none";

/** What the calendar asks of the composer: a task on a day, now. */
interface ComposerRequest {
  /** A day clicked on the calendar. */
  date: IsoDate | null;
  /** Changes with every request, so the same day twice still asks. */
  seq: number;
  /**
   * The last request a composer took. On a phone the composer is in a sheet
   * that opens for the request, so one that arrives before its composer
   * does waits for it; a desktop's is always there and takes it at once.
   */
  taken: number;
}

export const useComposerRequest = create<ComposerRequest>()(() => ({
  date: null,
  seq: 0,
  taken: 0,
}));

/**
 * Starts a task: on `date` (an empty day clicked on the calendar), or on
 * no day in particular. The composer takes the date and focus.
 */
export function startTask(date: IsoDate | null = null): void {
  useComposerRequest.setState((s) => ({ date, seq: s.seq + 1 }));
}

/** The text in runs, with the recognized parts marked, for the layer behind the field. */
function Highlights({
  text,
  parts,
}: {
  text: string;
  parts: readonly { start: number; end: number }[];
}) {
  const runs: ReactNode[] = [];
  let at = 0;
  for (const part of parts) {
    if (part.start > at) runs.push(text.slice(at, part.start));
    runs.push(
      <mark
        key={part.start}
        className="bg-product-todo-soft text-transparent shadow-[inset_0_-2px_0_var(--product-todo-line)]"
      >
        {text.slice(part.start, part.end)}
      </mark>,
    );
    at = part.end;
  }
  runs.push(text.slice(at));
  return <>{runs}</>;
}

export function Composer({
  courses,
  colors,
  compact = false,
  onAdded,
  className,
}: {
  /** The courses a task can be for: the person's plans' and ELMS's. */
  courses: readonly CourseCode[];
  colors: Readonly<Record<CourseCode, CourseColor>>;
  /**
   * The field and its hint alone until it's in use, so the sidebar's week
   * shows under it; the chips and pickers open then.
   */
  compact?: boolean;
  /** After a task is added. */
  onAdded?: () => void;
  className?: string;
}) {
  const saveTask = useSaveTask();
  const [text, setText] = useState("");
  const [ignore, setIgnore] = useState<ReadonlySet<QuickAddKind>>(new Set());
  const [choice, setChoice] = useState<QuickAddChoice>({});
  const field = useRef<HTMLInputElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const dateId = useId();
  const timeId = useId();
  const courseId = useId();
  const hintId = useId();
  // Read as it's typed: "today" and "5pm" are New York's right now.
  const now = Date.now();
  const today = newYorkClock(now).date;
  const parse = parseQuickAdd(text, { now, courses, ignore });
  const fields = quickAddFields(text, parse, choice);
  const date = choice.date !== undefined ? choice.date : parse.date;
  const time =
    date === null ? null : choice.time !== undefined ? choice.time : parse.time;
  const course = choice.course !== undefined ? choice.course : parse.course;
  const range = listRange(today);
  const [focused, setFocused] = useState(false);
  const open =
    !compact ||
    focused ||
    text !== "" ||
    Object.values(choice).some((v) => v !== undefined && v !== null);

  const reset = () => {
    setText("");
    setIgnore(new Set());
    setChoice({});
  };

  // The calendar's "add on this day", and Q: each request once, by the
  // composer on screen, including one made just before it opened.
  const request = useComposerRequest();
  useEffect(() => {
    if (request.seq === request.taken) return;
    useComposerRequest.setState({ taken: request.seq });
    if (request.date !== null) {
      setIgnore((s) => new Set([...s, "date"]));
      setChoice((c) => ({ ...c, date: request.date }));
    }
    field.current?.scrollIntoView({ block: "nearest" });
    field.current?.focus({ preventScroll: true });
  }, [request]);

  /** A picker sets it: the text's words for it stay in the title. */
  const pick = (kind: QuickAddKind, patch: QuickAddChoice) => {
    setIgnore((s) => new Set([...s, kind]));
    setChoice((c) => ({ ...c, ...patch }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!fields) return;
    track("todo_task_added", {
      date: fields.dueDate !== null,
      time: fields.dueTime !== null,
      course: fields.courseCode !== null,
      typed: parse.parts.length > 0,
    });
    const uid = newTaskUid();
    const save = () =>
      void saveTask(uid, fields).then((status) => {
        if (status !== "saved") saveFailedNote(status, save);
      });
    save();
    reset();
    if (onAdded) onAdded();
    else field.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || text === "") return;
    event.stopPropagation();
    reset();
  };

  // The layer behind the field scrolls with it.
  // It takes the field's type as drawn (16px on phones, styles.css), so the
  // marks sit under the words at every size.
  const follow = () => {
    const [under, over] = [layer.current, field.current];
    if (!under || !over) return;
    const type = getComputedStyle(over);
    for (const key of [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontFeatureSettings",
      "fontVariationSettings",
      "letterSpacing",
      "wordSpacing",
      "paddingLeft",
    ] as const)
      under.style[key] = type[key];
    under.scrollLeft = over.scrollLeft;
  };
  useEffect(follow);

  const offered = [
    ...new Set([...courses, ...(course ? [course] : [])]),
  ].sort();
  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        const to = event.relatedTarget;
        // The course's list opens in a layer of its own: still in use.
        if (
          to instanceof Element &&
          (event.currentTarget.contains(to) ||
            to.closest("[data-radix-popper-content-wrapper]"))
        )
          return;
        setFocused(false);
      }}
      aria-label="Add a task"
      className={cn("flex flex-col gap-2", className)}
    >
      <label htmlFor={COMPOSER_ID} className="sr-only">
        New task
      </label>
      <div className="relative bg-raised">
        <WithTooltip
          label="Type a task with its date, time and course, then press Enter"
          shortcut="Q"
          side="top"
        >
          <div className="relative">
            <div
              ref={layer}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre border border-transparent px-2.5 text-base text-transparent"
            >
              {/* One run of text, so its kerning and spaces are the field's. */}
              <span>
                <Highlights text={text} parts={parse.parts} />
              </span>
            </div>
            <Input
              ref={field}
              id={COMPOSER_ID}
              data-private=""
              autoComplete="off"
              spellCheck={false}
              maxLength={300}
              aria-describedby={hintId}
              placeholder="Add a task…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onScroll={follow}
              onSelect={follow}
              className="ph-no-capture relative bg-transparent pr-8"
            />
          </div>
        </WithTooltip>
        {/* What the words can say, at the field's end. The recognized
            words stay marked in the field and fill the pickers below. */}
        <WithTooltip label={HINT} side="top">
          <button
            type="button"
            tabIndex={-1}
            aria-label="What you can type"
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-faint transition-colors hover:text-muted"
          >
            <Info size={14} aria-hidden="true" />
          </button>
        </WithTooltip>
      </div>
      <p id={hintId} className="sr-only">
        {HINT}
      </p>
      <div hidden={!open} className="grid grid-cols-[1fr_auto] gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={dateId} className="emph-label text-sm">
            Due date
          </label>
          <WithTooltip label="When it's due. Leave it empty for no date.">
            <Input
              id={dateId}
              type="date"
              min={range.from}
              max={range.to}
              value={date ?? ""}
              onChange={(e) => pick("date", { date: e.target.value || null })}
            />
          </WithTooltip>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={timeId} className="emph-label text-sm">
            Time
          </label>
          <WithTooltip
            label={
              date === null
                ? "Pick a date first"
                : "The time it's due. Leave it empty for all day."
            }
          >
            <Input
              id={timeId}
              type="time"
              disabled={date === null}
              value={timeFieldFromMinutes(time)}
              onChange={(e) =>
                pick("time", { time: minutesFromTimeField(e.target.value) })
              }
              className="w-32"
            />
          </WithTooltip>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={courseId} className="emph-label text-sm">
            Course
          </label>
          <Select
            value={course ?? NO_COURSE}
            onValueChange={(value) =>
              pick("course", { course: value === NO_COURSE ? null : value })
            }
          >
            <WithTooltip label="The course it's for, if any">
              <SelectTrigger id={courseId} className="w-full">
                <SelectValue />
              </SelectTrigger>
            </WithTooltip>
            <SelectContent>
              <SelectItem value={NO_COURSE}>No course</SelectItem>
              {offered.map((code) => (
                <SelectItem key={code} value={code}>
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 bg-muted"
                    style={colors[code] ? dotStyle(colors[code]) : undefined}
                  />
                  <span className="ident">{code}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col justify-end">
          <WithTooltip label="Add it to your calendar" shortcut="Enter">
            <Button type="submit" disabled={!fields} className="w-32">
              Add task
            </Button>
          </WithTooltip>
        </div>
      </div>
    </form>
  );
}
