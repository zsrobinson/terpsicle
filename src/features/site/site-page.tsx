import { Link, useRouterState } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import type { ReactNode } from "react";
import { AppBar } from "~/app/app-bar";
import { PRODUCTS } from "~/app/products";
import { feedbackProduct } from "~/core/feedback/path";
import { SCHEDULE_PATH } from "~/core/routing";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

// The frame for pages outside the scheduler (the coming-soon pages,
// `/privacy`, not found, Reviews, Todo, Plan, Settings): the family bar, one
// column, and a footer.

/**
 * How a page sits under the header:
 * - `note`: a narrow column a little way down (`/`, coming soon, `/privacy`);
 * - `reading`: a product's pages to read, from the top (Reviews);
 * - `app`: a product's own tool, wide, from the top (Todo's list and week);
 * - `wide`: a tool that uses the whole screen (Plan's semesters).
 */
export type SiteLayout = "note" | "reading" | "app" | "wide";

const MAIN: Record<SiteLayout, string> = {
  note: "max-w-[560px] pt-[12vh]",
  reading: "max-w-[720px] pt-6",
  app: "max-w-[1120px] pt-4",
  wide: "max-w-[1600px] pt-2",
};

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
      <main className={`mx-auto w-full flex-1 px-4 pb-8 ${MAIN[layout]}`}>
        {children}
      </main>
      <footer className="flex h-12 shrink-0 items-center gap-4 px-4 text-muted text-sm">
        <WithTooltip label="What Terpsicle keeps about you, and why">
          <Link to="/privacy" className="rounded-md hover:text-fg">
            Privacy
          </Link>
        </WithTooltip>
      </footer>
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
      context={
        !notFound && path.startsWith("/settings") ? (
          <span className="flex items-center gap-1.5 font-semibold text-base">
            <Settings size={15} aria-hidden="true" className="text-muted" />
            Settings
          </span>
        ) : null
      }
    />
  );
}

/** The one call to action off the scheduler: open it. */
export function OpenScheduleButton() {
  return (
    <WithTooltip label="Plan your classes">
      <Button asChild>
        <Link to={SCHEDULE_PATH}>Open the scheduler</Link>
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
      <h1 className="mb-1.5 font-semibold text-xl tracking-tight">{title}</h1>
      <p className="mb-6 text-muted">Coming soon. {children}</p>
      <OpenScheduleButton />
    </SitePage>
  );
}
