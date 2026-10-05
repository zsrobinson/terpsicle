import { Link, useRouterState } from "@tanstack/react-router";
import { Settings, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { AppBar } from "~/components/app-bar";
import { feedbackProduct } from "~/core/feedback/path";
import { courseFromSlug } from "~/core/reviews/slugs";
import { isAdminPath, SCHEDULE_PATH } from "~/core/routing";
import { PRODUCTS } from "~/lib/products";
import { Button } from "~/ui/button";
import { PageHeader } from "~/ui/page-header";
import { type PageWidth, ProductPage } from "~/ui/product-page";
import { WithTooltip } from "~/ui/tooltip";

// The frame for pages outside the scheduler (the coming-soon pages,
// `/privacy`, not found, sign-in, Settings, Reviews, Todo, Plan, admin): the
// family bar over the kit's page (`ProductPage`), which picks the width and,
// on the pages you read, draws the footer.

/** The page's width, from the kit (docs/COHESION.md §4). */
export type SiteLayout = PageWidth;

export function SitePage({
  children,
  layout = "note",
  notFound = false,
}: {
  children: ReactNode;
  layout?: SiteLayout;
  /** The 404 page, whose bar belongs to no product (see SiteHeader). */
  notFound?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <SiteHeader notFound={notFound} />
      <ProductPage width={layout}>{children}</ProductPage>
    </div>
  );
}

/**
 * The bar of every page outside the scheduler: the family bar
 * (`~/components/app-bar`), with the product this path belongs to and its feedback.
 * Chat's page uses it too, above its own full-height layout.
 */
export function SiteHeader({
  notFound = false,
  borderOnScroll = false,
  context,
  status,
}: {
  notFound?: boolean;
  /** Reviews' public pages: the bar's rule shows once the page scrolls. */
  borderOnScroll?: boolean;
  /** A product's own context in the bar (Todo's views and week), for the path's. */
  context?: ReactNode;
  /** Its controls at the bar's end, before the account cluster. */
  status?: ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // The Worker renders a 404 at its own path (NOT_FOUND_PATH) and the page
  // hydrates at the address asked for (`/admin` for a non-admin), so a 404's
  // bar reads nothing from the path: server and client draw the same one.
  // It keeps Feedback and Support, filed as the site's: a broken link is
  // just what people report (the sheet sends the address they asked for).
  const current = notFound
    ? null
    : (PRODUCTS.find((p) => path.startsWith(p.to))?.id ?? null);
  return (
    <AppBar
      current={current}
      feedback={notFound ? "site" : feedbackProduct(path)}
      pathname={path}
      context={notFound ? null : (context ?? pageContext(path))}
      status={status}
      borderOnScroll={borderOnScroll}
      phoneTitle={notFound ? undefined : phoneTitle(path)}
    />
  );
}

/**
 * What a phone's bar leads with on a Reviews course's page: its code (the
 * page's own title is the code and name, too long for the bar). Elsewhere
 * the bar names the product.
 */
function phoneTitle(path: string): ReactNode | undefined {
  const slug = /^\/reviews\/([^/]+)\/?$/.exec(path)?.[1];
  const code = slug ? courseFromSlug(slug) : null;
  return code ? <span className="ident">{code}</span> : undefined;
}

/**
 * The bar's context on pages that aren't a product: Settings, and the
 * owner's admin pages. Neither is in the product menu, so the name says
 * where you are.
 */
function pageContext(path: string): ReactNode {
  const page = path.startsWith("/settings")
    ? { icon: Settings, label: "Settings" }
    : isAdminPath(path)
      ? { icon: ShieldCheck, label: "Admin" }
      : null;
  if (!page) return null;
  return (
    <span className="emph-heading flex items-center gap-1.5 text-base">
      <page.icon size={15} aria-hidden="true" className="text-muted" />
      {page.label}
    </span>
  );
}

/** The one call to action off the scheduler: View schedule. */
export function OpenScheduleButton() {
  return (
    <WithTooltip label="Plan your classes">
      <Button className="w-fit" render={<Link to={SCHEDULE_PATH} />}>
        View schedule
      </Button>
    </WithTooltip>
  );
}

/** A page another track fills in later: its name, and what's coming. */
export function ComingSoonPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <SitePage>
      <PageHeader title={title} status="Coming soon" />
      <p className="text-muted">{children}</p>
      <OpenScheduleButton />
    </SitePage>
  );
}
