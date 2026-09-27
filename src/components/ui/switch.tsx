import { cn } from "cn";
import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";

// One switch (docs/COHESION.md §3, Phase 2), on Radix's: a `role="switch"`
// button whose children are its label, with the track and knob at the end,
// so the whole row is the control. It replaces the two copies of the knob
// in travel settings and notification settings.

/**
 * - `checked` and `onCheckedChange` as Radix's.
 * - `unavailable`: shown off and `aria-disabled`, but still focusable and
 *   hoverable, so its tooltip can say why ("Coming soon"). A `disabled`
 *   switch would hide that.
 */
function Switch({
  checked,
  onCheckedChange,
  unavailable = false,
  className,
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof SwitchPrimitive.Root>,
  "checked" | "onCheckedChange"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  unavailable?: boolean;
}) {
  const on = checked && !unavailable;
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      checked={on}
      aria-disabled={unavailable || undefined}
      onCheckedChange={(next) => {
        if (!unavailable) onCheckedChange(next);
      }}
      className={cn(
        "flex items-center gap-2 text-left transition-colors",
        unavailable && "cursor-default",
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "flex h-4.5 w-7.5 shrink-0 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-accent" : "bg-hairline-strong",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "size-3.5 rounded-full bg-raised shadow-xs transition-transform",
            on && "translate-x-3 bg-accent-fg",
          )}
        />
      </span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
