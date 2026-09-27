import { cn } from "cn";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useState,
} from "react";
import { track } from "~/app/analytics";
import type { CourseCode, IsoDate } from "~/core/schema";
import {
  listRange,
  minutesFromTimeField,
  type TaskFields,
  timeFieldFromMinutes,
} from "~/core/todo";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { useTodo } from "./todo-store";

// Your own tasks (docs/V3.md §3.10): "Add a task…" at the top of the list,
// and the same fields for changing one in place. The title is plain text,
// `data-private` like every title, and never reaches analytics.

/** The Select's value for "No course" (Radix needs a non-empty one). */
const NO_COURSE = "none";

/** One toast for tasks: a new change's Undo replaces the last one's. */
export const TASK_TOAST_ID = "todo-task";

const EMPTY: TaskFields = {
  title: "",
  courseCode: null,
  dueDate: null,
  dueTime: null,
};

/** A new task's uid: the app makes it, so Undo can put a deleted task back as itself. */
export function newTaskUid(): string {
  return `own-${crypto.randomUUID()}`;
}

/** Why a save didn't go through, said once, in a note. */
export function saveFailedNote(
  status: "too-many" | "out-of-range" | "failed",
  retry: () => void,
): void {
  if (status === "too-many")
    noteToast("You have 500 tasks, the most Todo keeps", {
      id: TASK_TOAST_ID,
      description: "Delete some you've finished, then add this one.",
    });
  else if (status === "out-of-range")
    noteToast("Todo keeps dates from a month back to a year ahead", {
      id: TASK_TOAST_ID,
      description: "Pick a date in that range, or leave it empty.",
    });
  else
    noteToast("That task didn't save", {
      id: TASK_TOAST_ID,
      description: "Check your connection and try again.",
      retry,
    });
}

/** A field with its name over it on a phone; on a desktop, its tooltip names it. */
function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="font-medium text-muted text-xs md:sr-only">
        {label}
      </label>
      {children}
    </div>
  );
}

