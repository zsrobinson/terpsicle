import { cn } from "cn";
import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Day } from "~/core/schema";
import { DAY_SHORT_NAMES } from "~/core/time";

// The week grid's frame: day headers, an hour gutter and hour lines that
// stretch to fill the height (SPEC §2). Hour height comes from the space
// available, with a readable minimum; below that the grid scrolls. Nothing
// sits below the grid. Calendar contents (src/features/calendar) render
// through `children`, positioned with `layout`.

/** SPEC §2: the grid scrolls only when an hour would get shorter than this. */
export const MIN_HOUR_HEIGHT = 36;
export const GUTTER_WIDTH = 48;
export const DAY_HEADER_HEIGHT = 34;

export interface CalendarLayout {
  days: readonly Day[];
  /** Minutes since midnight at the top and bottom of the grid (whole hours). */
  startMinute: number;
  endMinute: number;
  hourHeight: number;
  /** Pixel height of the hour grid. */
  height: number;
  /** Y offset in the grid for a clock time. */
  yOf: (minute: number) => number;
}

export interface WeekFrameProps {
  days: readonly Day[];
  /** First hour shown, in minutes since midnight. Rounded down to the hour. */
  startMinute: number;
  /** Last hour shown. Rounded up to the hour. */
  endMinute: number;
  minHourHeight?: number;
  /** Strips above the grid that stay while the plan does ("No set time"). */
  top?: ReactNode;
  /** Positioned over the hour grid, right of the gutter. */
  children?: (layout: CalendarLayout) => ReactNode;
  className?: string;
}

export function hourLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

/** Hour height that fills `available` px, never below the readable minimum. */
export function fitHourHeight(
  available: number,
  hours: number,
  minHourHeight = MIN_HOUR_HEIGHT,
): number {
  if (hours <= 0 || available <= 0) return minHourHeight;
  return Math.max(minHourHeight, available / hours);
}

export function WeekFrame({
  days,
  startMinute,
  endMinute,
  minHourHeight = MIN_HOUR_HEIGHT,
  top,
  children,
  className,
}: WeekFrameProps) {
  const start = Math.floor(startMinute / 60) * 60;
  const end = Math.max(start + 60, Math.ceil(endMinute / 60) * 60);
  const hours = (end - start) / 60;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () =>
      setAvailable(Math.max(0, el.clientHeight - DAY_HEADER_HEIGHT));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hourHeight = fitHourHeight(available, hours, minHourHeight);
  const layout = useMemo<CalendarLayout>(
    () => ({
      days,
      startMinute: start,
      endMinute: end,
      hourHeight,
      height: hours * hourHeight,
      yOf: (minute) => ((minute - start) / 60) * hourHeight,
    }),
    [days, start, end, hours, hourHeight],
  );
  const columns = `${GUTTER_WIDTH}px repeat(${days.length}, minmax(0, 1fr))`;
  const lines = Array.from({ length: hours + 1 }, (_, i) => start + i * 60);

  return (
    <section
      aria-label="Week calendar"
      className={cn("flex h-full min-h-0 flex-col", className)}
    >
      {top}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="scroll-thin relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          <div
            className="sticky top-0 z-10 grid border-hairline border-b bg-bg"
            style={{ gridTemplateColumns: columns, height: DAY_HEADER_HEIGHT }}
          >
            <div />
            {days.map((day) => (
              <div
                key={day}
                className="flex items-center px-2 text-muted text-sm"
              >
                {DAY_SHORT_NAMES[day]}
              </div>
            ))}
          </div>
          <div
            className="relative grid"
            style={{ gridTemplateColumns: columns, height: layout.height }}
            data-hour-height={Math.round(hourHeight)}
          >
            <div className="relative" aria-hidden="true">
              {lines.slice(1, -1).map((minute) => (
                <span
                  key={minute}
                  className="ident -translate-y-1/2 absolute right-2 text-2xs text-faint"
                  style={{ top: layout.yOf(minute) }}
                >
                  {hourLabel(minute)}
                </span>
              ))}
            </div>
            {days.map((day) => (
              <div
                key={day}
                className="border-hairline border-l"
                aria-hidden="true"
              />
            ))}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0"
              style={{ left: GUTTER_WIDTH }}
            >
              {lines.slice(1, -1).map((minute) => (
                <div
                  key={minute}
                  className="absolute inset-x-0 border-hairline border-t"
                  style={{ top: layout.yOf(minute) }}
                />
              ))}
            </div>
            {children ? (
              <div
                className="absolute inset-y-0 right-0"
                style={{ left: GUTTER_WIDTH }}
              >
                {children(layout)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
