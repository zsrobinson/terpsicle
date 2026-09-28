import { cn } from "cn";
import { Bell } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { create } from "zustand";
import { track } from "~/app/analytics";
import { useIsMobile } from "~/app/use-media-query";
import { bellCount, bellLabel } from "~/core/notifications/bell";
import { useAccount } from "~/features/auth/account-store";
import { DropdownMenuItem } from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
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

/** Opens from elsewhere: the account menu's item on a crowded phone bar. */
const requests = create<{ count: number }>(() => ({ count: 0 }));

/** Opens Notifications, from the bell or the account menu. */
export function openNotifications(): void {
  prefetch();
  requests.setState((s) => ({ count: s.count + 1 }));
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
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Mounted from the first open on, so it can animate away.
  const [used, setUsed] = useState(false);
  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setUsed(true);
      track("notifications_opened", {});
    }
  }, []);
  const requested = requests((s) => s.count);
  // Only requests made while this bell is on the page.
  const handled = useRef(requested);
  useEffect(() => {
    if (requested > handled.current) onOpenChange(true);
    handled.current = requested;
  }, [requested, onOpenChange]);

  if (!shown) return null;
  return (
    <>
      {showButton ? (
        <WithTooltip label="Notifications" side="bottom">
          <button
            ref={button}
            type="button"
            aria-label={bellLabel(unread)}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-state={open ? "open" : "closed"}
            data-testid="notifications-bell"
            onPointerEnter={prefetch}
            onFocus={prefetch}
            onClick={() => onOpenChange(!open)}
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
            onOpenChange={onOpenChange}
            anchor={button}
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
