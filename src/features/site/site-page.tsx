import { Link, useRouterState } from "@tanstack/react-router";
import { Settings, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { AppBar } from "~/app/app-bar";
import { PRODUCTS } from "~/app/products";
import { feedbackProduct } from "~/core/feedback/path";
import { isAdminPath, SCHEDULE_PATH } from "~/core/routing";
import { Button } from "~/ui/button";
import { PageHeader } from "~/ui/page-header";
import { type PageWidth, ProductPage } from "~/ui/product-page";
import { WithTooltip } from "~/ui/tooltip";

// The frame for pages outside the scheduler (the coming-soon pages,
// `/privacy`, not found, sign-in, Settings, Reviews, Todo, Plan, admin): the
// family bar over the kit's page (`ProductPage`), which picks the width and,
// on the pages you read, draws the footer.

/**
 * The page's width, from the kit (docs/COHESION.md §4), plus `wide`: Plan's
 * board until it moves onto the workbench, edge to edge with a gutter.
 */
export type SiteLayout = PageWidth | "wide";

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
      {layout === "wide" ? (
        <ProductPage width="full" className="px-4 pt-2 pb-8">
          {children}
        </ProductPage>
      ) : (
        <ProductPage width={layout}>{children}</ProductPage>
      )}
    </div>
  );
}

/**
 * The bar of every page outside the scheduler: the family bar
 * (`~/app/app-bar`), with the product this path belongs to and its feedback.
 * Chat's page uses it too, above its own full-height layout.
 */
export function SiteHeader({ notFound = false }: { notFound?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // The Worker renders a 404 at its own path (NOT_FOUND_PATH) and the page
  // hydrates at the address asked for (`/admin` for a non-admin), so a 404's
  // bar reads nothing from the path: server and client draw the same one.
  const current = notFound
    ? null
    : (PRODUCTS.find((p) => path.startsWith(p.to))?.id ?? null);
  return (
    <AppBar
      current={current}
      feedback={notFound ? null : feedbackProduct(path)}
      pathname={path}
      context={notFound ? null : pageContext(path)}
    />
  );
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
    <span className="flex items-center gap-1.5 font-semibold text-base">
      <page.icon size={15} aria-hidden="true" className="text-muted" />
      {page.label}
    </span>
  );
}

/** The one call to action off the scheduler: View schedule. */
export function OpenScheduleButton() {
  return (
    <WithTooltip label="Plan your classes">
      <Button asChild className="w-fit">
        <Link to={SCHEDULE_PATH}>View schedule</Link>
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
