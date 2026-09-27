import { cn } from "cn";
import { ToggleGroup } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { WithTooltip } from "./tooltip";

// One selected look for every row of choices (docs/COHESION.md §3, Phase 2):
// text labels in a hairline-strong strip, the current one on the neutral
// selected fill. `SegmentedControl` is for choices inside a page (travel
// pace); `ViewSwitch` is its link form, for views that are URLs.

/** The strip: 28px on a desktop, 44px on phones, so each segment is a target. */
export const SEGMENTS =
  "inline-flex h-11 max-w-full shrink-0 border border-hairline-strong bg-raised md:h-7";

/**
 * One segment. The current one is `aria-current` (a view) or
 * `aria-checked` (a choice); both draw the same.
 */
export const SEGMENT = cn(
  "inline-flex h-full min-w-0 items-center justify-center whitespace-nowrap border-hairline-strong border-r px-2.5 font-medium text-muted text-sm transition-colors last:border-r-0",
  "hover:bg-hover hover:text-fg",
  "aria-[current=page]:bg-accent-soft aria-[current=page]:text-fg",
  "aria-checked:bg-accent-soft aria-checked:text-fg",
  // Neighbors paint over an outline drawn outside the box.
  "focus-visible:relative focus-visible:z-10",
);

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** The tooltip; give one when the label alone doesn't say enough. */
  hint?: string;
  /** The accessible name, when the label is more than words ("Slower, 2.5 mph"). */
  ariaLabel?: string;
}

/**
 * A choice of one among two to seven, inside a page (Radix ToggleGroup: a
 * radio group, with arrow keys between segments). Choosing the current one
 * again keeps it: there's always one chosen.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  className,
}: {
  /** The group's accessible name ("Your pace"). */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const option = options.find((o) => o.value === next);
        if (option) onValueChange(option.value);
      }}
      className={cn(SEGMENTS, className)}
    >
      {options.map((option) => (
        <Hinted key={option.value} hint={option.hint}>
          <ToggleGroup.Item
            value={option.value}
            aria-label={option.ariaLabel}
            className={SEGMENT}
          >
            {option.label}
          </ToggleGroup.Item>
        </Hinted>
      ))}
    </ToggleGroup.Root>
  );
}

/** A segment's tooltip, when it has one; its label is always visible. */
export function Hinted({
  hint,
  children,
}: {
  hint: string | undefined;
  children: ReactElement;
}) {
  return hint ? <WithTooltip label={hint}>{children}</WithTooltip> : children;
}
