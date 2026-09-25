import { cn } from "cn";
import type * as React from "react";

/** A neutral loading/empty bar. Decorative: hidden from assistive tech. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded bg-hover", className)}
      {...props}
    />
  );
}

export { Skeleton };
