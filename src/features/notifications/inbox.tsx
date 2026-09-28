import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
} from "react";
import { create } from "zustand";
import { Mark } from "~/components/brand/mark";
import { PanelBody, PanelFooter, PanelNote } from "~/components/panel";
import {
  appendInboxPage,
  inboxDays,
  inboxMeta,
  markInboxRead,
} from "~/core/notifications/bell";
import type { InboxItem, InboxProduct } from "~/core/schema/notifications";
import { track } from "~/lib/analytics";
import { notificationsApi } from "~/server/fns/notifications";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { GroupHeader, ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { Popover, PopoverAnchor, PopoverContent } from "~/ui/popover";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { RowSkeleton } from "~/ui/skeleton";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { gotUnread, useUnread } from "./unread-store";

// Notifications, behind the bell (docs/V2.md §6.7; the design's desktop
// inbox): "Notifications" and "Mark all read", then Today, Yesterday and
// Earlier, each row its product's mark, a bold title, the words, "Chat ·
// 2m" and a dot while it's unread, and "Notification settings" at the
// foot. A popover under the bell on desktop, the kit's sheet on phones.
// Loaded on the bell's first hover, focus or open (./bell.tsx).

type InboxState = {
  status: "idle" | "loading" | "ready" | "failed";
  items: InboxItem[];
  /** The next page's cursor; null on the last. */
  next: string | null;
  more: "idle" | "loading" | "failed";
};

const EMPTY: InboxState = {
  status: "idle",
  items: [],
  next: null,
  more: "idle",
};

/** The list as last loaded: opening again shows it at once while it refreshes. */
export const useInbox = create<InboxState>(() => EMPTY);

/** Test hook: nothing loaded. */
export function forgetInbox(): void {
  useInbox.setState(EMPTY, true);
}

/** Loads the newest page. What's shown stays while it does. */
export async function refreshInbox(): Promise<void> {
  useInbox.setState((s) => ({
    status: s.status === "ready" ? "ready" : "loading",
  }));
  try {
    const page = await notificationsApi.inbox({});
    gotUnread(page.unread);
    useInbox.setState({
      status: "ready",
      items: page.items,
      next: page.next,
      more: "idle",
    });
  } catch {
    // What was shown stays; with nothing shown, the list says so.
    useInbox.setState((s) => ({
      status: s.status === "ready" ? "ready" : "failed",
    }));
  }
}

/** Adds the next older page under the list. */
async function loadOlder(): Promise<void> {
  const { next } = useInbox.getState();
  if (!next) return;
  useInbox.setState({ more: "loading" });
  try {
    const page = await notificationsApi.inbox({ before: next });
    useInbox.setState((s) => ({
      items: appendInboxPage(s.items, page.items),
      next: page.next,
      more: "idle",
    }));
  } catch {
    useInbox.setState({ more: "failed" });
  }
}

/** Reads one item, or (with none) everything; the bell and badge follow. */
async function markRead(item?: InboxItem): Promise<void> {
  if (item && item.readAt !== null) return;
  const before = useInbox.getState().items;
  const unreadBefore = useUnread.getState().unread;
  const at = new Date().toISOString();
  // Shown read at once; the server's count follows.
  useInbox.setState({
    items: markInboxRead(before, at, item ? [item.id] : undefined),
  });
  gotUnread(item ? Math.max(0, (unreadBefore ?? 1) - 1) : 0);
  try {
    const { unread } = await notificationsApi.read(
      item ? { ids: [item.id] } : { all: true },
    );
    gotUnread(unread);
  } catch {
    useInbox.setState({ items: before });
    if (unreadBefore !== null) gotUnread(unreadBefore);
    if (!item)
      noteToast("We couldn't mark them read. Check your connection.", {
        retry: () => void markRead(),
      });
  }
}

/** A row's product mark; admin items wear the umbrella. */
function ProductMark({ product }: { product: InboxProduct }) {
  return (
    <Mark
      id={product === "admin" ? "umbrella" : product}
      size={20}
      className="mt-px size-5"
    />
  );
}

/** Where a row goes when a finger or pointer opens it. */
function useOpenItem(close: () => void) {
  const navigate = useNavigate();
  return (event: MouseEvent<HTMLAnchorElement>, item: InboxItem) => {
    track("notification_opened", { type: item.type });
    void markRead(item);
    // A new tab or window: the browser takes it from here.
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0 ||
      !item.url.startsWith("/")
    )
      return;
    event.preventDefault();
    close();
    // The server gives a whole in-app address (path and query), so it
    // goes to the router as an href rather than as a route and params.
    void navigate({ href: item.url });
  };
}

