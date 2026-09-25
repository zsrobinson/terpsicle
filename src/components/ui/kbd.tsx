import { cn } from "cn";
import type * as React from "react";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-4 min-w-4 select-none items-center justify-center rounded-sm bg-hover px-1 font-mono text-xs text-muted",
        // Inside the inverted tooltip chip.
        "[[data-slot=tooltip-content]_&]:bg-bg/20 [[data-slot=tooltip-content]_&]:text-bg",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
