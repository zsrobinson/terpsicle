import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { MessageSquareText } from "lucide-react";
import type { ReactNode } from "react";
import { STAY_PARAM } from "~/core/routing";
import type { FeedbackProduct } from "~/core/schema/feedback";
import { AccountButton } from "~/features/auth/account-button";
import { useAccount } from "~/features/auth/account-store";
import { CoffeeButton, CoffeeMenuItem } from "~/features/coffee/coffee-button";
import {
  FeedbackButton,
  openFeedbackSheet,
} from "~/features/feedback/feedback-button";
import {
  NotificationsBell,
  NotificationsMenuItem,
  useBellShown,
  useUnreadNote,
} from "~/features/notifications/bell";
import { DropdownMenuItem, DropdownMenuSeparator } from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import { Mark } from "./brand/mark";
import { Wordmark } from "./brand/wordmark";
import { EarlyAccessChip } from "./early-access";
import { ProductMenu } from "./product-menu";
import { listedProducts, type ProductId } from "./products";
import { ThemeToggle } from "./theme-toggle";
import { useIsMobile } from "./use-media-query";

// The one bar on every page (docs/COHESION.md §4, the "family bar"): the
// wordmark, the "Early access" chip and the five products as labeled tabs,
// in color order, then a divider and the product's own context (the term
// and plan, a course…), then its status, the bell (signed in), the coffee
// button, Feedback and the account. Below 1100px the tabs fold into the
// product menu, whose trigger names the product you're in, and the chip
// stays only where the bar has no context (the menu says it too); phones
// fold the coffee button and the theme into the account menu, and
// Feedback and the bell too where the bar is crowded. The same bar,
// everywhere.

/** Where the tabs fit beside the scheduler's term and plans. */
const WIDE = "min-[1100px]:flex";
const NARROW = "min-[1100px]:hidden";

/** The product you're on wears its soft color, as in the product menu. */
const CURRENT: Record<ProductId, string> = {
  schedule: "aria-[current=page]:bg-product-schedule-soft",
  reviews: "aria-[current=page]:bg-product-reviews-soft",
  chat: "aria-[current=page]:bg-product-chat-soft",
  plan: "aria-[current=page]:bg-product-plan-soft",
  todo: "aria-[current=page]:bg-product-todo-soft",
};

