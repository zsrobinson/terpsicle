import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "~/app/logo";
import { ADMIN_DECISIONS_PATH, ADMIN_PATH, STAY_PARAM } from "~/core/routing";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { AdminGate } from "./admin-gate";

// The frame for /admin and /admin/decisions (V2 §10): the logo, the panel's
// two pages, and one column. Deliberately plain and light: it loads none of
// the scheduler (so no theme menu, which lives in the scheduler's store; the
// system theme applies, as on the other pages around the scheduler).

const PAGES = [
  { to: ADMIN_PATH, label: "Queue", hint: "Held posts waiting for you" },
  {
    to: ADMIN_DECISIONS_PATH,
    label: "Decisions",
    hint: "Everything moderation decided, and how often it held",
  },
] as const;

export function AdminFrame({
  current,
  children,
}: {
  current: (typeof PAGES)[number]["to"];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-hairline border-b px-4">
        <WithTooltip label="About Terpsicle">
          <a href={`/?${STAY_PARAM}`} className="rounded-md">
            <Logo compact />
          </a>
        </WithTooltip>
        <span className="font-semibold">Admin</span>
        <nav aria-label="Admin" className="flex items-center gap-1">
          {PAGES.map((p) => (
            <WithTooltip key={p.to} label={p.hint}>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className={p.to === current ? "bg-hover text-fg" : undefined}
              >
                <Link
                  to={p.to}
                  aria-current={p.to === current ? "page" : undefined}
                >
                  {p.label}
                </Link>
              </Button>
            </WithTooltip>
          ))}
        </nav>
      </header>
      <AdminGate>
        <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-4 pb-8">
          {children}
        </main>
      </AdminGate>
    </div>
  );
}
