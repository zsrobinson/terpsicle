import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  ClipboardCopy,
  ExternalLink,
  Layers,
  Lightbulb,
  Mail,
  Pin,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  actionLine,
  agentMarkdown,
  contextLine,
  githubIssueUrl,
  isSheetContext,
  KIND_WORDS,
  PRODUCT_WORDS,
  STATUS_WORDS,
} from "~/core/feedback/agent";
import { ADMIN_FEEDBACK_PATH } from "~/core/routing";
import {
  type FeedbackGroup,
  type FeedbackItem,
  type FeedbackKind,
  FeedbackKindSchema,
  type FeedbackProduct,
  FeedbackProductSchema,
  type FeedbackStatus,
  FeedbackStatusSchema,
} from "~/core/schema/feedback";
import { feedbackAdminApi } from "~/server/fns/feedback-admin-api";
import { Button } from "~/ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/ui/dialog";
import { InlineError } from "~/ui/inline-error";
import { Textarea } from "~/ui/input";
import { GroupHeader, ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { SegmentedControl } from "~/ui/segmented-control";
import { RowSkeleton } from "~/ui/skeleton";
import { noteToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { AdminNav, PAGE_ROW } from "./admin-frame";
import {
  ADMIN_PAGE,
  dropFeedbackItem,
  type FeedbackQuery,
  feedbackListQuery,
  loadFailure,
  restoreFeedbackItem,
  setFeedbackItem,
} from "./admin-queries";
import { Filter, Filters } from "./decisions-page";
import { failureWords } from "./words";

// `/admin/feedback` (docs/FEEDBACK.md, "Triage"): what people sent, newest
// first, with the owner's pinned notes. Filters live in the URL. Similar
// items sit under their group's summary (the model's words, so with the
// sparkles). Status changes and deletes happen at once, with Undo in the
// toast (no dialogs, DESIGN §5). Marking Fixed emails someone who asked for
// a reply; the inbox knows whether they did, never who they are.

export interface FeedbackFilters {
  status?: FeedbackStatus;
  kind?: FeedbackKind;
  product?: FeedbackProduct;
  host?: string;
  item?: string;
}

export type FeedbackClient = Pick<
  typeof feedbackAdminApi,
  "feedbackList" | "feedbackUpdate" | "feedbackDelete" | "feedbackGroup"
>;

const KIND_PLURAL: Readonly<Record<FeedbackKind, string>> = {
  bug: "Bugs",
  idea: "Ideas",
  review: "Pinned notes",
};

const KIND_ICON: Readonly<Record<FeedbackKind, ReactNode>> = {
  bug: <Bug size={14} aria-hidden="true" />,
  idea: <Lightbulb size={14} aria-hidden="true" />,
  review: <Pin size={14} aria-hidden="true" />,
};

/** Each item's status choices; Spam is a quiet action beside them. */
const CHIP_STATUSES: readonly FeedbackStatus[] = [
  "new",
  "planned",
  "fixed",
  "wont-fix",
];

/** "Sep 25, 12:00". */
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FeedbackPage({
  filters,
  onFilters,
  client = feedbackAdminApi,
  origin = typeof window === "undefined" ? "" : window.location.origin,
}: {
  filters: FeedbackFilters;
  onFilters: (next: FeedbackFilters) => void;
  client?: FeedbackClient;
  /** Where links point (tests pass one). */
  origin?: string;
}) {
  const query: FeedbackQuery = filters.item
    ? { id: filters.item }
    : {
        status: filters.status,
        kind: filters.kind,
        product: filters.product,
        host: filters.host,
      };
  const queryClient = useQueryClient();
  const list = useInfiniteQuery(feedbackListQuery(client, query));
  const [grouping, setGrouping] = useState(false);

  const pages = list.data?.pages ?? [];
  const first = pages[0] ?? null;
  const items = pages.flatMap((p) => p.items);
  const groups = new Map(pages.flatMap((p) => p.groups).map((g) => [g.id, g]));
  const failed = loadFailure(list);
  const loadMore = () => void list.fetchNextPage();
  const reload = () => void list.refetch();

  /** A status or note change, at once, and a toast with Undo for status. */
  const update = async (
    item: FeedbackItem,
    change: { status?: FeedbackStatus; note?: string | null },
    undoable = true,
  ): Promise<boolean> => {
    try {
      const result = await client.feedbackUpdate({ id: item.id, ...change });
      if (result.status === "gone") {
        noteToast("That feedback is gone", {
          description: "It was deleted since this list loaded.",
        });
        reload();
        return false;
      }
      // The server's copy, in every list that has it.
      setFeedbackItem(queryClient, result.item);
      if (change.status && undoable) {
        undoToast({
          id: `feedback-status-${item.id}`,
          message: `Marked ${STATUS_WORDS[change.status]}`,
          description: result.emailed
            ? "We emailed them that it's fixed."
            : undefined,
          tooltip: `Back to ${STATUS_WORDS[item.status]}`,
          onUndo: () =>
            void update(result.item, { status: item.status }, false),
        });
      }
      return true;
    } catch (error) {
      noteToast("Couldn't save that", { description: failureWords(error) });
      return false;
    }
  };

  const remove = async (item: FeedbackItem) => {
    try {
      const result = await client.feedbackDelete({ id: item.id });
      if (result.status === "gone") {
        reload();
        return;
      }
      dropFeedbackItem(queryClient, item.id);
      undoToast({
        id: `feedback-deleted-${item.id}`,
        message: "Feedback deleted",
        tooltip: "Put it back",
        onUndo: () =>
          void client
            .feedbackDelete({ id: item.id, restore: true })
            .then((undone) => {
              if (undone.status === "restored")
                restoreFeedbackItem(queryClient, query, item);
              else noteToast("Too late to put it back.");
            })
            .catch((error: unknown) =>
              noteToast("Couldn't put it back", {
                description: failureWords(error),
              }),
            ),
      });
    } catch (error) {
      noteToast("Couldn't delete that", { description: failureWords(error) });
    }
  };

  const group = async () => {
    setGrouping(true);
    try {
      const result = await client.feedbackGroup();
      if (result.status === "unavailable")
        noteToast("Couldn't group them just now", {
          description: "The model didn't answer. The old groups stay.",
        });
      else
        noteToast(
          result.groups === 0
            ? "Nothing similar enough to group"
            : `${result.grouped} items in ${result.groups} ${result.groups === 1 ? "group" : "groups"}`,
        );
      reload();
    } catch (error) {
      noteToast("Couldn't group them", {
        description: failureWords(error),
        retry: () => void group(),
      });
    } finally {
      setGrouping(false);
    }
  };

  const set = (patch: FeedbackFilters) =>
    onFilters({ ...filters, ...patch, item: undefined });
  const hosts = first?.hosts ?? [];
  const newCount = first?.newCount;

  return (
    <>
      <PageHeader
        title="Feedback"
        status={newCount !== undefined ? `${newCount} new` : "Newest first"}
        views={<AdminNav current="feedback" />}
        actions={
          <WithTooltip label="Sort the open items into groups of the same thing, with a summary each">
            <Button
              variant="ghost"
              size="sm"
              disabled={grouping}
              onClick={() => void group()}
            >
              <Layers aria-hidden="true" />
              {grouping ? "Grouping…" : "Group similar"}
            </Button>
          </WithTooltip>
        }
      />

      {filters.item ? (
        <p className="text-muted text-sm">
          One item.{" "}
          <WithTooltip label="See all feedback">
            <button
              type="button"
              className="text-fg underline underline-offset-2"
              onClick={() => onFilters({})}
            >
              Show everything
            </button>
          </WithTooltip>
        </p>
      ) : (
        <Filters>
          <Filter
            label="Status"
            hint="Where it stands"
            value={filters.status}
            options={FeedbackStatusSchema.options.map((s) => ({
              value: s,
              label: STATUS_WORDS[s],
            }))}
            onChange={(status) => set({ status })}
          />
          <Filter
            label="Kind"
            hint="Bugs, ideas, or your pinned notes"
            value={filters.kind}
            options={FeedbackKindSchema.options.map((k) => ({
              value: k,
              label: KIND_PLURAL[k],
            }))}
            onChange={(kind) => set({ kind })}
          />
          <Filter
            label="Product"
            hint="Where it was sent from"
            value={filters.product}
            options={FeedbackProductSchema.options.map((p) => ({
              value: p,
              label: PRODUCT_WORDS[p],
            }))}
            onChange={(product) => set({ product })}
          />
          {hosts.length > 1 || filters.host ? (
            <Filter
              label="Deployment"
              hint="Production, or a PR's preview"
              value={filters.host}
              options={hosts.map((h) => ({ value: h, label: hostLabel(h) }))}
              onChange={(host) => set({ host })}
            />
          ) : null}
        </Filters>
      )}

      {failed ? (
        <InlineError
          message={`Couldn't load feedback. ${failed}`}
          onRetry={reload}
        />
      ) : null}

      {list.isPending ? (
        <RowSkeleton rows={3} inset={false} label="Loading feedback" />
      ) : items.length === 0 && first ? (
        <p className="py-2 text-muted">
          {filters.item
            ? "That feedback is gone: deleted, or past its year."
            : "No feedback matches these filters."}
        </p>
      ) : (
        <FeedbackList
          items={items}
          groups={groups}
          render={(item, inGroup) => (
            <ItemRow
              key={item.id}
              inGroup={inGroup}
              item={item}
              origin={origin}
              onStatus={(status) => void update(item, { status })}
              onNote={(note) => update(item, { note }, false)}
              onDelete={() => void remove(item)}
            />
          )}
        />
      )}

      {list.isFetchNextPageError && !list.isFetching ? (
        <InlineError
          message={`Couldn't load older feedback. ${failureWords(list.error)}`}
          onRetry={loadMore}
        />
      ) : list.hasNextPage ? (
        <WithTooltip label={`Show the next ${ADMIN_PAGE}`}>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={list.isFetchingNextPage}
            onClick={loadMore}
          >
            {list.isFetchingNextPage ? "Loading…" : "Show older"}
          </Button>
        </WithTooltip>
      ) : null}
    </>
  );
}

/** "Production", or "PR 42 preview". */
function hostLabel(host: string): string {
  if (host === "terpsicle.com") return "Production";
  const pr = host.match(/^pr-(\d+)-/);
  return pr ? `PR ${pr[1]} preview` : host;
}

type Row =
  | { type: "item"; item: FeedbackItem }
  | { type: "group"; group: FeedbackGroup; items: FeedbackItem[] };

/**
 * Newest first; a group sits where its newest item would, with the rest of
 * its items under it.
 */
export function feedbackRows(
  items: readonly FeedbackItem[],
  groups: ReadonlyMap<string, FeedbackGroup>,
): Row[] {
  const rows: Row[] = [];
  const placed = new Map<string, Extract<Row, { type: "group" }>>();
  for (const item of items) {
    const group = item.groupId ? groups.get(item.groupId) : undefined;
    if (!group) {
      rows.push({ type: "item", item });
      continue;
    }
    const row = placed.get(group.id);
    if (row) row.items.push(item);
    else {
      const next: Extract<Row, { type: "group" }> = {
        type: "group",
        group,
        items: [item],
      };
      placed.set(group.id, next);
      rows.push(next);
    }
  }
  // A group of one on this page reads as a plain item.
  return rows.map((row) =>
    row.type === "group" && row.items.length === 1 && row.items[0]
      ? { type: "item", item: row.items[0] }
      : row,
  );
}

function FeedbackList({
  items,
  groups,
  render,
}: {
  items: readonly FeedbackItem[];
  groups: ReadonlyMap<string, FeedbackGroup>;
  render: (item: FeedbackItem, inGroup: boolean) => ReactNode;
}) {
  return (
    <ol aria-label="Feedback">
      {feedbackRows(items, groups).map((row) =>
        row.type === "item" ? (
          render(row.item, false)
        ) : (
          // A hairline under the group, as between rows.
          <li
            key={row.group.id}
            className="border-hairline border-b last:border-b-0"
          >
            <GroupBlock group={row.group} count={row.items.length}>
              {row.items.map((item) => render(item, true))}
            </GroupBlock>
          </li>
        ),
      )}
    </ol>
  );
}

/** Similar items under the model's summary: the kit's group bar. */
function GroupBlock({
  group,
  count,
  children,
}: {
  group: FeedbackGroup;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-label={`Group: ${group.summary}`}>
      <GroupHeader
        open={open}
        onToggle={() => setOpen((o) => !o)}
        toggleLabel={
          open ? "Hide this group's items" : "Show this group's items"
        }
        title={
          <span className="flex min-w-0 items-center gap-1.5">
            <Sparkles
              size={13}
              aria-label="Summary written by AI"
              className="shrink-0 text-muted"
            />
            <span className="truncate">{group.summary}</span>
          </span>
        }
        meta={count}
      />
      <ol hidden={!open}>{children}</ol>
    </section>
  );
}

function ItemRow({
  item,
  inGroup,
  origin,
  onStatus,
  onNote,
  onDelete,
}: {
  item: FeedbackItem;
  /** Under a group's bar, the rows sit in from the page's edge. */
  inGroup: boolean;
  origin: string;
  onStatus: (status: FeedbackStatus) => void;
  onNote: (note: string | null) => Promise<boolean>;
  onDelete: () => void;
}) {
  const adminLink = `${origin}${ADMIN_FEEDBACK_PATH}?item=${item.id}`;
  const shot = item.hasScreenshot
    ? `${origin}/admin/feedback/shot/${item.id}`
    : null;
  const elementShot = item.hasElementShot
    ? `${origin}/admin/feedback/shot/${item.id}/element`
    : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        agentMarkdown(item, {
          admin: adminLink,
          screenshot: shot,
          elementShot,
        }),
      );
      noteToast("Copied for an agent");
    } catch {
      noteToast("Couldn't copy", {
        description: "The browser didn't allow it. Try again from a click.",
      });
    }
  };
  const context = item.context;
  return (
    <ListRow as="li" align="start" className={inGroup ? undefined : PAGE_ROW}>
      <article
        data-feedback-item={item.id}
        aria-label={`${KIND_WORDS[item.kind]}, ${STATUS_WORDS[item.status]}`}
      >
        <header className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1 font-medium">
            {KIND_ICON[item.kind]}
            {KIND_WORDS[item.kind]}
          </span>
          <span className="text-muted">{PRODUCT_WORDS[item.product]}</span>
          <span className="text-muted">{when(item.createdAt)}</span>
          {item.reply ? (
            <WithTooltip label="They asked for an email when it's fixed">
              <span className="flex items-center gap-1 text-muted">
                <Mail size={12} aria-hidden="true" />
                Wants a reply
              </span>
            </WithTooltip>
          ) : null}
        </header>

        {/* Their words, as plain text (CLAUDE.md). */}
        <p className="whitespace-pre-wrap break-words">{item.text}</p>
        {item.expected ? (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-muted">
            <span className="font-medium text-fg">Expected: </span>
            {item.expected}
          </p>
        ) : null}

        {shot || elementShot ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {elementShot ? (
              <Shot src={elementShot} label="The element" />
            ) : null}
            {shot ? <Shot src={shot} label="The page" /> : null}
          </div>
        ) : null}

        {item.element ? (
          <p className="mt-2 break-all text-muted text-sm">
            <span className="text-fg">Element: </span>
            <code className="ident text-xs">{item.element.selector}</code>
            {item.element.text ? ` · “${item.element.text}”` : null}
          </p>
        ) : null}

        <p className="mt-2 break-all text-faint text-xs">{contextLine(item)}</p>

        {isSheetContext(context) && context.actions.length > 0 ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted">
              Recent actions ({context.actions.length})
            </summary>
            <ol className="ident mt-1 max-h-48 overflow-y-auto bg-panel p-2 text-xs leading-5">
              {context.actions.map((a) => (
                <li key={`${a.at}-${a.type}`} className="break-all">
                  {actionLine(a)}
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <NoteField item={item} onNote={onNote} />

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <SegmentedControl
            label="Status"
            value={item.status}
            options={CHIP_STATUSES.map((status) => ({
              value: status,
              label: STATUS_WORDS[status],
              hint:
                status === "fixed" && item.reply && item.status !== "fixed"
                  ? "Mark Fixed and email them"
                  : `Mark ${STATUS_WORDS[status]}`,
            }))}
            onValueChange={(status) => {
              if (status !== item.status) onStatus(status);
            }}
          />
          <WithTooltip label="Mark it spam: it leaves the open list">
            <Button
              variant="ghost"
              size="row"
              aria-pressed={item.status === "spam"}
              onClick={() => item.status !== "spam" && onStatus("spam")}
            >
              Spam
            </Button>
          </WithTooltip>
          {/* Phones: the hand-offs get a row of their own. */}
          <span className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto">
            <WithTooltip label="Copy its words, context, recent actions and screenshot links as Markdown">
              <Button variant="ghost" size="row" onClick={() => void copy()}>
                <ClipboardCopy aria-hidden="true" />
                Copy for an agent
              </Button>
            </WithTooltip>
            <WithTooltip label="A new issue with where to look, never their words or screenshot">
              <Button
                variant="ghost"
                size="row"
                render={
                  <a
                    href={githubIssueUrl(item, adminLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <ExternalLink aria-hidden="true" />
                Open GitHub issue
              </Button>
            </WithTooltip>
            <WithTooltip label="Delete it and its screenshots">
              <Button
                variant="ghost"
                size="row"
                aria-label="Delete"
                onClick={onDelete}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </WithTooltip>
          </span>
        </div>
      </article>
    </ListRow>
  );
}

function Shot({ src, label }: { src: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <WithTooltip label={`${label}, full size`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="overflow-hidden border border-hairline bg-panel"
        >
          <img
            src={src}
            alt={`${label}'s screenshot`}
            loading="lazy"
            className="h-24 w-auto max-w-60 object-contain"
          />
        </button>
      </WithTooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(1400px,calc(100vw-32px))] p-3">
          <DialogTitle className="mb-2 text-base">{label}</DialogTitle>
          <img
            src={src}
            alt={`${label}'s screenshot, full size`}
            className="mx-auto max-h-[80vh] w-auto max-w-full"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function NoteField({
  item,
  onNote,
}: {
  item: FeedbackItem;
  onNote: (note: string | null) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState(item.note ?? "");
  const [saved, setSaved] = useState(false);
  // Someone else's change (Undo, a reload) replaces what's shown.
  useEffect(() => setDraft(item.note ?? ""), [item.note]);
  const save = async () => {
    const next = draft.trim() || null;
    if (next === (item.note ?? null)) return;
    setSaved(await onNote(next));
  };
  return (
    <div className="mt-2">
      <label htmlFor={id} className="sr-only">
        Your note
      </label>
      <WithTooltip label="Only you see this. It saves when you click away.">
        <Textarea
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          onBlur={() => void save()}
          rows={1}
          maxLength={2_000}
          placeholder="Your note"
          className="resize-y"
        />
      </WithTooltip>
      {saved ? (
        <p role="status" className="text-faint text-xs">
          Note saved
        </p>
      ) : null}
    </div>
  );
}
