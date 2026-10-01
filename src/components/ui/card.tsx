import { cn } from "cn";
import type { ComponentProps } from "react";

// A keyline with a 2px offset on paper (docs/DESIGN.md §7): one standalone
// object you press, or one that floats. A generated plan's result, the
// review form. A group of things on a page is a
// `PageSection`, and rows are `ListRow`s: neither gets a box.

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-2 border border-keyline bg-raised p-3 shadow-offset",
        className,
      )}
      {...props}
    />
  );
}
