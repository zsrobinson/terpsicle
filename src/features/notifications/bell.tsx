import { cn } from "cn";
import { Bell } from "lucide-react";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { create } from "zustand";
import { bellCount, bellLabel } from "~/core/notifications/bell";
import { useAccount } from "~/features/auth/account-store";
import { useIsMobile } from "~/hooks/use-media-query";
import { track } from "~/lib/analytics";
import { DropdownMenuItem } from "~/ui/dropdown-menu";
import { quietTooltips, WithTooltip } from "~/ui/tooltip";
import { useUnread, useUnreadPolling } from "./unread-store";

// The bell in the family bar (docs/V2.md §6.7), signed in only: the unread
// count, and Notifications behind it, a popover on desktop and a sheet on
// phones. Only the bell and its count are eager; the list, its words and
// the client load on first hover, focus or open (./inbox.tsx). Where a
// phone's bar is crowded (the scheduler, Chat's term), the bell moves into
// the account menu, the way Send feedback does, and the avatar wears a dot.

const loadInbox = () => import("./inbox");

const InboxSurface = lazy(() =>
  loadInbox().then((m) => ({ default: m.InboxSurface })),
);

function prefetch() {
  void loadInbox();
}

// Each page brings its own bar (the site's pages, Chat, Plan, the
// scheduler), so a page change swaps this bell for the next page's. The
// router shows the new address first and the new page a moment later, and
// the old bar still works in between. So the list's state isn't the bell's
// own: a list opened in between stays open when the page arrives. And focus
// on the bell, which would fall to the page with the old bar, goes to the
// new bell.

/** Whether Notifications is open: one list, whichever bar is showing it. */
const useOpen = create<{ open: boolean }>(() => ({ open: false }));

function setOpen(open: boolean): void {
  if (useOpen.getState().open === open) return;
  useOpen.setState({ open });
  if (open) track("notifications_opened", {});
}

/** The bell on the page, and whether the one before it left with focus. */
let shownBell: HTMLButtonElement | null = null;
let focusCarried = false;

/** A bell's ref: tracks the one on the page, and passes focus along. */
function bellMounted(bell: HTMLButtonElement): () => void {
  shownBell = bell;
  if (focusCarried && document.activeElement === document.body) {
    // No tooltip over the page that just arrived.
    quietTooltips();
    bell.focus({ preventScroll: true });
  }
  focusCarried = false;
  return () => {
    // Refs detach before the old bar leaves the document: it still has focus.
    if (document.activeElement === bell) {
      focusCarried = true;
      // Only the bell that replaces it, in the same commit, takes it.
      queueMicrotask(() => {
        focusCarried = false;
      });
    }
    if (shownBell === bell) shownBell = null;
  };
}

/**
 * Where the list hands focus as it closes: the bell on the page now, a new
 * one if the page changed as it closed. Not when the list is only moving to
 * the next page's bar, still open.
 */
function returnFocus(): void {
  if (!useOpen.getState().open) shownBell?.focus();
}

/** Opens Notifications, from the bell or the account menu. */
export function openNotifications(): void {
  prefetch();
  setOpen(true);
}

/** Test hook: closed, with no bell on the page. */
export function forgetBell(): void {
  useOpen.setState({ open: false });
  shownBell = null;
  focusCarried = false;
}

/** Whether the bell belongs on this page: signed in, and /api/me has answered. */
export function useBellShown(): boolean {
  return useAccount((s) => s.status === "signed-in" && s.user !== null);
}

/**
 * The bell, and the list it opens. Mounted wherever the bar is; with
 * `showButton` false (a crowded phone bar) the account menu opens it
 * instead (`openNotifications`). Keeps the count fresh either way.
 */
export function NotificationsBell({
  showButton = true,
}: {
  showButton?: boolean;
}) {
  const shown = useBellShown();
  useUnreadPolling(shown);
  const unread = useUnread((s) => s.unread) ?? 0;
  const mobile = useIsMobile();
  const button = useRef<HTMLButtonElement | null>(null);
  const bellRef = useCallback((bell: HTMLButtonElement) => {
    button.current = bell;
    const unmounted = bellMounted(bell);
    return () => {
      unmounted();
      button.current = null;
    };
  }, []);
  const open = useOpen((s) => s.open);
  // Mounted from the first open on, so it can animate away.
  const [used, setUsed] = useState(open);
  if (open && !used) setUsed(true);

  if (!shown) return null;
  return (
    <>
      {showButton ? (
        <WithTooltip label="Notifications" side="bottom">
          <button
            ref={bellRef}
            type="button"
            aria-label={bellLabel(unread)}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-state={open ? "open" : "closed"}
            data-testid="notifications-bell"
            onPointerEnter={prefetch}
            onFocus={prefetch}
            onClick={() => setOpen(!open)}
            className="relative flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg max-[380px]:size-7"
          >
            <Bell size={16} aria-hidden="true" />
            {unread > 0 ? <BellCount unread={unread} /> : null}
          </button>
        </WithTooltip>
      ) : null}
      {used ? (
        <Suspense fallback={null}>
          <InboxSurface
            open={open}
            onOpenChange={setOpen}
            anchor={button}
            returnFocus={returnFocus}
            mobile={mobile || !showButton}
          />
        </Suspense>
      ) : null}
    </>
  );
}

/** The count on the bell: ink on paper, square, "9+" past nine. */
function BellCount({ unread }: { unread: number }) {
  return (
    <span
      aria-hidden="true"
      data-testid="notifications-count"
      className="tnum absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center bg-fg px-1 font-semibold text-2xs text-bg"
    >
      {bellCount(unread)}
    </span>
  );
}

/** The account menu's way in, where a phone's bar has no room for the bell. */
export function NotificationsMenuItem() {
  const unread = useUnread((s) => s.unread) ?? 0;
  return (
    <DropdownMenuItem
      onSelect={() => openNotifications()}
      onPointerEnter={prefetch}
      onFocus={prefetch}
    >
      <Bell aria-hidden="true" className="text-muted" />
      <span className="flex-1">Notifications</span>
      {unread > 0 ? (
        <span className={cn("tnum text-muted text-sm")}>{unread} unread</span>
      ) : null}
    </DropdownMenuItem>
  );
}

/** Words for the avatar when the bell is in its menu: "3 unread notifications". */
export function useUnreadNote(): string | null {
  const unread = useUnread((s) => s.unread) ?? 0;
  if (unread === 0) return null;
  return unread === 1
    ? "1 unread notification"
    : `${unread} unread notifications`;
}
