import { cn } from "cn";
import { Check } from "lucide-react";
import { useState } from "react";
import { setCourseColor } from "~/app/actions";
import { COURSE_COLOR_LABELS } from "~/core/color";
import {
  COURSE_COLORS,
  type CourseCode,
  type CourseColor,
} from "~/core/schema";
import { dotStyle } from "~/features/calendar/tint";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";

/**
 * A course's color dot. Clicking it opens a small palette (SPEC §3.2); the
 * color is per course, the same in every plan and term, and undoable.
 * `readOnly` (the shared view) shows the dot without the palette.
 */
export function CourseColorPicker({
  courseCode,
  color,
  readOnly = false,
  className,
}: {
  courseCode: CourseCode;
  color: CourseColor;
  readOnly?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const dot = (
    <span
      aria-hidden="true"
      className="block size-2 rounded-full"
      style={dotStyle(color)}
    />
  );
  if (readOnly) return <span className={cn("p-1", className)}>{dot}</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <WithTooltip label={`Change ${courseCode}'s color`}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${courseCode} color: ${COURSE_COLOR_LABELS[color]}`}
            className={cn(
              "-m-1 flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-hover data-[state=open]:bg-hover",
              className,
            )}
          >
            {dot}
          </button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent className="w-auto p-2" aria-label="Course colors">
        <div className="grid grid-cols-5 gap-1.5">
          {COURSE_COLORS.map((c) => (
            <Swatch
              key={c}
              color={c}
              selected={c === color}
              onPick={() => {
                setCourseColor(courseCode, c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Swatch({
  color,
  selected,
  onPick,
}: {
  color: CourseColor;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <WithTooltip label={COURSE_COLOR_LABELS[color]}>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={COURSE_COLOR_LABELS[color]}
        onClick={onPick}
        className={cn(
          "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-raised transition-shadow hover:ring-2 hover:ring-hairline-strong",
          selected && "ring-2 ring-fg/70 hover:ring-fg/70",
        )}
        style={dotStyle(color)}
      >
        {selected ? (
          <Check size={12} strokeWidth={3} className="text-bg" aria-hidden />
        ) : null}
      </button>
    </WithTooltip>
  );
}
