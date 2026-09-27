import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Mark } from "~/app/brand/mark";
import { Logo } from "~/app/logo";
import { listedProducts, PRODUCTS, type ProductId } from "~/app/products";
import { feedbackProduct } from "~/core/feedback/path";
import { SCHEDULE_PATH, STAY_PARAM } from "~/core/routing";
import { useAccount } from "~/features/auth/account-store";
import { FeedbackButton } from "~/features/feedback/feedback-button";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

// The frame for pages outside the scheduler (`/`, the coming-soon pages,
// `/privacy`, not found, Todo): the product menu, one column, and a footer.

/** The product you're on wears its soft color, as in the product menu. */
const CURRENT: Record<ProductId, string> = {
  schedule: "aria-[current=page]:bg-product-schedule-soft",
  reviews: "aria-[current=page]:bg-product-reviews-soft",
  chat: "aria-[current=page]:bg-product-chat-soft",
  plan: "aria-[current=page]:bg-product-plan-soft",
  todo: "aria-[current=page]:bg-product-todo-soft",
};

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
  actions,
}: {
  children: ReactNode;
  layout?: SiteLayout;
  /** The right end of the header, after the products and "Send feedback" (Reviews' account link). */
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <SiteHeader actions={actions} />
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
 * The header of pages outside the scheduler: the logo, the products as flat
 * links (no menu code, so these pages stay light) and `actions` at the end.
 * Chat's page uses it too, above its own full-height layout.
 */
export function SiteHeader({
  actions,
  className = "",
}: {
  actions?: ReactNode;
  className?: string;
}) {
  const flags = useAccount((s) => s.flags);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const current = PRODUCTS.find((p) => path.startsWith(p.to))?.id ?? null;
  const feedback = feedbackProduct(path);
  return (
    <header
      className={`flex h-12 shrink-0 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 ${className}`}
    >
      <WithTooltip label="About Terpsicle">
        {/* ?stay: returning visitors would otherwise skip to the scheduler. */}
        <a href={`/?${STAY_PARAM}`} className="flex">
          <Logo />
        </a>
      </WithTooltip>
      <div className="flex items-center gap-1 sm:gap-2">
        {/* The product menu's links, flat: these pages stay light (no menu code). */}
        <nav aria-label="Products" className="flex items-center sm:gap-1">
          {listedProducts(flags, current).map((p) => (
            <WithTooltip key={p.to} label={p.view}>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className={`max-sm:px-1.5 aria-[current=page]:text-fg ${CURRENT[p.id]}`}
              >
                <Link to={p.to} activeProps={{ "aria-current": "page" }}>
                  {/* size-4: the button shrinks unsized icons. */}
                  <Mark id={p.id} size={16} className="size-4" />
                  {/* Phones name only the product you're on: every mark
                      and one name fit beside the logo at 390px. */}
                  <span className="max-sm:not-in-aria-[current=page]:sr-only">
                    {p.label}
                  </span>
                </Link>
              </Button>
            </WithTooltip>
          ))}
        </nav>
        {/* Only on product pages: not on `/` or `/privacy`. */}
        {feedback ? (
          <FeedbackButton product={feedback} pathname={path} />
        ) : null}
        {actions}
      </div>
    </header>
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
