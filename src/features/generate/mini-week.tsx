import { cn } from "cn";
import type { CatalogIndex } from "~/core/catalog";
import { resolveCourseColors } from "~/core/color";
import {
  type CourseCode,
  type CourseColor,
  DAYS,
  type Day,
  type SectionKey,
} from "~/core/schema";
import { sectionWeekItems } from "~/core/time";
import { dotStyle } from "~/features/calendar/tint";

// A plan's week at thumbnail size: one column per weekday, a bar per class
// in the course color. Changed sections get a ring; conflicting ones (near-
// misses) an amber ring.

const WEEKDAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];
/** 8am to 6pm unless a class is outside it. */
const DEFAULT_START = 8 * 60;
const DEFAULT_END = 18 * 60;

export type MiniWeekMark = "changed" | "conflict";

export function MiniWeek({
  sections,
  index,
  colors,
  marks,
  className,
}: {
  sections: readonly SectionKey[];
  index: CatalogIndex;
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  marks?: ReadonlyMap<SectionKey, MiniWeekMark>;
  className?: string;
}) {
  // Courses without a stored color still come out distinct within the plan.
  const resolved = resolveCourseColors(
    sections.flatMap((key) => {
      const code = index.sections.get(key)?.course.code;
      return code ? [code] : [];
    }),
    colors,
  );
  const items = sections.flatMap((key) => {
    const ref = index.sections.get(key);
    if (!ref) return [];
    const color = resolved[ref.course.code] ?? "blue";
    return sectionWeekItems(ref.course.code, ref.section).map((item) => ({
      ...item,
      key,
      color,
    }));
  });
  const weekend = DAYS.filter(
    (d) => !WEEKDAYS.includes(d) && items.some((i) => i.day === d),
  );
  const days = [...WEEKDAYS, ...weekend];
  const start = Math.min(DEFAULT_START, ...items.map((i) => i.start));
  const end = Math.max(DEFAULT_END, ...items.map((i) => i.end));
  const pct = (m: number) => ((m - start) / (end - start)) * 100;
  return (
    <div
      aria-hidden
      className={cn("grid h-full gap-[2px]", className)}
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map((day) => (
        <div key={day} className="relative rounded-[2px] bg-panel">
          {items
            .filter((i) => i.day === day)
            .map((i) => {
              const mark = marks?.get(i.key);
              return (
                <div
                  key={`${i.key}-${i.source.meetingIndex}`}
                  className={cn(
                    "absolute inset-x-px rounded-[1px]",
                    mark === "changed" && "ring-1 ring-fg",
                    mark === "conflict" && "ring-1 ring-warn",
                  )}
                  style={{
                    ...dotStyle(i.color),
                    top: `${pct(i.start)}%`,
                    height: `${Math.max(pct(i.end) - pct(i.start), 3)}%`,
                  }}
                />
              );
            })}
        </div>
      ))}
    </div>
  );
}
