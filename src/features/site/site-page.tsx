import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "~/app/logo";
import { SCHEDULE_PATH } from "~/core/site";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

// The frame for pages outside the scheduler (`/`, the coming-soon stubs,
// `/privacy`): the logo, one column, and a footer. Deliberately plain; the
// brand track will restyle these.

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center px-4">
        <WithTooltip label="Terpsicle home">
          <Link to="/" aria-label="Terpsicle home" className="rounded-md">
            <Logo />
          </Link>
        </WithTooltip>
      </header>
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 pt-[12vh] pb-8">
        {children}
      </main>
      <footer className="flex h-12 shrink-0 items-center gap-4 px-4 text-muted text-sm">
        <WithTooltip label="How Terpsicle handles your data">
          <Link to="/privacy" className="rounded-md hover:text-fg">
            Privacy
          </Link>
        </WithTooltip>
      </footer>
    </div>
  );
}

/** The one call to action off the scheduler: open it. */
export function OpenScheduleButton({
  label = "Open Terpsicle",
}: {
  label?: string;
}) {
  return (
    <WithTooltip label="Go to the scheduler">
      <Button asChild>
        <Link to={SCHEDULE_PATH}>{label}</Link>
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
      <OpenScheduleButton label="Open the scheduler" />
    </SitePage>
  );
}
