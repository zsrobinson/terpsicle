import { cn } from "cn";
import { Bell, TriangleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import { tintStyle } from "~/features/calendar/tint";
import {
  clock,
  clockRange,
  type DemoState,
  FULL_SECTION,
  PLAN_A,
  placedSection,
  WEEKDAYS,
  WORK_BLOCK,
  walksOf,
  weekEntries,
} from "./plan-a";

// Plan A's week, drawn the way the scheduler draws it (src/features/
// calendar): square tinted blocks with the code in mono, the times and room
// under it, overlapping classes side by side, the tight walk as a warning
// pill between two classes and the Work block hatched. It's a picture, not
// the calendar: one label says the whole week to a screen reader, and
// nothing in it takes a click. Sizes come from marketing.css (`--mk-hour`),
// so the server's HTML already has the final layout.

/** The hours on screen: 8am to 5pm. Every Plan A class fits in them. */
export const FIRST_HOUR = 8;
export const LAST_HOUR = 17;

/** `calc()` for a time's distance from the top of the hours. */
function y(minutes: number): string {
  return `calc(var(--mk-hour) * ${((minutes - FIRST_HOUR * 60) / 60).toFixed(4)})`;
}

function h(start: number, end: number): string {
  return `calc(var(--mk-hour) * ${((end - start) / 60).toFixed(4)} - 2px)`;
}

/** The week in words, for the one label a screen reader hears. */
export function weekWords(state: DemoState): string {
  const parts = PLAN_A.map(
    (c) => `${c.code} ${placedSection(state, c.code).code}`,
  );
  return `Plan A's week: ${parts.join(", ")}, and work on Friday afternoon.`;
}

export function Week({
  state,
  className,
}: {
  state: DemoState;
  className?: string;
}) {
  const entries = weekEntries(state);
  const walks = walksOf(state);
  const hours = LAST_HOUR - FIRST_HOUR;
  return (
    <div
      role="img"
      aria-label={weekWords(state)}
      data-week=""
      className={cn("mk-week text-fg", className)}
    >
      <div className="mk-week-days border-hairline border-b text-muted text-sm">
        <span />
        {WEEKDAYS.map((d) => (
          <span key={d} className="border-hairline border-l text-center">
            {d}
          </span>
        ))}
      </div>
      <div
        className="mk-week-body"
        style={{ height: `calc(var(--mk-hour) * ${hours})` } as CSSProperties}
      >
        <div className="relative">
          {Array.from({ length: hours }, (_, k) => FIRST_HOUR + k).map(
            (hour) => (
              <span
                key={hour}
                className="ident absolute right-1 text-2xs text-muted"
                style={{ top: y(hour * 60) }}
              >
                {clock(hour * 60)}
              </span>
            ),
          )}
        </div>
        {WEEKDAYS.map((name, day) => (
          <div key={name} className="mk-week-col border-hairline border-l">
            {entries
              .filter((e) => e.day === day)
              .map((e) => {
                const watched =
                  state.watching &&
                  e.course.code === FULL_SECTION.course &&
                  e.section.code === FULL_SECTION.section;
                return (
                  <div
                    key={e.id}
                    data-course={e.course.code}
                    data-lanes={e.lanes}
                    // How many lines fit, as the scheduler decides it: the
                    // code always, then the time, then the room.
                    data-size={
                      e.end - e.start >= 70
                        ? "l"
                        : e.end - e.start >= 45
                          ? "m"
                          : "s"
                    }
                    className="mk-block absolute flex flex-col overflow-hidden border px-1.5 py-1"
                    style={{
                      ...tintStyle(e.course.color),
                      top: y(e.start),
                      height: h(e.start, e.end),
                      left: `calc(${(e.lane / e.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / e.lanes}% - 4px)`,
                    }}
                  >
                    <span className="flex items-baseline gap-1 text-2xs">
                      {/* Side by side on a phone, the code stacks, as
                          the scheduler's narrow blocks do. */}
                      <span className="mk-code ident shrink-0 font-semibold">
                        <span>{e.course.code.slice(0, 4)}</span>
                        <span>{e.course.code.slice(4)}</span>
                      </span>
                      {e.kind ? (
                        <span className="mk-block-line min-w-0 truncate opacity-80">
                          {e.kind}
                        </span>
                      ) : null}
                      {watched ? (
                        <Bell
                          size={9}
                          fill="currentColor"
                          aria-hidden="true"
                          className="mk-pop ml-auto shrink-0 self-center"
                        />
                      ) : null}
                    </span>
                    <span className="mk-block-line tnum truncate text-2xs opacity-80">
                      {e.lanes > 1
                        ? clock(e.start)
                        : clockRange(e.start, e.end)}
                    </span>
                    <span className="mk-block-line mk-block-place truncate text-2xs opacity-80">
                      {e.place}
                    </span>
                  </div>
                );
              })}
            {day === WORK_BLOCK.day ? (
              <div
                className="stripes absolute flex flex-col overflow-hidden border border-hairline bg-panel px-1.5 py-1 text-muted"
                style={{
                  top: y(WORK_BLOCK.start),
                  height: h(WORK_BLOCK.start, WORK_BLOCK.end),
                  left: 2,
                  right: 2,
                }}
              >
                <span className="truncate font-semibold text-2xs">
                  {WORK_BLOCK.label}
                </span>
                <span className="mk-block-line tnum truncate text-2xs">
                  {clockRange(WORK_BLOCK.start, WORK_BLOCK.end)}
                </span>
              </div>
            ) : null}
            {walks
              .filter((w) => w.day === day)
              .map((w) => (
                <span
                  key={w.day}
                  className="mk-pill tnum -translate-x-1/2 -translate-y-1/2 absolute left-1/2 z-10 flex h-5 items-center gap-1 whitespace-nowrap border border-warn/50 bg-raised px-1.5 text-2xs text-warn"
                  style={{ top: y(w.at) }}
                >
                  <TriangleAlert size={10} aria-hidden="true" />
                  {w.minutes} min
                </span>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
