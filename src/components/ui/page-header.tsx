import { Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

// The top of every page and panel (docs/COHESION.md §1.4): a title, one
// status line, a view switch and actions, with one Back. Same slots at both
// sizes, so a page and a panel read alike.

/** Where Back goes: a route, named for the person ("Reviews", "Settings"). */
export interface BackTo {
  label: string;
  to: LinkProps["to"];
  search?: LinkProps["search"];
  params?: LinkProps["params"];
}

/**
 * The one back affordance: a chevron and the name of where you came from,
 * never a trail. On phones its target grows to 44px without moving anything.
 */
export function BackLink({
  label,
  to,
  search,
  params,
  className,
}: BackTo & { className?: string }) {
  return (
    <Link
      to={to}
      search={search}
      params={params}
      className={cn(
        "-ml-1 inline-flex w-fit items-center gap-0.5 font-medium text-muted text-sm transition-colors hover:text-fg max-md:-my-3 max-md:py-3",
        className,
      )}
    >
      <ChevronLeft size={14} aria-hidden="true" />
      {label}
    </Link>
  );
}

/**
 * - `page`: the page's `h1` at 18/24 semibold, a 12px status line under it,
 *   the view switch and actions at the right, a hairline under it all. On
 *   phones it stacks: title and status, then the switch and actions in a row.
 * - `panel`: the 48px panel header (`PanelHeader`): an `h2` at 13/18 over a
 *   12px line, actions at the right, and a view switch under it.
 *
 * At most one filled button in `actions`; the rest ghost.
 */
export function PageHeader({
  title,
  status,
  back,
  views,
  actions,
  size = "page",
  className,
}: {
  title: ReactNode;
  /** One line of facts: counts, freshness, at most one cross-link. */
  status?: ReactNode;
  back?: BackTo;
  /** A `ViewSwitch`. */
  views?: ReactNode;
  actions?: ReactNode;
  size?: "page" | "panel";
  className?: string;
}) {
  if (size === "panel")
    return (
      <>
        <div
          className={cn(
            "flex min-h-12 shrink-0 items-center gap-2 border-hairline border-b px-4 py-2",
            className,
          )}
        >
          {back ? <BackLink {...back} /> : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold text-base">{title}</h2>
            {status ? (
              <div className="truncate text-muted text-sm">{status}</div>
            ) : null}
          </div>
          {actions}
        </div>
        {views ? (
          <div className="shrink-0 border-hairline border-b px-4 py-2">
            {views}
          </div>
        ) : null}
      </>
    );
  return (
    <header
      className={cn(
        "flex shrink-0 flex-col gap-3 border-hairline border-b pb-3 md:flex-row md:items-end md:justify-between md:gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        {back ? <BackLink {...back} className="mb-1" /> : null}
        <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
        {status ? (
          <div className="flex flex-wrap items-center gap-1.5 text-muted text-sm">
            {status}
          </div>
        ) : null}
      </div>
      {views || actions ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 md:justify-end">
          {views}
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