function TaskForm({
  initial = EMPTY,
  courses,
  today,
  submitLabel,
  submitHint,
  titleLabel,
  alwaysOpen,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  initial?: TaskFields;
  /** The courses to offer: on the feed and in your plans. */
  courses: readonly CourseCode[];
  today: IsoDate;
  submitLabel: string;
  submitHint: string;
  titleLabel: string;
  /** The date, time and course show before anything's typed. */
  alwaysOpen: boolean;
  autoFocus?: boolean;
  /** Resolves true when the fields should empty (a task was added). */
  onSubmit: (fields: TaskFields) => Promise<boolean> | boolean;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [dueTime, setDueTime] = useState(timeFieldFromMinutes(initial.dueTime));
  const [course, setCourse] = useState(initial.courseCode ?? NO_COURSE);
  const titleId = useId();
  const dateId = useId();
  const timeId = useId();
  const courseId = useId();
  const open =
    alwaysOpen || title !== "" || dueDate !== "" || course !== NO_COURSE;
  // A course picked earlier stays offered, even once it's off the feed.
  const offered = [...new Set([...courses, initial.courseCode ?? NO_COURSE])]
    .filter((c) => c !== NO_COURSE)
    .sort();
  const range = listRange(today);

  const reset = () => {
    setTitle("");
    setDueDate("");
    setDueTime("");
    setCourse(NO_COURSE);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim() === "") return;
    const date = dueDate === "" ? null : dueDate;
    const fields: TaskFields = {
      title: title.trim(),
      courseCode: course === NO_COURSE ? null : course,
      dueDate: date,
      dueTime: date === null ? null : minutesFromTimeField(dueTime),
    };
    if (await onSubmit(fields)) reset();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    // Esc leaves an edit; in "Add a task…" it empties the fields.
    if (onCancel) {
      event.stopPropagation();
      onCancel();
    } else if (open) {
      event.stopPropagation();
      reset();
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center"
    >
      <label htmlFor={titleId} className="sr-only">
        {titleLabel}
      </label>
      <WithTooltip
        label={onCancel ? "The task's title" : "Type a task, then press Enter"}
        shortcut={onCancel ? undefined : "Enter"}
        side="top"
      >
        <Input
          id={titleId}
          data-private=""
          autoComplete="off"
          maxLength={300}
          placeholder="Add a task…"
          value={title}
          // An edit opens with the title ready to change.
          autoFocus={autoFocus}
          onChange={(e) => setTitle(e.target.value)}
          className="ph-no-capture md:min-w-60 md:flex-1"
        />
      </WithTooltip>
      {open ? (
        // Two columns on a phone, with each field's name over it; one row
        // beside the title on a desktop, where the tooltips name them.
        <div className="grid grid-cols-2 items-end gap-2 md:flex md:flex-wrap md:items-center">
          <Field id={dateId} label="Due date">
            <WithTooltip label="When it's due. Leave it empty for no date.">
              <Input
                id={dateId}
                type="date"
                min={range.from}
                max={range.to}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="md:w-auto"
              />
            </WithTooltip>
          </Field>
          <Field id={timeId} label="Time">
            <WithTooltip
              label={
                dueDate === ""
                  ? "Pick a date first"
                  : "The time it's due. Leave it empty for all day."
              }
            >
              <Input
                id={timeId}
                type="time"
                disabled={dueDate === ""}
                value={dueDate === "" ? "" : dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="md:w-auto"
              />
            </WithTooltip>
          </Field>
          <Field id={courseId} label="Course">
            <Select value={course} onValueChange={setCourse}>
              <WithTooltip label="The course it's for, if any">
                <SelectTrigger
                  id={courseId}
                  className="w-full md:w-auto md:min-w-28"
                >
                  <SelectValue />
                </SelectTrigger>
              </WithTooltip>
              <SelectContent>
                <SelectItem value={NO_COURSE}>No course</SelectItem>
                {offered.map((code) => (
                  <SelectItem key={code} value={code}>
                    <span className="ident">{code}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex gap-2">
            <WithTooltip label={submitHint} shortcut="Enter">
              <Button
                type="submit"
                disabled={title.trim() === ""}
                className="max-md:flex-1"
              >
                {submitLabel}
              </Button>
            </WithTooltip>
            {onCancel ? (
              <WithTooltip label="Keep it as it was" shortcut="Esc">
                <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              </WithTooltip>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}

/** "Add a task…": at the top of the list, and on the first visit. */
export function QuickAdd({
  courses,
  today,
  className,
}: {
  courses: readonly CourseCode[];
  today: IsoDate;
  className?: string;
}) {
  const saveTask = useTodo((s) => s.saveTask);
  const add = (fields: TaskFields): boolean => {
    const uid = newTaskUid();
    // Counted, never with the words: whether tasks get dates and courses.
    track("todo_task_added", {
      date: fields.dueDate !== null,
      time: fields.dueTime !== null,
      course: fields.courseCode !== null,
    });
    const save = () =>
      void saveTask(uid, fields).then((status) => {
        if (status !== "saved") saveFailedNote(status, save);
      });
    save();
    // On the list at once; a failure takes it off again and says so.
    return true;
  };
  return (
    <div className={cn("py-1", className)}>
      <TaskForm
        courses={courses}
        today={today}
        titleLabel="New task"
        submitLabel="Add"
        submitHint="Add it to your list"
        alwaysOpen={false}
        onSubmit={add}
      />
    </div>
  );
}

/** An own task's fields, in its row's place, while it's being changed. */
export function TaskEditor({
  uid,
  initial,
  courses,
  today,
  onClose,
}: {
  uid: string;
  initial: TaskFields;
  courses: readonly CourseCode[];
  today: IsoDate;
  onClose: () => void;
}) {
  const saveTask = useTodo((s) => s.saveTask);
  const save = (fields: TaskFields): boolean => {
    const send = () =>
      void saveTask(uid, fields).then((status) => {
        if (status !== "saved") saveFailedNote(status, send);
      });
    send();
    onClose();
    return false;
  };
  return (
    <TaskForm
      initial={initial}
      courses={courses}
      today={today}
      titleLabel="Title"
      submitLabel="Save"
      submitHint="Save the changes"
      alwaysOpen
      autoFocus
      onSubmit={save}
      onCancel={onClose}
    />
  );
}