export function AppBar({
  current,
  context,
  status,
  feedback,
  pathname,
  compact = false,
  heading = false,
  crowdedBelow2xl = false,
}: {
  /** The product you're in; null on Settings and the site's own pages. */
  current: ProductId | null;
  /** After the divider: the term and plan, the course, the room. */
  context?: ReactNode;
  /** Before Feedback: credits, problems, "Offline". */
  status?: ReactNode;
  /** Where feedback is filed; null where there's no Feedback (`/privacy`). */
  feedback: FeedbackProduct | null;
  /** Where an admin's pinned notes are looked up. */
  pathname: string;
  /** The scheduler's phone layout, which measures instead of using CSS. */
  compact?: boolean;
  /** The bar holds the page's h1 (the scheduler has no page title). */
  heading?: boolean;
  /** Its context fills the bar below 1536px (the scheduler's term and plans): Feedback shows just its icon there. */
  crowdedBelow2xl?: boolean;
}) {
  // Phones: where the bar also carries the product's context (the scheduler,
  // Chat's term), "Send feedback" and the bell move into the account menu so
  // the context reads whole; the avatar wears a dot for what's unread. Until
  // /api/me answers, neither shows, so nothing flashes.
  const accountLoading = useAccount((s) => s.status === "loading");
  const mobile = useIsMobile();
  const crowded = compact || (mobile && context != null);
  const feedbackInMenu = crowded && feedback !== null;
  // A phone's bar has no room for another icon beside Feedback and the
  // account: the coffee link is always in the account menu there.
  const coffeeInMenu = (compact || mobile) && feedback !== null;
  const bellShown = useBellShown();
  const unreadNote = useUnreadNote();
  const Brand = heading ? "h1" : "div";
  return (
    <header
      data-slot="app-bar"
      className={cn(
        "flex h-12 shrink-0 items-center border-hairline border-b",
        compact ? "gap-1 px-2" : "gap-2 px-3",
      )}
    >
      {compact ? null : (
        <div className={cn("hidden items-center gap-1", WIDE)}>
          <Brand className="flex">
            <WithTooltip label="About Terpsicle">
              {/* ?stay: returning visitors would otherwise skip to the scheduler. */}
              <a
                href={`/?${STAY_PARAM}`}
                className="flex h-8 items-center gap-2 px-1"
              >
                <Mark id="umbrella" size={20} label="Terpsicle" />
                <Wordmark />
              </a>
            </WithTooltip>
          </Brand>
          <EarlyAccessChip />
          <ProductTabs current={current} />
        </div>
      )}
      <Brand className={cn("flex shrink-0", compact ? null : NARROW)}>
        <ProductMenu current={current} compact={compact} />
      </Brand>
      {compact || context ? null : (
        // Phones keep the room; the product menu says it there.
        <EarlyAccessChip className="ml-1 hidden sm:max-[1100px]:inline-flex" />
      )}
      {context ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "h-5 w-px shrink-0 bg-hairline",
              compact ? "hidden" : "mx-1",
            )}
          />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {context}
          </div>
        </>
      ) : (
        <div className="flex-1" />
      )}
      <div
        className={cn(
          "flex shrink-0 items-center",
          compact ? "gap-1" : "gap-3",
        )}
      >
        {status}
        <NotificationsBell showButton={!crowded} />
        {feedback && !coffeeInMenu ? (
          <CoffeeButton labelFrom2xl={crowdedBelow2xl} />
        ) : null}
        {feedback ? (
          <FeedbackButton
            product={feedback}
            pathname={pathname}
            compact={compact}
            showButton={!feedbackInMenu && !(crowded && accountLoading)}
            labelFrom2xl={crowdedBelow2xl}
          />
        ) : null}
        <AccountButton
          compact={compact}
          fallback={<ThemeToggle side="bottom" />}
          items={
            <MenuItems
              feedback={feedbackInMenu}
              coffee={coffeeInMenu}
              bell={crowded && bellShown}
            />
          }
          note={crowded ? unreadNote : null}
        />
      </div>
    </header>
  );
}

/** The five products, labeled, as tabs; each a link, the current one tinted. */
function ProductTabs({ current }: { current: ProductId | null }) {
  const flags = useAccount((s) => s.flags);
  return (
    <nav aria-label="Products" className="ml-1 flex items-center gap-0.5">
      {listedProducts(flags, current).map((p) => (
        <WithTooltip key={p.id} label={p.view} side="bottom">
          <Link
            to={p.to}
            aria-current={p.id === current ? "page" : undefined}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 font-medium text-base text-muted transition-colors hover:bg-hover hover:text-fg aria-[current=page]:text-fg",
              CURRENT[p.id],
            )}
          >
            <Mark id={p.id} size={20} />
            {p.label}
          </Link>
        </WithTooltip>
      ))}
    </nav>
  );
}

/** What a phone's bar moves into the account menu. */
function MenuItems({
  feedback,
  coffee,
  bell,
}: {
  feedback: boolean;
  coffee: boolean;
  bell: boolean;
}) {
  if (!feedback && !coffee && !bell) return null;
  return (
    <>
      <DropdownMenuSeparator />
      {bell ? <NotificationsMenuItem /> : null}
      {feedback ? (
        <DropdownMenuItem onSelect={() => openFeedbackSheet()}>
          <MessageSquareText aria-hidden="true" className="text-muted" />
          Send feedback
        </DropdownMenuItem>
      ) : null}
      {coffee ? <CoffeeMenuItem /> : null}
    </>
  );
}
