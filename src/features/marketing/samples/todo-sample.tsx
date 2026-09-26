import { useState } from "react";
import { WithTooltip } from "~/ui/tooltip";
import { dot, SampleCard, type SampleProps, type Tint } from "./sample";

// Todo in small: what's due this week from the ELMS feed, by day, with
// Gradescope work tagged and exams set apart. Tick things off. Courses are
// the fixtures'; the assignments are made up.

interface Item {
  id: string;
  title: string;
  course: string;
  tint: Tint;
  due: string;
  kind?: "exam" | "gradescope";
}

const DAYS: { name: string; items: Item[] }[] = [
  {
    name: "Tomorrow, Tuesday",
    items: [
      {
        id: "hw4",
        title: "Homework 4",
        course: "STAT400",
        tint: "amber",
        due: "11:59 pm",
        kind: "gradescope",
      },
      {
        id: "draft",
        title: "Draft 2: instructions",
        course: "ENGL393",
        tint: "violet",
        due: "11:59 pm",
      },
    ],
  },
  {
    name: "Wednesday",
    items: [
      {
        id: "quiz",
        title: "Quiz 3",
        course: "PSYC100",
        tint: "pink",
        due: "10:00 am",
      },
      {
        id: "p2",
        title: "Project 2",
        course: "CMSC330",
        tint: "lime",
        due: "11:59 pm",
        kind: "gradescope",
      },
    ],
  },
  {
    name: "Friday",
    items: [
      {
        id: "exam",
        title: "Exam 1",
        course: "MATH240",
        tint: "orange",
        due: "8:00 am",
        kind: "exam",
      },
      {
        id: "resp",
        title: "Reading response 5",
        course: "PHIL140",
        tint: "teal",
        due: "9:00 am",
      },
    ],
  },
];

const ALL = DAYS.flatMap((d) => d.items);

export function TodoSample(_: SampleProps) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState("");
  const open = ALL.filter((i) => !done.has(i.id)).length;

  const toggle = (item: Item) => {
    const next = new Set(done);
    const isDone = !next.has(item.id);
    if (isDone) next.add(item.id);
    else next.delete(item.id);
    setDone(next);
    setStatus(
      `${item.title} ${isDone ? "done" : "reopened"}. ${ALL.length - next.size} open.`,
    );
  };

  return (
    <SampleCard
      product="todo"
      title={
        <>
          This week <span className="font-normal text-muted">{open} open</span>
        </>
      }
      status={status}
    >
      {DAYS.map((day) => (
        <section key={day.name} aria-label={day.name}>
          <h3 className="border-hairline border-b bg-panel px-3 py-1 font-semibold text-muted text-xs">
            {day.name}
          </h3>
          <ul className="divide-y divide-hairline">
            {day.items.map((item) => {
              const checked = done.has(item.id);
              return (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-hover">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item)}
                      className="size-3.5 shrink-0 cursor-pointer appearance-none border border-fg bg-raised checked:bg-accent checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23fffcf0%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22square%22%3E%3Cpath%20d%3D%22M20%206%209%2017l-5-5%22%2F%3E%3C%2Fsvg%3E')] checked:bg-center checked:bg-no-repeat checked:bg-[length:10px]"
                    />
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={dot(item.tint)}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-base ${checked ? "text-faint line-through" : ""}`}
                    >
                      {item.title}
                      {item.kind === "exam" ? (
                        <span className="ml-2 border border-hairline-strong px-1 font-semibold text-2xs text-muted no-underline">
                          Exam
                        </span>
                      ) : null}
                      {item.kind === "gradescope" ? (
                        <WithTooltip label="Linked from ELMS to Gradescope">
                          <span className="ml-2 border border-hairline-strong px-1 font-semibold text-2xs text-muted">
                            Gradescope
                          </span>
                        </WithTooltip>
                      ) : null}
                    </span>
                    <span className="font-mono text-muted text-xs">
                      {item.course}
                    </span>
                    <span className="w-14 text-right text-muted text-xs tnum">
                      {item.due}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </SampleCard>
  );
}