function InboxRow({
  item,
  now,
  onOpen,
}: {
  item: InboxItem;
  now: string;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, item: InboxItem) => void;
}) {
  const unread = item.readAt === null;
  return (
    <ListRow
      as="li"
      align="start"
      lead={<ProductMark product={item.product} />}
      secondary={inboxMeta(item, now)}
      trail={
        unread ? (
          <span
            aria-hidden="true"
            className="mt-1.5 block size-2 rounded-full bg-fg"
          />
        ) : undefined
      }
      data-unread={unread ? "" : undefined}
      className={cn("relative hover:bg-hover", unread && "bg-panel")}
    >
      <WithTooltip label={unread ? "Open it and mark it read" : "Open it"}>
        <a
          href={item.url}
          onClick={(event) => onOpen(event, item)}
          className={cn(
            "block text-base after:absolute after:inset-0",
            unread ? "font-semibold" : "text-muted",
          )}
        >
          {item.title}
          {unread ? <span className="sr-only">, unread</span> : null}
        </a>
      </WithTooltip>
      {/* Read rows are their title and when, as in the design: the words
          were seen. Text people wrote stays text (CLAUDE.md). */}
      {unread && item.body ? (
        <p className="mt-0.5 text-pretty text-base">{item.body}</p>
      ) : null}
    </ListRow>
  );
}

/** The list itself, the same in the popover and the sheet. */
function InboxPanel({
  title,
  close,
}: {
  /** The heading, wrapped for the sheet so it names it. */
  title: ReactNode;
  close: () => void;
}) {
  const { status, items, next, more } = useInbox();
  const unread = useUnread((s) => s.unread) ?? 0;
  const onOpen = useOpenItem(close);
  const idPrefix = useId();
  // The meta line's "2m" is as of this render; the list is short-lived.
  const now = new Date().toISOString();
  const days = inboxDays(items, now);
  const anyUnread = unread > 0 || items.some((i) => i.readAt === null);
  return (
    <>
      <PageHeader
        size="panel"
        title={title}
        actions={
          anyUnread ? (
            <WithTooltip label="Mark every notification read">
              <Button variant="ghost" size="sm" onClick={() => void markRead()}>
                Mark all read
              </Button>
            </WithTooltip>
          ) : null
        }
      />
      <PanelBody>
        <div aria-live="polite" aria-busy={status === "loading"}>
          {status === "loading" || status === "idle" ? (
            <RowSkeleton rows={4} label="Loading your notifications" />
          ) : status === "failed" ? (
            <InlineError
              className="px-4"
              message="We couldn't load your notifications. Check your connection and try again."
              onRetry={() => void refreshInbox()}
            />
          ) : items.length === 0 ? (
            <PanelNote>
              Nothing new. Notifications show up here, pushed or not.
            </PanelNote>
          ) : null}
        </div>
        {/* Names and people's words: never in analytics (docs/ANALYTICS.md). */}
        <div data-private="">
          {days.map(({ day, items: dayItems }, i) => (
            <section key={day} aria-labelledby={`${idPrefix}-${day}`}>
              <GroupHeader
                title={<span id={`${idPrefix}-${day}`}>{day}</span>}
                headingLevel={3}
                // A day's last row has no rule under it (ListRow).
                className={i > 0 ? "border-t" : undefined}
              />
              <ul>
                {dayItems.map((item) => (
                  <InboxRow
                    key={item.id}
                    item={item}
                    now={now}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
        {status === "ready" && next ? (
          <div className="border-hairline border-t px-4 py-2">
            {more === "failed" ? (
              <InlineError
                className="py-1"
                message="We couldn't load older notifications. Check your connection and try again."
                onRetry={() => void loadOlder()}
              />
            ) : (
              <WithTooltip label="Load older notifications">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={more === "loading"}
                  onClick={() => void loadOlder()}
                >
                  {more === "loading" ? "Loading…" : "Show older"}
                </Button>
              </WithTooltip>
            )}
          </div>
        ) : null}
      </PanelBody>
      <PanelFooter className="bg-transparent">
        <WithTooltip label="Choose what notifies you, and where">
          <Button variant="link" size="sm" asChild className="px-0">
            <Link to="/settings/notifications" onClick={close}>
              Notification settings
            </Link>
          </Button>
        </WithTooltip>
      </PanelFooter>
    </>
  );
}

/**
 * Notifications, opened by the bell (./bell.tsx): a popover under it on
 * desktop, the kit's sheet on phones. Each opening loads the newest page.
 */
export function InboxSurface({
  open,
  onOpenChange,
  anchor,
  returnFocus,
  mobile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<HTMLButtonElement | null>;
  /** Hands focus back to the bell as the list closes (./bell.tsx). */
  returnFocus: () => void;
  mobile: boolean;
}) {
  useEffect(() => {
    if (open) void refreshInbox();
  }, [open]);
  const close = () => onOpenChange(false);
  if (mobile)
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        data-testid="notifications"
      >
        <InboxPanel
          close={close}
          title={
            <SheetTitle asChild>
              <span>Notifications</span>
            </SheetTitle>
          }
        />
      </Sheet>
    );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        align="end"
        role="dialog"
        aria-label="Notifications"
        data-testid="notifications"
        className="flex max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[400px] flex-col p-0"
        // The bell toggles it: a press on it isn't a click away.
        onInteractOutside={(e) => {
          if (anchor.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
      >
        <InboxPanel close={close} title="Notifications" />
      </PopoverContent>
    </Popover>
  );
}
