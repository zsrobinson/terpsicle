import { MessageSquareText } from "lucide-react";
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
import {
  ActionMenuItem,
  ActionMenuSeparator,
  usePhoneMenus,
} from "~/ui/action-menu";
import { AboutItems } from "./product-menu";
import { ThemeToggle } from "./theme-toggle";

// The account cluster (the owner, 2026-09-30): the end of the family bar,
// the same on every page, so no page reorders it or drops a label. Feedback
// (its icon and "Feedback" from 1100px), the bell (signed in), Support (the
// coffee button) and the account. Whatever a page adds (its status, its
// tools, Share) sits to the left of it (docs/COHESION.md §4). On phones,
// and on the scheduler's measured phone layout, the bell, Feedback and
// Support are items in the account menu, and the avatar wears the dot for
// what's unread.

export function AccountCluster({
  feedback,
  pathname,
  compact,
  crowded,
  tabbed,
}: {
  /** Where feedback is filed; null where there's no Feedback (`/privacy`). */
  feedback: FeedbackProduct | null;
  /** Where an admin's pinned notes are looked up. */
  pathname: string;
  /** The scheduler's phone layout, which measures instead of using CSS. */
  compact: boolean;
  /** A phone's bar, or `compact`: the cluster folds into the account menu. */
  crowded: boolean;
  /** The page has the phone's tab bar, which took the product menu's place. */
  tabbed: boolean;
}) {
  const phoneMenus = usePhoneMenus();
  // Until /api/me answers, a phone's Feedback doesn't show, so nothing
  // flashes before it moves into the menu.
  const accountLoading = useAccount((s) => s.status === "loading");
  const bellShown = useBellShown();
  const unreadNote = useUnreadNote();
  const inMenu = crowded && feedback !== null;
  return (
    <div
      data-slot="account-cluster"
      className="flex shrink-0 items-center gap-1"
    >
      {feedback ? (
        <FeedbackButton
          product={feedback}
          pathname={pathname}
          compact={compact}
          showButton={!inMenu && !(crowded && accountLoading)}
        />
      ) : null}
      <NotificationsBell showButton={!crowded} />
      {feedback && !inMenu ? <CoffeeButton /> : null}
      <AccountButton
        compact={compact}
        fallback={<ThemeToggle side="bottom" />}
        items={
          <MenuItems
            feedback={inMenu}
            bell={crowded && bellShown}
            about={tabbed && phoneMenus}
          />
        }
        note={crowded ? unreadNote : null}
      />
    </div>
  );
}

/** What a phone's bar moves into the account menu. */
function MenuItems({
  feedback,
  bell,
  about,
}: {
  /** Feedback and Support. */
  feedback: boolean;
  bell: boolean;
  /** The product menu's foot, where the tab bar took its place. */
  about: boolean;
}) {
  if (!feedback && !bell && !about) return null;
  return (
    <>
      {feedback || bell ? <ActionMenuSeparator /> : null}
      {feedback ? (
        <ActionMenuItem
          icon={<MessageSquareText aria-hidden="true" className="text-muted" />}
          onSelect={() => openFeedbackSheet()}
        >
          Send feedback
        </ActionMenuItem>
      ) : null}
      {bell ? <NotificationsMenuItem /> : null}
      {feedback ? <CoffeeMenuItem /> : null}
      {about ? (
        <>
          <ActionMenuSeparator />
          <AboutItems />
        </>
      ) : null}
    </>
  );
}
