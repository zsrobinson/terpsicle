import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode, useEffect } from "react";
import { initAnalytics, track } from "~/app/analytics";
import type { CourseCode } from "~/core/schema";
import { SitePage } from "~/features/site/site-page";
import { WithTooltip } from "~/ui/tooltip";
import { AccountLink } from "./account-link";

// The frame of Terpsicle Reviews' pages (V2 §1.1): the site header with the
// account button, breadcrumbs, titles and sections.

export type ReviewsPageName = "home" | "instructor" | "course";

export function ReviewsFrame({
  page,
  children,
}: {
  /** Counted as a page view; left out on /reviews/mine and the policy. */
  page?: ReviewsPageName;
  children: ReactNode;
}) {
  useEffect(() => {
    void initAnalytics();
    if (page) track("reviews_page_viewed", { page });
  }, [page]);
  return (
    <SitePage wide actions={<AccountLink />}>
      {children}
    </SitePage>
  );
}

export interface Crumb {
  label: string;
  to?: "/reviews" | "/reviews/courses/$code";
  params?: { code: CourseCode };
  mono?: boolean;
}

/** "Reviews / CMSC351 / Ada Brandt": the way back up. */
export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumbs" className="mb-3 text-muted text-sm">
      {crumbs.map((c, i) => (
        <Fragment key={c.label}>
          {i > 0 ? <span className="px-1.5 text-faint">/</span> : null}
          {c.to ? (
            <WithTooltip
              label={c.mono ? `Reviews for ${c.label}` : "Find a course"}
            >
              <Link
                to={c.to}
                params={c.params as never}
                className={`hover:text-fg ${c.mono ? "ident" : ""}`}
              >
                {c.label}
              </Link>
            </WithTooltip>
          ) : (
            <span className={c.mono ? "ident" : undefined}>{c.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

/** A page's heading and the line under it. */
export function PageTitle({
  title,
  sub,
}: {
  title: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <header className="mb-4">
      <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
      {sub ? <div className="mt-0.5 text-muted">{sub}</div> : null}
    </header>
  );
}

/** A titled part of a page, with a count and an action on its right. */
export function Section({
  title,
  count,
  right,
  children,
}: {
  title: string;
  count?: number;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex min-h-8 items-center gap-2 border-hairline border-b pb-1.5">
        <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
        {count !== undefined ? (
          <span className="tnum text-muted">{count}</span>
        ) : null}
        {right ? <div className="ml-auto">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}
