import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

// SectionHeader, ListRow and PanelFooter as built in WP0 (UX-REVIEW §2.3,
// "As built in WP0"), with the same props, until they land in ~/app/panel.
// Then this file goes and the imports switch.

/**
 * A section's heading inside a panel.
 * - `bar` (default): a 36px band with hairlines above and below, for lists;
 *   `sticky` pins it to the top of the PanelBody.
 * - `label`: a quiet heading with no lines, for forms and short groups.
 */
export function SectionHeader({
  title,
  count,
  right,
  variant = "bar",
  sticky = false,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  right?: ReactNode;
  variant?: "bar" | "label";
  sticky?: boolean;
  className?: string;
}) {
  if (variant === "label")
    return (
      <div
        className={cn(
          "flex items-baseline justify-between gap-2 px-4 pt-4 pb-1.5 font-medium text-muted text-xs",
          className,
        )}
      >
        <span>
          {title}
          {count !== undefined ? (
            <span className="tnum ml-1.5 font-normal">{count}</span>
          ) : null}
        </span>
        {right}
      </div>
    );
  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border-hairline border-y bg-bg px-4 text-sm",
        sticky && "sticky top-0 z-20",
        className,
      )}
    >
      <h3 className="font-medium">{title}</h3>
      {count !== undefined ? (
        <span className="tnum text-muted">{count}</span>
      ) : null}
      {right ? (
        <div className="ml-auto flex min-w-0 items-center gap-3">{right}</div>
      ) : null}
    </div>
  );
}

/** One row of any list: lead, what it is, a trailing value, one action. */
export function ListRow({
  lead,
  children,
  trail,
  action,
  density = "regular",
  state,
  as: Row = "div",
  className,
  ...rest
}: Omit<ComponentProps<"div">, "children"> & {
  lead?: ReactNode;
  children: ReactNode;
  trail?: ReactNode;
  action?: ReactNode;
  density?: "regular" | "compact";
  state?: "current" | "previewed";
  as?: "div" | "li";
}) {
  return (
    <Row
      {...(rest as ComponentProps<"div"> & ComponentProps<"li">)}
      data-state={state}
      className={cn(
        "flex items-center gap-3 border-hairline border-b px-4 transition-colors last:border-b-0",
        density === "compact" ? "min-h-7 py-1" : "py-2",
        state === "previewed"
          ? "bg-hover"
          : state === "current"
            ? "bg-accent-soft"
            : undefined,
        className,
      )}
    >
      {lead !== undefined ? <div className="shrink-0">{lead}</div> : null}
      <div className="min-w-0 flex-1">{children}</div>
      {trail !== undefined ? (
        <div className="tnum shrink-0 text-right text-sm">{trail}</div>
      ) : null}
      {action !== undefined ? (
        <div className="flex w-14 shrink-0 justify-center">{action}</div>
      ) : null}
    </Row>
  );
}

/** The panel's one primary action, pinned under the scroll area. */
export function PanelFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-hairline border-t bg-bg px-4 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
