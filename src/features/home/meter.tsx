import { cn } from "cn";
import type { CourseColor } from "~/core/schema";
import { dotStyle } from "~/features/calendar/tint";

// A share done, as words over a thin bar (the seat meter's look, SPEC
// §3.4): a class's week in "This week", the four-year plan's credits. The
// words carry the meaning; the bar is for the eye, so it's hidden from
// screen readers. A class's bar wears the course's dot color, as in
// Todo's side panel; anything else is ink.

export function HomeMeter({
  value,
  max,
  words,
  color = null,
  className,
}: {
  value: number;
  max: number;
  /** What it says: "3 of 5 done", "30 of 120 credits". */
  words: string;
  color?: CourseColor | null;
  className?: string;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span
      className={cn("inline-flex flex-col items-end gap-1", className)}
      data-home-meter=""
    >
      <span className="tnum text-sm">{words}</span>
      <span
        aria-hidden="true"
        className="forced-track h-1.5 w-16 overflow-hidden rounded-full bg-hover"
      >
        <span
          className={cn(
            "forced-fill block h-full rounded-full",
            !color && "bg-fg",
          )}
          style={{
            width: `${Math.round(share * 100)}%`,
            ...(color ? dotStyle(color) : {}),
          }}
        />
      </span>
    </span>
  );
}
