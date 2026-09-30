import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import type { ReactNode } from "react";
import { HOME_PATH, tabBarAt } from "~/core/routing";
import type { FeedbackProduct } from "~/core/schema/feedback";
import { useIsMobile } from "~/hooks/use-media-query";
import { useScrolled } from "~/hooks/use-scrolled";
import { PRODUCTS, type ProductId } from "~/lib/products";
import { WithTooltip } from "~/ui/tooltip";
import { AccountCluster } from "./account-cluster";
import { Mark } from "./brand/mark";
import { Wordmark } from "./brand/wordmark";
import { EarlyAccessChip } from "./early-access";
import { ProductMenu } from "./product-menu";
import { ProductTabs } from "./product-tabs";

// The one bar on every page (docs/COHESION.md §4, the "family bar"): the
// wordmark (a link to Home), the "Early access" chip and the five products
// as tabs (./product-tabs: the one you're in named, the others marks that
// open their names one at a time), in color order, then a divider and the
// product's own context (the term and plan, a course…). At its end, the
// page's own controls in one order (its status, its tools, then Share), and
// then the account cluster, the same on every page: Feedback, the bell,
// Support and the account (./account-cluster). Below 1100px the tabs fold
// into the product menu, whose trigger names the product you're in. The chip
// shows from 1536px, on every bar alike, so the tabs never move between
// products; narrower, the product menu says it.
//
// Below `md`, on a page with the phone's tab bar (~/components/tab-bar), the
// tab bar is how you move between products, so the bar keeps only the
// product's context (docs/decisions.md, "One bar at the top"): the term and
// plan, the room, "Settings"; on Home the wordmark; a Reviews course's code;
// elsewhere the product's name. The left side is never empty, at rest or
// scrolled (`PhoneTitle`). The account menu takes the product menu's About
// Terpsicle and Early access note, and the bell, Support and Feedback, so
// every phone bar is its title, its status and Share, and the avatar
// (docs/decisions.md, "Crowded bars give their context the room"). The same
// bar, everywhere.

/** Where the tabs fit beside the scheduler's term and plans. */
const WIDE = "min-[1100px]:flex";
const NARROW = "min-[1100px]:hidden";

export function AppBar({
  current,
  context,
  status,
  share,
  feedback,
  pathname,
  compact = false,
  heading = false,
  borderOnScroll = false,
  phoneTitle,
}: {
  /** The product you're in; null on Settings and the site's own pages. */
  current: ProductId | null;
  /** After the divider: the term and plan, the course, the room. */
  context?: ReactNode;
  /**
   * Before Share: the page's status (saved or syncing, then counts: credits,
   * problems, "Offline"), then its tools (Reviews' search, Todo's buttons).
   */
  status?: ReactNode;
  /** A workbench's Share, an icon before the account cluster (`ShareButton`). */
  share?: ReactNode;
  /** Where feedback is filed; null where there's no Feedback (`/privacy`). */
  feedback: FeedbackProduct | null;
  /** Where an admin's pinned notes are looked up. */
  pathname: string;
  /** The scheduler's phone layout, which measures instead of using CSS. */
  compact?: boolean;
  /** The bar holds the page's h1 (the scheduler has no page title). */
  heading?: boolean;
  /** Reviews' public pages: no rule under the bar until the page scrolls. */
  borderOnScroll?: boolean;
  /**
   * What a phone's bar leads with where it has no context: the thing you're
   * in (a Reviews course's code), as a Label. Without it, the product's name.
   */
  phoneTitle?: ReactNode;
}) {
  // Below `md` the phone's tab bar moves between products, where the page
  // has one: the product menu gives way to the product's context.
  const tabbed = tabBarAt(pathname) !== null;
  const titled = tabbed && !context;
  const scrolled = useScrolled(borderOnScroll || titled);
  const mobile = useIsMobile();
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
        titled && !scrolled && "max-md:border-b-transparent",
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
          <EarlyAccessChip className="max-2xl:hidden" Tooltip={WithTooltip} />
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
          {titled ? (
            <PhoneTitle
              current={current}
              home={pathname === HOME_PATH}
              title={phoneTitle}
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
        <AccountCluster
          feedback={feedback}
          pathname={pathname}
          compact={compact}
          crowded={compact || mobile}
          tabbed={tabbed}
        />
      </div>
    </header>
  );
}

/**
 * A phone's bar with no context of its own leads with where you are, at rest
 * and scrolled, so its left side is never empty: the wordmark on Home; the
 * thing you're in where the page names one (a Reviews course's code), as a
 * Label; otherwise the product's mark and name, as a Heading
 * (docs/DESIGN.md §7.8). The page's own title says it to a screen reader.
 */
function PhoneTitle({
  current,
  home,
  title,
}: {
  current: ProductId | null;
  home: boolean;
  title?: ReactNode;
}) {
  const product = PRODUCTS.find((p) => p.id === current);
  if (!home && !product && title === undefined) return null;
  return (
    <span
      aria-hidden="true"
      data-phone-title=""
      className="flex min-w-0 items-center gap-1.5 pl-1 text-base md:hidden"
    >
      {home ? (
        <Wordmark />
      ) : (
        <>
          {product ? <Mark id={product.id} size={20} /> : null}
          {title !== undefined ? (
            <span className="emph-label truncate">{title}</span>
          ) : product ? (
            <span className="emph-heading truncate">{product.label}</span>
          ) : null}
        </>
      )}
    </span>
  );
}
