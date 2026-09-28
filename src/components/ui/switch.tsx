import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";
import { HapticTap } from "./haptic";

// One switch (docs/COHESION.md §3, Phase 2), on Base UI's: a `role="switch"`
// button whose children are its label, with the track and knob at the end,
// so the whole row is the control. Base UI keeps a hidden checkbox beside
// it for forms. It replaces the two copies of the knob in travel settings
// and notification settings.

/**
 * - `checked` and `onCheckedChange` as Base UI's, less the event details.
 * - `unavailable`: shown off and `aria-disabled`, but still focusable and
 *   hoverable, so its tooltip can say why ("Coming soon"). A `disabled`
 *   switch would hide that.
 * - `haptic`: a tick on iPhone when a finger toggles it (on by default;
 *   `~/ui/haptic`). Nothing on a desktop.
 */
function Switch({
  checked,
  onCheckedChange,
  unavailable = false,
  haptic = true,
  className,
  children,
  ...props
}: Omit<
  SwitchPrimitive.Root.Props,
  "checked" | "onCheckedChange" | "className" | "render" | "nativeButton"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  unavailable?: boolean;
  haptic?: boolean;
  className?: string;
}) {
  const on = checked && !unavailable;
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      // A real button, as before: the row is one press target.
      nativeButton
      render={<button type="button" />}
      checked={on}
      aria-disabled={unavailable || undefined}
      onCheckedChange={(next) => {
        if (!unavailable) onCheckedChange(next);
      }}
      className={cn(
        "flex items-center gap-2 text-left transition-colors",
        haptic && "relative",
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
      {/* A switch that can't change doesn't tick. */}
      {haptic && !unavailable && !props.disabled ? <HapticTap /> : null}
    </SwitchPrimitive.Root>
  );
}

export { Switch };
