import { cn } from "cn";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { WithTooltip } from "~/ui/tooltip";
import { StarPart, starsWords } from "./stars";

// A rating in half stars, 1 to 5 (owner, 2026-09-29: "users should be able
// to rate professors by increments of half stars using an intuitive and
// accessible input method"). One control, a slider over five stars:
// pointing at a star's left half previews a half, its right half the whole
// star, and a tap or click sets it; the arrow keys move by a half, Page
// Up/Down by a whole star, Home and End to 1 and 5. The value is read out
// ("4.5 out of 5 stars") and written beside it. Nine separate half-star
// buttons would each be too narrow to tap.

const MIN = 1;
const MAX = 5;
const STEP = 0.5;

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

/** The value a pointer at `x` (0 to 1 across the stars) means: up to its half star. */
export function ratingAt(x: number): number {
  return clamp(Math.ceil(x * MAX * 2) / 2);
}

export function RatingInput({
  value,
  onChange,
  label = "Rating",
  size = 24,
  className,
}: {
  value: number | null;
  onChange: (rating: number) => void;
  label?: string;
  /** Each star's size; the control is at least 44px tall on phones. */
  size?: number;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const stars = useRef<HTMLDivElement>(null);
  const shown = hover ?? value ?? 0;

  const at = (event: PointerEvent<HTMLDivElement>) => {
    const box = stars.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    return ratingAt((event.clientX - box.left) / box.width);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = value ?? MIN - STEP;
    const next = {
      ArrowRight: from + STEP,
      ArrowUp: from + STEP,
      ArrowLeft: from - STEP,
      ArrowDown: from - STEP,
      PageUp: from + 1,
      PageDown: from - 1,
      Home: MIN,
      End: MAX,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(clamp(next));
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <WithTooltip label="Point at a star's left half for a half star. Arrow keys move by a half.">
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={value ?? undefined}
          aria-valuetext={value === null ? "Not rated yet" : starsWords(value)}
          onKeyDown={onKeyDown}
          onPointerMove={(e) => setHover(at(e))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => {
            const picked = at(e);
            if (picked !== null) onChange(picked);
          }}
          className="flex cursor-pointer touch-none items-center rounded-md px-1 focus-visible:outline-offset-2 max-md:min-h-11 md:min-h-8"
        >
          <div ref={stars} className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <StarPart key={n} size={size} fill={shown - (n - 1)} />
            ))}
          </div>
        </div>
      </WithTooltip>
      <span className="tnum min-w-16 text-muted text-sm" aria-hidden="true">
        {hover !== null
          ? `${hover} of 5`
          : value === null
            ? "Your rating"
            : `${value} of 5`}
      </span>
    </div>
  );
}
