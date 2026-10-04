import {
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryResult,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
} from "react";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { PanelBody, PanelFooter, PanelNote } from "~/components/panel";
import {
  appendInboxPage,
  inboxDays,
  inboxMeta,
  markInboxRead,
} from "~/core/notifications/bell";
import type {
  InboxItem,
  InboxProduct,
  NotificationsInboxResult,
} from "~/core/schema/notifications";
import { track } from "~/lib/analytics";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { GroupHeader, ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { Popover, PopoverAnchor, PopoverContent } from "~/ui/popover";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { RowSkeleton } from "~/ui/skeleton";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { inboxQuery, notificationsKeys, setUnread, useUnread } from "./queries";

// Notifications, behind the bell (docs/V2.md §6.7; the design's desktop
// inbox): "Notifications" and "Mark all read", then Today, Yesterday and
// Earlier, each row its product's mark, a bold title, the words, "Chat ·
// 2m" and a dot while it's unread, and "Notification settings" at the
// foot. A popover under the bell on desktop, the kit's sheet on phones.
// Loaded on the bell's first hover, focus or open (./bell.tsx).

type InboxPages = InfiniteData<NotificationsInboxResult>;

/** The items of every page loaded, oldest page last, each item once. */
function inboxItems(data: InboxPages | undefined): InboxItem[] {
  return (data?.pages ?? []).reduce<InboxItem[]>(
    (items, page) => appendInboxPage(items, page.items),
    [],
  );
}

/** How many times each of the bell's queries has had its data set. */
function marks(client: QueryClient) {
  return {
    inbox: client.getQueryState(notificationsKeys.inbox)?.dataUpdateCount,
    unread: client.getQueryState(notificationsKeys.unread)?.dataUpdateCount,
  };
}

/**
 * Reads one item, or (with none) everything, shown read at once with the
 * count. The server's count follows, and a failure puts both back, but
 * only where nothing newer has landed since (another read, a poll, the
 * list again): an older answer never overwrites a newer one. Either way,
 * the bell's queries are asked again once it's settled.
 */
export function useMarkRead() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (item: InboxItem | undefined) => {
      const { notificationsApi } = await import("~/server/fns/notifications");
      return notificationsApi.read(item ? { ids: [item.id] } : { all: true });
    },
    onMutate: async (item) => {
      // A count or a list refresh on its way would undo what's shown. A
      // list loading for the first time is left to land: it has nothing
      // to undo, and cancelling it would leave it unloaded.
      await client.cancelQueries({ queryKey: notificationsKeys.unread });
      if (client.getQueryData(notificationsKeys.inbox) !== undefined)
        await client.cancelQueries({ queryKey: notificationsKeys.inbox });
      const pages = client.getQueryData<InboxPages>(notificationsKeys.inbox);
      const unread = client.getQueryData<number>(notificationsKeys.unread);
      const at = new Date().toISOString();
      client.setQueryData<InboxPages>(notificationsKeys.inbox, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: markInboxRead(
                  page.items,
                  at,
                  item ? [item.id] : undefined,
                ),
              })),
            }
          : data,
      );
      setUnread(client, item ? Math.max(0, (unread ?? 1) - 1) : 0);
      return { pages, unread, marks: marks(client) };
    },
    onSuccess: ({ unread }, _item, before) => {
      if (marks(client).unread === before.marks.unread)
        setUnread(client, unread);
    },
    onError: (_error, item, before) => {
      if (before) {
        const now = marks(client);
        if (now.inbox === before.marks.inbox && before.pages)
          client.setQueryData(notificationsKeys.inbox, before.pages);
        if (now.unread === before.marks.unread && before.unread !== undefined)
          setUnread(client, before.unread);
      }
      if (!item)
        noteToast("We couldn't mark them read. Check your connection.", {
          retry: () => mutation.mutate(undefined),
        });
    },
    // What the server has now, over anything that came back on the way.
    onSettled: () =>
      client.invalidateQueries({ queryKey: notificationsKeys.all }),
  });
  return (item?: InboxItem) => {
    if (item && item.readAt !== null) return;
    mutation.mutate(item);
  };
}

/** A row's product mark; admin items wear the umbrella. */
function ProductMark({ product }: { product: InboxProduct }) {
  return (
    <IntegrationLabel
      product={product === "admin" ? "umbrella" : product}
      iconOnly
      className="mt-px"
    />
  );
}

/** Where a row goes when a finger or pointer opens it. */
function useOpenItem(close: () => void, markRead: (item: InboxItem) => void) {
  const navigate = useNavigate();
  return (event: MouseEvent<HTMLAnchorElement>, item: InboxItem) => {
    track("notification_opened", { type: item.type });
    markRead(item);
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
  inbox,
}: {
  /** The heading, wrapped for the sheet so it names it. */
  title: ReactNode;
  close: () => void;
  /** The inbox's query, kept by the surface across openings. */
  inbox: UseInfiniteQueryResult<InboxPages, unknown>;
}) {
  const items = inboxItems(inbox.data);
  const unread = useUnread() ?? 0;
  const markRead = useMarkRead();
  const onOpen = useOpenItem(close, markRead);
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
              <Button variant="ghost" size="sm" onClick={() => markRead()}>
                Mark all read
              </Button>
            </WithTooltip>
          ) : null
        }
      />
      <PanelBody>
        <div aria-live="polite" aria-busy={inbox.isPending}>
          {inbox.data === undefined && inbox.isError ? (
            <InlineError
              className="px-4"
              message="We couldn't load your notifications. Check your connection and try again."
              onRetry={() => void inbox.refetch()}
            />
          ) : inbox.data === undefined ? (
            <RowSkeleton rows={4} label="Loading your notifications" />
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
        {inbox.data && inbox.hasNextPage ? (
          <div className="border-hairline border-t px-4 py-2">
            {inbox.isFetchNextPageError ? (
              <InlineError
                className="py-1"
                message="We couldn't load older notifications. Check your connection and try again."
                onRetry={() => void inbox.fetchNextPage()}
              />
            ) : (
              <WithTooltip label="Load older notifications">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={inbox.isFetchingNextPage}
                  onClick={() => void inbox.fetchNextPage()}
                >
                  {inbox.isFetchingNextPage ? "Loading…" : "Show older"}
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
 * desktop, the kit's sheet on phones. Each opening asks for the inbox
 * again (it's never fresh), showing the last one while it does.
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
  const client = useQueryClient();
  const inbox = useInfiniteQuery({ ...inboxQuery(), enabled: open });
  useEffect(() => {
    if (open) return;
    // Opening again asks for the newest page only, not every page "Show
    // older" loaded (TanStack's "refetch only the first page" recipe).
    client.setQueryData<InboxPages>(notificationsKeys.inbox, (data) =>
      data && data.pages.length > 1
        ? {
            pages: data.pages.slice(0, 1),
            pageParams: data.pageParams.slice(0, 1),
          }
        : data,
    );
  }, [open, client]);
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
          inbox={inbox}
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
        <InboxPanel close={close} inbox={inbox} title="Notifications" />
      </PopoverContent>
    </Popover>
  );
}
