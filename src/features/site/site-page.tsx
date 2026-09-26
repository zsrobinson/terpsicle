import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Mark } from "~/app/brand/mark";
import { Logo } from "~/app/logo";
import { PRODUCTS, type ProductId } from "~/app/products";
import { SCHEDULE_PATH, STAY_PARAM } from "~/core/routing";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

// The frame for pages outside the scheduler (`/`, the coming-soon pages,
// `/privacy`, not found): the product menu, one column, and a footer.

/** The product you're on wears its soft color, as in the product menu. */
const CURRENT: Record<ProductId, string> = {
  schedule: "aria-[current=page]:bg-product-schedule-soft",
  reviews: "aria-[current=page]:bg-product-reviews-soft",
  chat: "aria-[current=page]:bg-product-chat-soft",
};

export function SitePage({
  children,
  actions,
  wide = false,
}: {
  children: ReactNode;
  /** The right end of the header (the account link, on Reviews). */
  actions?: ReactNode;
  /** A product's pages (Reviews) read wider than a note, and start higher. */
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 px-4">
        <WithTooltip label="About Terpsicle">
          {/* ?stay: returning visitors would otherwise skip to the scheduler. */}
          <a href={`/?${STAY_PARAM}`} className="flex">
            <Logo />
          </a>
        </WithTooltip>
        {/* The product menu's links, flat: these pages stay light (no menu code). */}
        <div className="flex items-center gap-2">
          <nav aria-label="Products" className="flex items-center gap-1">
            {PRODUCTS.map((p) => (
              <WithTooltip key={p.to} label={p.view}>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className={`aria-[current=page]:text-fg ${CURRENT[p.id]}`}
                >
                  <Link to={p.to} activeProps={{ "aria-current": "page" }}>
                    {/* size-4: the button shrinks unsized icons. */}
                    <Mark id={p.id} size={16} className="size-4" />
                    {/* With actions beside them, phones show the marks only. */}
                    <span className={actions ? "max-sm:sr-only" : undefined}>
                      {p.label}
                    </span>
                  </Link>
                </Button>
              </WithTooltip>
            ))}
          </nav>
          {actions}
        </div>
      </header>
      <main
        className={
          wide
            ? "mx-auto w-full max-w-[720px] flex-1 px-4 pt-6 pb-8"
            : "mx-auto w-full max-w-[560px] flex-1 px-4 pt-[12vh] pb-8"
        }
      >
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
