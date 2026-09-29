import { cn } from "cn";
import type { CourseCode } from "~/core/schema";
import { tintStyle } from "~/features/calendar/tint";
import { todoCourseColors } from "./course-colors";

// The front door's picture of Todo (V3 §3.9): a made-up week, drawn like the
// real one, so someone signed out sees what they'd get. Nothing in it can be
// pressed.

interface SampleItem {
  title: string;
  course: CourseCode | null;
  time: string;
  done?: boolean;
}

const DAYS: readonly { name: string; items: readonly SampleItem[] }[] = [
  {
    name: "Mon",
    items: [{ title: "Lab 6", course: "CMSC216", time: "11:59pm", done: true }],
  },
  { name: "Tue", items: [] },
  {
    name: "Wed",
    items: [
      { title: "WebAssign 5", course: "MATH240", time: "11:59pm" },
      { title: "Email my advisor", course: null, time: "All day" },
    ],
  },
  {
    name: "Thu",
    items: [
      { title: "Reading response 3", course: "ENGL101", time: "All day" },
    ],
  },
  {
    name: "Fri",
    items: [{ title: "Midterm 1", course: "CMSC216", time: "1pm" }],
  },
  { name: "Sat", items: [] },
  {
    name: "Sun",
    items: [
      { title: "Project 2", course: "CMSC216", time: "11:59pm" },
      { title: "Homework 4", course: "MATH240", time: "11:59pm" },
    ],
  },
];

const WEEKEND = new Set(["Sat", "Sun"]);

const COLORS = todoCourseColors(["CMSC216", "ENGL101", "MATH240"], {});

function Card({ item }: { item: SampleItem }) {
  const color = item.course ? COLORS[item.course] : undefined;
  return (
    <li
      style={color && !item.done ? tintStyle(color) : undefined}
      className={cn(
        "border px-1.5 py-1 text-xs",
        (item.done || !color) && "border-hairline-strong bg-panel",
        item.done && "text-muted",
      )}
    >
      <span className={cn("tnum block", color && !item.done && "opacity-80")}>
        {item.time}
        {item.course ? (
          <span className="ident ml-1 font-medium">{item.course}</span>
        ) : null}
      </span>
      <span className={cn("block font-medium", item.done && "line-through")}>
        {item.title}
      </span>
    </li>
  );
}

export function SamplePreview() {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="emph-secondary text-sm">
        A week in Todo: your deadlines and your own tasks, in each course's
        color
      </figcaption>
      <div
        aria-hidden="true"
        className="grid grid-cols-7 border-hairline border-t border-l max-md:hidden"
      >
        {DAYS.map((day) => (
          <div
            key={day.name}
            className={cn(
              "min-h-40 min-w-0 border-hairline border-r border-b",
              // Shaded as the real week's weekend is.
              WEEKEND.has(day.name) && "bg-panel",
            )}
          >
            <p className="emph-label border-hairline border-b px-2 py-1.5 text-sm">
              {day.name}
            </p>
            <ul className="space-y-1 p-1">
              {day.items.map((item) => (
                <Card key={item.title} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <ul aria-hidden="true" className="space-y-3 md:hidden">
        {DAYS.filter((d) => d.items.length > 0).map((day) => (
          <li key={day.name}>
            <p className="emph-heading border-hairline border-b pb-1 text-sm">
              {day.name}
            </p>
            <ul className="space-y-1 pt-1">
              {day.items.map((item) => (
                <Card key={item.title} item={item} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </figure>
  );
}
