import { Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import type { ReactNode } from "react";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { ROW_LINK } from "./frame";

// The side column's filter on an instructor's or a course's page (owner,
// 2026-09-29: "instructors by courses, or courses by instructor"): the
// kit's rows, one link each, the one you're on marked as the kit marks a
// current row. Each is an address of its own, so search engines follow them.

export function FilterRow({
  current = false,
  label,
  secondary,
  trail,
  tooltip,
  link,
}: {
  current?: boolean;
  label: ReactNode;
  secondary?: ReactNode;
  /** Its numbers: a rating, a GPA. */
  trail?: ReactNode;
  tooltip: string;
  link: Pick<LinkProps, "to" | "params" | "search">;
}) {
  return (
    <ListRow
      as="li"
      state={current ? "current" : undefined}
      secondary={secondary}
      trail={trail}
      className={cn(
        // A nav, not a table: no rules between, and the highlight bleeds
        // past the text so the names line up with the heading.
        "relative -mx-2 border-b-0 px-2 [li:not(:last-child)>&]:border-b-0",
        !current && "hover:bg-hover",
      )}
    >
      <WithTooltip label={tooltip}>
        <Link
          {...link}
          aria-current={current ? "page" : undefined}
          activeOptions={{ exact: true, includeSearch: true }}
          className={cn(ROW_LINK, "block truncate text-base")}
        >
          {label}
        </Link>
      </WithTooltip>
    </ListRow>
  );
}
