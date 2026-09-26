import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "~/app/logo";
import { PRODUCTS } from "~/app/products";
import { SCHEDULE_PATH, STAY_PARAM } from "~/core/routing";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

// The frame for pages outside the scheduler (`/`, the coming-soon pages,
// `/privacy`, not found): the product menu, one column, and a footer.
// Deliberately plain; the brand track will restyle these.

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 px-4">
        <WithTooltip label="About Terpsicle">
          {/* ?stay: returning visitors would otherwise skip to the scheduler. */}
          <a href={`/?${STAY_PARAM}`} className="rounded-md">
            <Logo />
          </a>
        </WithTooltip>
        {/* The product menu's links, flat: these pages stay light (no menu code). */}
        <nav aria-label="Products" className="flex items-center gap-1">
          {PRODUCTS.map((p) => (
            <WithTooltip key={p.to} label={p.hint}>
              <Button variant="ghost" size="sm" asChild>
                <Link to={p.to} activeProps={{ "aria-current": "page" }}>
                  {p.label}
                </Link>
              </Button>
            </WithTooltip>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 pt-[12vh] pb-8">
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
