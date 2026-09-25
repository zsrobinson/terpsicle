const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
// 8am–6pm: the span most plans fall in. M3 derives it from the plan.
const HOURS = Array.from({ length: 10 }, (_, i) => 8 + i);

function hourLabel(hour: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

/**
 * The empty week grid. Rows share the available height, so the calendar
 * fills the screen with nothing below it (SPEC.md §2).
 */
export function CalendarSkeleton() {
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label="Week calendar"
    >
      <div className="grid shrink-0 grid-cols-[48px_repeat(5,minmax(0,1fr))] border-hairline border-b">
        <div />
        {DAYS.map((day) => (
          <div
            key={day}
            className="border-hairline border-l px-2 py-2 text-[12px] text-muted"
          >
            {day}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-[48px_repeat(5,minmax(0,1fr))] overflow-y-auto"
        style={{
          gridTemplateRows: `repeat(${HOURS.length}, minmax(36px, 1fr))`,
        }}
      >
        {HOURS.map((hour) => (
          <div key={hour} className="contents">
            <div className="-translate-y-2 pr-2 text-right font-mono text-[11px] text-faint">
              {hour === HOURS[0] ? "" : hourLabel(hour)}
            </div>
            {DAYS.map((day) => (
              <div key={day} className="border-hairline border-b border-l" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
