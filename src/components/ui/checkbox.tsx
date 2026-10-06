import { cn } from "cn";
import type { ComponentProps } from "react";
import { HapticTap } from "./haptic";
import { WithTooltip } from "./tooltip";

// A native checkbox in a target bigger than its box: the label is what a
// finger or pointer hits (44px on phones, docs/decisions.md "Every kit
// control is 44px on phones", sized by the caller), the box inside it is the
// control, with its tooltip. Native, as Todo's checks always were; the kit
// adds the iPhone tick (`haptic`, docs/decisions.md "Haptics live in the
// kit"), whose overlay covers the label and passes the tap on to it.

/**
 * - `tooltip`: what checking it does ("Mark done").
 * - `haptic`: a tick on iPhone when a finger checks it. Off by default:
 *   turn it on for the check that finishes something.
 * - `className`: the label's, the target's size; the box is 16px.
 */
export function Checkbox({
  tooltip,
  haptic = false,
  className,
  disabled,
  ...input
}: Omit<ComponentProps<"input">, "type" | "className"> & {
  tooltip: string;
  haptic?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex shrink-0 items-center justify-center",
        !disabled && "cursor-pointer",
        haptic && !disabled && "relative",
        className,
      )}
    >
      <WithTooltip label={tooltip}>
        <input
          type="checkbox"
          disabled={disabled}
          className="size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-default"
          {...input}
        />
      </WithTooltip>
      {haptic && !disabled ? <HapticTap /> : null}
    </label>
  );
}
