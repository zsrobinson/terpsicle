import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { MessageSquareText } from "lucide-react";
import type { ReactNode } from "react";
import { HOME_PATH, tabBarAt } from "~/core/routing";
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
import { useIsMobile, useMediaQuery } from "~/hooks/use-media-query";
import { useScrolled } from "~/hooks/use-scrolled";
import { listedProducts, PRODUCTS, type ProductId } from "~/lib/products";
import {
  ActionMenuItem,
  ActionMenuSeparator,
  usePhoneMenus,
} from "~/ui/action-menu";
import { WithTooltip } from "~/ui/tooltip";
import { Mark } from "./brand/mark";
import { Wordmark } from "./brand/wordmark";
import { EarlyAccessChip } from "./early-access";
import { AboutItems, ProductMenu } from "./product-menu";
import { ThemeToggle } from "./theme-toggle";

// The one bar on every page (docs/COHESION.md §4, the "family bar"): the
// wordmark (a link to Home), the "Early access" chip and the five products as labeled tabs,
// in color order, then a divider and the product's own context (the term
// and plan, a course…), then its status, Share (a workbench's), the bell
// (signed in), the coffee button, Feedback and the account. Below 1100px
// the tabs fold into the product menu, whose trigger names the product
// you're in. The chip shows from 1536px, on every bar alike, so the tabs
// never move between products; narrower, the product menu says it.
//
// Below `md`, on a page with the phone's tab bar (~/components/tab-bar), the
// tab bar is how you move between products, so the bar keeps only the
// product's context (docs/decisions.md, "One bar at the top"): the term and
// plan, the room, "Settings"; on Home the wordmark; elsewhere the product's
// name, once the page's own title has scrolled under the bar. The account
// menu takes the product menu's About Terpsicle and Early access note.
// Phones fold the coffee button and the theme into the account menu, and
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
  share,
  feedback,
  pathname,
  compact = false,
  heading = false,
  crowdedBelow2xl = false,
  borderOnScroll = false,
}: {
  /** The product you're in; null on Settings and the site's own pages. */
  current: ProductId | null;
  /** After the divider: the term and plan, the course, the room. */
  context?: ReactNode;
  /** Before Feedback: credits, problems, "Offline". */
  status?: ReactNode;
  /** A workbench's Share, an icon beside the bell (`ShareButton`). */
  share?: ReactNode;
  /** Where feedback is filed; null where there's no Feedback (`/privacy`). */
  feedback: FeedbackProduct | null;
  /** Where an admin's pinned notes are looked up. */
  pathname: string;
  /** The scheduler's phone layout, which measures instead of using CSS. */
  compact?: boolean;
  /** The bar holds the page's h1 (the scheduler has no page title). */
  heading?: boolean;
  /**
   * Its context fills the bar below 1536px (the scheduler's term and plans):
   * there Feedback shows just its icon and the coffee button moves into the
   * account menu, so three plan tabs fit at 1440px and two at 1280. (The
   * Early access chip gives way below 1536px on every bar.)
   */
  crowdedBelow2xl?: boolean;
  /** Reviews' public pages: no rule under the bar until the page scrolls. */
  borderOnScroll?: boolean;
}) {
  // Below `md` the phone's tab bar moves between products, where the page
  // has one: the product menu gives way to the product's context.
  const tabbed = tabBarAt(pathname) !== null;
  const phoneMenus = usePhoneMenus();
  const phoneTitle = tabbed && !context;
  const scrolled = useScrolled(borderOnScroll || phoneTitle);
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
  // A crowded bar below 1536px gives its plans the room (e2e/shell's plan
  // tab widths): the coffee link moves to the menu.
  const roomBelow2xl = crowdedBelow2xl && !coffeeInMenu;
  const bellShown = useBellShown();
  const unreadNote = useUnreadNote();
  const Brand = heading ? "h1" : "div";
  return (
    <header
      data-slot="app-bar"
      // The shell's view transitions name the bar by this (transitions.css).
      data-family-bar=""
      // Which product's bar this is ("site" off the products), for tests.
      data-bar={current ?? "site"}
      className={cn(
        // 48px under whatever the status bar or the notch covers.
        "flex h-[calc(--spacing(12)+var(--safe-top))] shrink-0 items-center border-hairline border-b pt-(--safe-top)",
        borderOnScroll && !scrolled && "border-b-transparent",
        // The bar's rule appears with the small title, as iOS's bars do.
        phoneTitle && !scrolled && "max-md:border-b-transparent",
        compact ? "gap-1 px-2" : "gap-2 px-3",
      )}
    >
      {compact ? null : (
        <div className={cn("hidden items-center gap-1", WIDE)}>
          <Brand className="flex">
            {/* The wordmark goes Home (docs/decisions.md, "Home is the first
                tab on phones and the wordmark on desktop"). */}
            <WithTooltip label="Home">
              <Link to="/home" className="flex h-8 items-center gap-2 px-1">
                <Mark id="umbrella" size={20} label="Terpsicle" />
                <Wordmark />
              </Link>
            </WithTooltip>
          </Brand>
          {/* From 1536px only, on every bar: below that the scheduler's and
              Plan's bars need its room, and a chip on the other bars alone
              would move the tabs as you switch products. */}
          <EarlyAccessChip className="max-2xl:hidden" />
          <ProductTabs current={current} />
        </div>
      )}
      <Brand
        className={cn(
          "flex shrink-0",
          compact ? null : NARROW,
          tabbed && "max-md:hidden",
        )}
      >
        <ProductMenu current={current} compact={compact} />
      </Brand>
      {heading && tabbed ? (
        // A phone's bar has no product menu to be the page's heading: the
        // tab bar shows where you are, and this says it.
        <Brand className="sr-only md:hidden">
          {PRODUCTS.find((p) => p.id === current)?.label ?? "Terpsicle"}
        </Brand>
      ) : null}
      {context ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "h-5 w-px shrink-0 bg-hairline",
              compact ? "hidden" : "mx-1",
              tabbed && "max-md:hidden",
            )}
          />
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2",
              // Leading the bar, it lines up with the page's text below.
              tabbed && "max-md:pl-1",
            )}
          >
            {context}
          </div>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 items-center">
          {phoneTitle ? (
            <PhoneTitle
              current={current}
              home={pathname === HOME_PATH}
              shown={pathname === HOME_PATH || scrolled}
            />
          ) : null}
        </div>
      )}
      <div
        className={cn(
          "flex shrink-0 items-center",
          compact ? "gap-1" : "gap-3",
        )}
      >
        {status}
        {share}
        <NotificationsBell showButton={!crowded} />
        {feedback && !coffeeInMenu ? (
          <CoffeeButton
            labelFrom2xl={crowdedBelow2xl}
            className={roomBelow2xl ? "max-2xl:hidden" : undefined}
          />
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
              coffee={
                coffeeInMenu
                  ? "always"
                  : roomBelow2xl && feedback !== null
                    ? "below-2xl"
                    : "never"
              }
              bell={crowded && bellShown}
              about={tabbed && phoneMenus}
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
              // Below 1536px the 20px marks' extra width comes back out of
              // the padding, so two plan tabs show whole at 1280px.
              "max-2xl:gap-1 max-2xl:px-1.5",
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

/** From 1536px, where a crowded bar shows its coffee button again. */
const WIDE_2XL = "(min-width: 1536px)";

/** What a phone's bar moves into the account menu. */
function MenuItems({
  feedback,
  coffee,
  bell,
  about,
}: {
  feedback: boolean;
  /** "below-2xl": only where the bar hides its coffee button. */
  coffee: "always" | "below-2xl" | "never";
  bell: boolean;
  /** The product menu's foot, where the tab bar took its place. */
  about: boolean;
}) {
  // Read as the menu opens: it's only drawn then.
  const wide = useMediaQuery(WIDE_2XL);
  const coffeeShown = coffee === "always" || (coffee === "below-2xl" && !wide);
  if (!feedback && !coffeeShown && !bell && !about) return null;
  return (
    <>
      {feedback || coffeeShown || bell ? <ActionMenuSeparator /> : null}
      {bell ? <NotificationsMenuItem /> : null}
      {feedback ? (
        <ActionMenuItem
          icon={<MessageSquareText aria-hidden="true" className="text-muted" />}
          onSelect={() => openFeedbackSheet()}
        >
          Send feedback
        </ActionMenuItem>
      ) : null}
      {coffeeShown ? <CoffeeMenuItem /> : null}
      {about ? (
        <>
          <ActionMenuSeparator />
          <AboutItems />
        </>
      ) : null}
    </>
  );
}

/**
 * A phone's bar with no context of its own leads with where you are, quietly:
 * the wordmark on Home; a product's mark and name once the page's own title
 * has scrolled under the bar (the tab bar says it until then).
 */
function PhoneTitle({
  current,
  home,
  shown,
}: {
  current: ProductId | null;
  home: boolean;
  shown: boolean;
}) {
  const product = PRODUCTS.find((p) => p.id === current);
  if (!home && !product) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex min-w-0 items-center gap-1.5 pl-1 font-semibold text-base transition-opacity duration-(--dur-control) md:hidden",
        !shown && "opacity-0",
      )}
    >
      {home ? (
        <Wordmark />
      ) : product ? (
        <>
          <Mark id={product.id} size={20} />
          <span className="truncate">{product.label}</span>
        </>
      ) : null}
    </span>
  );
}
