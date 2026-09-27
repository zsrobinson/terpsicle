import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import type { ReactNode } from "react";
import { Logo } from "~/app/logo";
import {
  ADMIN_DECISIONS_PATH,
  ADMIN_FEEDBACK_PATH,
  ADMIN_KIT_PATH,
  ADMIN_PATH,
  STAY_PARAM,
} from "~/core/routing";
import { FeedbackButton } from "~/features/feedback/feedback-button";
import { Button } from "~/ui/button";
import { PAGE_WIDTH } from "~/ui/product-page";
import { WithTooltip } from "~/ui/tooltip";
import { AdminGate } from "./admin-gate";

// The frame for the admin pages (V2 §10): the logo, the panel's pages, and
// one column. Deliberately plain and light: it loads none of
// the scheduler (so no theme menu, which lives in the scheduler's store; the
// system theme applies, as on the other pages around the scheduler).

const PAGES = [
  { to: ADMIN_PATH, label: "Queue", hint: "Held posts waiting for you" },
  {
    to: ADMIN_DECISIONS_PATH,
    label: "Decisions",
    hint: "Everything moderation decided, and how often it held",
  },
  {
    to: ADMIN_FEEDBACK_PATH,
    label: "Feedback",
    hint: "Bugs, ideas and pinned notes people sent",
  },
  {
    to: ADMIN_KIT_PATH,
    label: "Kit",
    hint: "Every piece of the page kit, in every state",
  },
] as const;

export function AdminFrame({
  current,
  width = "reading",
  children,
}: {
  current: (typeof PAGES)[number]["to"];
  /** The page kit's widths; the kit's side-by-side demos need `app`. */
  width?: "reading" | "app";
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
        {/* Phones: four pages and the icons fit at 390px only without the
            word; the nav scrolls on its own before the page ever would. */}
        <span className="font-semibold max-sm:sr-only">Admin</span>
        <nav
          aria-label="Admin"
          className="flex min-w-0 items-center gap-1 overflow-x-auto"
        >
          {PAGES.map((p) => (
            <WithTooltip key={p.to} label={p.hint}>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  "max-sm:px-1.5",
                  p.to === current && "bg-hover text-fg",
                )}
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
        {/* The owner's notes on the panel itself ("Pin a note"); the icon
            alone, beside the Feedback page's own tab. */}
        <span className="ml-auto">
          <FeedbackButton product="admin" pathname={current} compact />
        </span>
      </header>
      <AdminGate>
        <main
          className={cn(
            "mx-auto w-full flex-1 px-4 pt-4 pb-8",
            PAGE_WIDTH[width],
          )}
        >
          {children}
        </main>
      </AdminGate>
    </div>
  );
}
