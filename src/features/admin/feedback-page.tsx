import { cn } from "cn";
import {
  Bug,
  ChevronDown,
  ClipboardCopy,
  ExternalLink,
  Layers,
  Lightbulb,
  Mail,
  Pin,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { toast } from "sonner";
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
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Filter } from "./decisions-page";
import { failureWords, useLoad } from "./use-load";

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

const PAGE = 50;
/** Long enough to read and reach Undo (WCAG 2.2.1), like the queue's. */
const UNDO_TOAST_MS = 10_000;

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

/** The chips on each item; Spam is a quiet action beside them. */
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
  const query = {
    ...(filters.item
      ? { id: filters.item }
      : {
          status: filters.status,
          kind: filters.kind,
          product: filters.product,
          host: filters.host,
        }),
    limit: PAGE,
  };
  const key = JSON.stringify(query);
  const first = useLoad(
    (signal) => client.feedbackList(query, { signal }),
    key,
  );
  const [more, setMore] = useState<{
    items: FeedbackItem[];
    groups: FeedbackGroup[];
    cursor: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState<string | null>(null);
  // Changes made here since the list loaded, over the loaded rows.
  const [changed, setChanged] = useState<ReadonlyMap<string, FeedbackItem>>(
    new Map(),
  );
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [grouping, setGrouping] = useState(false);

  // A new filter starts over from the first page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the filter
  useEffect(() => {
    setMore(null);
    setMoreFailed(null);
    setChanged(new Map());
    setGone(new Set());
  }, [key]);

  const items = [...(first.data?.items ?? []), ...(more?.items ?? [])]
    .filter((i) => !gone.has(i.id))
    .map((i) => changed.get(i.id) ?? i);
  const groups = new Map(
    [...(first.data?.groups ?? []), ...(more?.groups ?? [])].map((g) => [
      g.id,
      g,
    ]),
  );
  const cursor = more ? more.cursor : (first.data?.cursor ?? null);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreFailed(null);
    try {
      const page = await client.feedbackList({ ...query, cursor });
      setMore((prev) => ({
        items: [...(prev?.items ?? []), ...page.items],
        groups: [...(prev?.groups ?? []), ...page.groups],
        cursor: page.cursor,
      }));
    } catch (error) {
      setMoreFailed(failureWords(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const reload = () => {
    setMore(null);
    setChanged(new Map());
    setGone(new Set());
    first.reload();
  };

  const remember = (item: FeedbackItem) =>
    setChanged((prev) => new Map(prev).set(item.id, item));

  /** A status or note change, at once, and a toast with Undo for status. */
  const update = async (
    item: FeedbackItem,
    change: { status?: FeedbackStatus; note?: string | null },
    undoable = true,
  ): Promise<boolean> => {
    try {
      const result = await client.feedbackUpdate({ id: item.id, ...change });
      if (result.status === "gone") {
        toast("That feedback is gone", {
          description: "It was deleted since this list loaded.",
        });
        reload();
        return false;
      }
      remember(result.item);
      if (change.status && undoable) {
        const toastId = `feedback-status-${item.id}`;
        toast(`Marked ${STATUS_WORDS[change.status]}`, {
          id: toastId,
          description: result.emailed
            ? "We emailed them that it's fixed."
            : undefined,
          duration: UNDO_TOAST_MS,
          action: (
            <UndoButton
              label={`Back to ${STATUS_WORDS[item.status]}`}
              onClick={() => {
                toast.dismiss(toastId);
                void update(result.item, { status: item.status }, false);
              }}
            />
          ),
        });
      }
      return true;
    } catch (error) {
      toast("Couldn't save that", { description: failureWords(error) });
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
      setGone((prev) => new Set(prev).add(item.id));
      const toastId = `feedback-deleted-${item.id}`;
      toast("Feedback deleted", {
        id: toastId,
        duration: UNDO_TOAST_MS,
        action: (
          <UndoButton
            label="Put it back"
            onClick={() => {
              toast.dismiss(toastId);
              void client
                .feedbackDelete({ id: item.id, restore: true })
                .then((undone) => {
                  if (undone.status === "restored")
                    setGone((prev) => {
                      const next = new Set(prev);
                      next.delete(item.id);
                      return next;
                    });
                  else toast("Too late to put it back.");
                })
                .catch((error: unknown) =>
                  toast("Couldn't put it back", {
                    description: failureWords(error),
                  }),
                );
            }}
          />
        ),
      });
    } catch (error) {
      toast("Couldn't delete that", { description: failureWords(error) });
    }
  };

  const group = async () => {
    setGrouping(true);
    try {
      const result = await client.feedbackGroup();
      if (result.status === "unavailable")
        toast("Couldn't group them just now", {
          description: "The model didn't answer. The old groups stay.",
        });
      else
        toast(
          result.groups === 0
            ? "Nothing similar enough to group"
            : `${result.grouped} items in ${result.groups} ${result.groups === 1 ? "group" : "groups"}`,
        );
      reload();
    } catch (error) {
      toast("Couldn't group them", { description: failureWords(error) });
    } finally {
      setGrouping(false);
    }
  };

  const set = (patch: FeedbackFilters) =>
    onFilters({ ...filters, ...patch, item: undefined });
  const hosts = first.data?.hosts ?? [];
  const newCount = first.data?.newCount;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="font-semibold text-lg">Feedback</h1>
        {newCount !== undefined ? (
          <span className="text-muted text-sm">{newCount} new</span>
        ) : null}
        <WithTooltip label="Sort the open items into groups of the same thing, with a summary each">
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={grouping}
            onClick={() => void group()}
          >
            <Layers aria-hidden="true" />
            {grouping ? "Grouping…" : "Group similar"}
          </Button>
        </WithTooltip>
      </div>

      {filters.item ? (
        <p className="mb-4 text-muted text-sm">
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
        <div className="mb-4 flex flex-wrap items-center gap-2">
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
        </div>
      )}

      {first.state === "failed" ? (
        <p role="status" className="mb-3 text-muted">
          Couldn't load feedback. {first.message}
        </p>
      ) : null}

      {first.data === null && first.state === "loading" ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : items.length === 0 && first.data ? (
        <p className="text-muted">
          {filters.item
            ? "That feedback is gone: deleted, or past its year."
            : "No feedback matches these filters."}
        </p>
      ) : (
        <FeedbackList
          items={items}
          groups={groups}
          render={(item) => (
            <ItemCard
              key={item.id}
              item={item}
              origin={origin}
              onStatus={(status) => void update(item, { status })}
              onNote={(note) => update(item, { note }, false)}
              onDelete={() => void remove(item)}
            />
          )}
        />
      )}

      {cursor ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <WithTooltip label={`Show the next ${PAGE}`}>
            <Button
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Show older"}
            </Button>
          </WithTooltip>
          {moreFailed ? (
            <span role="status" className="text-muted text-sm">
              {moreFailed}
            </span>
          ) : null}
        </div>
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

function UndoButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <WithTooltip label={label}>
      <Button
        size="row"
        variant="outline"
        className="ml-auto"
        onClick={onClick}
      >
        <Undo2 size={12} aria-hidden="true" />
        Undo
      </Button>
    </WithTooltip>
  );
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
  render: (item: FeedbackItem) => ReactNode;
}) {
  return (
    <ol aria-label="Feedback" className="space-y-3">
      {feedbackRows(items, groups).map((row) =>
        row.type === "item" ? (
          <li key={row.item.id}>{render(row.item)}</li>
        ) : (
          <li key={row.group.id}>
            <GroupBlock group={row.group} count={row.items.length}>
              {row.items.map(render)}
            </GroupBlock>
          </li>
        ),
      )}
    </ol>
  );
}

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
  const id = useId();
  return (
    <section
      aria-label={`Group: ${group.summary}`}
      className="rounded-lg border border-hairline bg-panel"
    >
      <WithTooltip
        label={open ? "Hide this group's items" : "Show this group's items"}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <Sparkles
            size={14}
            aria-label="Summary written by AI"
            className="shrink-0 text-muted"
          />
          <span className="min-w-0 flex-1 font-medium">{group.summary}</span>
          <span className="tnum text-muted text-sm">{count}</span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-muted transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </WithTooltip>
      <div id={id} hidden={!open} className="space-y-3 px-3 pb-3">
        {children}
      </div>
    </section>
  );
}

function ItemCard({
  item,
  origin,
  onStatus,
  onNote,
  onDelete,
}: {
  item: FeedbackItem;
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
      toast("Copied for an agent");
    } catch {
      toast("Couldn't copy", {
        description: "The browser didn't allow it. Try again from a click.",
      });
    }
  };
  const context = item.context;
  return (
    <article
      data-feedback-item={item.id}
      aria-label={`${KIND_WORDS[item.kind]}, ${STATUS_WORDS[item.status]}`}
      className="rounded-lg border border-hairline bg-raised p-3"
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
          {elementShot ? <Shot src={elementShot} label="The element" /> : null}
          {shot ? <Shot src={shot} label="The page" /> : null}
        </div>
      ) : null}

      {item.element ? (
        <p className="mt-2 break-all text-muted text-sm">
          <span className="text-fg">Element: </span>
          <code className="font-mono text-xs">{item.element.selector}</code>
          {item.element.text ? ` · “${item.element.text}”` : null}
        </p>
      ) : null}

      <p className="mt-2 break-all text-faint text-xs">{contextLine(item)}</p>

      {isSheetContext(context) && context.actions.length > 0 ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted">
            Recent actions ({context.actions.length})
          </summary>
          <ol className="mt-1 max-h-48 overflow-y-auto rounded-md bg-panel p-2 font-mono text-xs leading-5">
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
        {CHIP_STATUSES.map((status) => (
          <WithTooltip
            key={status}
            label={
              status === "fixed" && item.reply && item.status !== "fixed"
                ? "Mark Fixed and email them"
                : `Mark ${STATUS_WORDS[status]}`
            }
          >
            <button
              type="button"
              aria-pressed={item.status === status}
              onClick={() => item.status !== status && onStatus(status)}
              className={cn(
                "h-6 rounded-md border px-2 text-sm transition-colors",
                item.status === status
                  ? "border-fg bg-hover font-medium text-fg"
                  : "border-hairline text-muted hover:bg-hover hover:text-fg",
              )}
            >
              {STATUS_WORDS[status]}
            </button>
          </WithTooltip>
        ))}
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
            <Button variant="ghost" size="row" asChild>
              <a
                href={githubIssueUrl(item, adminLink)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink aria-hidden="true" />
                Open GitHub issue
              </a>
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
          className="overflow-hidden rounded-md border border-hairline bg-panel"
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
        <textarea
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
          className="w-full resize-y rounded-md border border-hairline-strong bg-bg px-2 py-1 text-sm placeholder:text-faint focus:border-fg/40"
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
