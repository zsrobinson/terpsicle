import { Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronLeft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { WithTooltip } from "./tooltip";

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

/** Back's look, as a link or a button. */
const BACK =
  "-ml-1 inline-flex w-fit items-center gap-0.5 font-medium text-muted text-sm transition-colors hover:text-fg max-md:-my-3 max-md:py-3";

/**
 * The one back affordance: a chevron and the name of where you came from,
 * never a trail. On phones its target grows to 44px without moving anything.
 * Its tooltip says where it goes ("Back to Settings").
 */
export function BackLink({
  label,
  to,
  search,
  params,
  className,
}: BackTo & { className?: string }) {
  return (
    <WithTooltip label={`Back to ${label}`}>
      <Link
        to={to}
        search={search}
        params={params}
        className={cn(BACK, className)}
      >
        <ChevronLeft size={14} aria-hidden="true" />
        {label}
      </Link>
    </WithTooltip>
  );
}

/**
 * `BackLink`'s look for a Back that follows history rather than a route (the
 * scheduler's drill-ins go back to wherever you came from).
 */
export function BackButton({
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  /** Where Back goes: "Search", or `<span class="ident">CMSC351</span>`. */
  children: ReactNode;
}) {
  // The rest (and `ref`) reach the button, so a tooltip can wrap it.
  return (
    <button type="button" {...props} className={cn(BACK, className)}>
      <ChevronLeft size={14} className="shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * - `page`: the page's `h1` at 18/24 semibold, a 12px status line under it,
 *   the view switch and actions at the right, a hairline under it all. On
 *   phones it stacks: title and status, then the switch and actions in a row.
 * - `panel`: the 48px panel header (`PanelHeader`): an `h2` at 13/18 over a
 *   12px line, actions at the right, and a view switch under it.
 * - `display`: a public reading page's (Reviews): a small label over an
 *   `h1` at 32/38, a 15px status line, the actions beside it, and no rule
 *   under it, so the page reads as one piece. The views go under it all.
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
  eyebrow,
  className,
}: {
  title: ReactNode;
  /** One line of facts: counts, freshness, at most one cross-link. */
  status?: ReactNode;
  back?: BackTo;
  /** A `ViewSwitch`. */
  views?: ReactNode;
  actions?: ReactNode;
  size?: "page" | "panel" | "display";
  /** `display` only: what the page is ("Instructor"), over the title. */
  eyebrow?: ReactNode;
  className?: string;
}) {
  if (size === "display")
    return (
      <header
        data-slot="page-header"
        className={cn("flex shrink-0 flex-col gap-4 pt-4 md:pt-8", className)}
      >
        {back ? <BackLink {...back} className="mb-1" /> : null}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            {eyebrow ? (
              <div className="font-medium text-product-reviews-text text-sm">
                {eyebrow}
              </div>
            ) : null}
            <h1 className="text-balance font-semibold text-3xl tracking-tight">
              {title}
            </h1>
            {status ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg text-muted">
                {status}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {views ? <div className="min-w-0">{views}</div> : null}
      </header>
    );
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
      data-slot="page-header"
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

/**
 * A page's title and status line where the page has no header of its own,
 * in the family bar's context (Todo's week, docs/decisions.md "One bar at
 * the top"): the page's one `h1`, the status line under it in the bar's
 * small type, both cut short rather than wrapped.
 */
export function BarTitle({
  title,
  status,
  className,
}: {
  title: ReactNode;
  status?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-center", className)}>
      <h1 className="truncate font-semibold text-base leading-tight">
        {title}
      </h1>
      {status ? (
        <div className="flex min-w-0 items-center gap-1 truncate text-muted text-xs leading-tight">
          {status}
        </div>
      ) : null}
    </div>
  );
}
