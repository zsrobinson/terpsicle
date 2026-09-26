import { Check, ChevronDown, Trash2, Undo2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import {
  markedSegments,
  suggestedRemoveReason,
  waitedFor,
} from "~/core/moderation/admin";
import { REASON_WORDS } from "~/core/moderation/policy-text";
import type {
  AdminReason,
  ModerationReason,
  PolicyLabel,
  QueueItem,
} from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { api } from "~/server/fns/api";
import { Button } from "~/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { HealthHeader } from "./health-header";
import { failureWords, useLoad } from "./use-load";
import {
  ADMIN_REASON_WORDS,
  count,
  KIND_WORDS,
  percent,
  REMOVE_REASONS,
  SCORE_WORDS,
  SOURCE_WORDS,
} from "./words";

// `/admin` (V2 §10): held posts, urgent first, then oldest. Publish or
// remove at once, with a reason; the toast's Undo puts it back (no
// confirmation dialogs, DESIGN §5). "Decided" lists what you closed lately,
// each with its own Undo. Items never carry an author: moderation doesn't
// store one.

export type QueueView = "waiting" | "decided";

export type AdminClient = Pick<
  typeof api.admin,
  "queue" | "resolve" | "undo" | "health" | "samples"
>;

/** Long enough to read and reach Undo (WCAG 2.2.1), like the scheduler's. */
const UNDO_TOAST_MS = 10_000;

export function QueuePage({
  view,
  onView,
  client = api.admin,
  now = () => new Date(),
}: {
  view: QueueView;
  onView: (view: QueueView) => void;
  client?: AdminClient;
  now?: () => Date;
}) {
  const testMode = useAccount((s) => s.flags.authTestMode);
  const health = useLoad((signal) => client.health({ signal }), "health");
  const queue = useLoad(
    (signal) =>
      client.queue(
        { status: view === "waiting" ? "open" : "closed", limit: 50 },
        { signal },
      ),
    view,
  );
  // Decided here since the list loaded: hidden at once, before a reload,
  // but only from the list it was decided in (on "Decided" it belongs).
  const [goneFrom, setGoneFrom] = useState<{
    view: QueueView;
    ids: ReadonlySet<string>;
  }>({ view, ids: new Set() });
  const gone: ReadonlySet<string> =
    goneFrom.view === view ? goneFrom.ids : new Set();
  const setGone = (next: (prev: ReadonlySet<string>) => ReadonlySet<string>) =>
    setGoneFrom((prev) => ({
      view,
      ids: next(prev.view === view ? prev.ids : new Set()),
    }));
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    setGone(() => new Set());
    health.reload();
    queue.reload();
  };

  const undo = async (item: QueueItem) => {
    try {
      const result = await client.undo({ id: item.id });
      if (result.status === "ok") toast("Back in the queue");
      else if (result.status === "nothing-to-undo")
        toast("Nothing to undo", {
          description: "It was edited and held again since, so it's waiting.",
        });
      else toast("That post is gone, so there's nothing to undo.");
    } catch (error) {
      toast("Couldn't undo that", { description: failureWords(error) });
    }
    refresh();
  };

  const resolve = async (
    item: QueueItem,
    action: "approve" | "remove",
    reason: AdminReason,
  ) => {
    setBusy(item.id);
    try {
      const result = await client.resolve({ id: item.id, action, reason });
      if (result.status === "not-found") {
        toast("That post is gone", {
          description: "It was decided or deleted since this list loaded.",
        });
        refresh();
        return;
      }
      setGone((prev) => new Set(prev).add(item.id));
      health.reload();
      toast(
        action === "approve"
          ? `${publishWord(item)}ed`
          : `Removed: ${ADMIN_REASON_WORDS[reason]}`,
        {
          id: `resolved-${item.id}`,
          description: itemTitle(item),
          duration: UNDO_TOAST_MS,
          action: (
            <WithTooltip label="Put it back in the queue, held">
              <Button
                size="row"
                variant="outline"
                className="ml-auto"
                onClick={() => {
                  toast.dismiss(`resolved-${item.id}`);
                  void undo(item);
                }}
              >
                <Undo2 size={12} aria-hidden="true" />
                Undo
              </Button>
            </WithTooltip>
          ),
        },
      );
    } catch (error) {
      toast(`Couldn't ${action === "approve" ? "publish" : "remove"} that`, {
        description: failureWords(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const addSamples = async () => {
    setAdding(true);
    try {
      await client.samples();
      refresh();
    } catch (error) {
      toast("Couldn't add test posts", { description: failureWords(error) });
    } finally {
      setAdding(false);
    }
  };

  const items = (queue.data?.items ?? []).filter((i) => !gone.has(i.id));
  const at = now();

  return (
    <>
      <h1 className="sr-only">Moderation queue</h1>
      <HealthHeader health={health} now={at} onRefresh={refresh} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav aria-label="Queue" className="flex items-center gap-1">
          <ViewButton
            view="waiting"
            current={view}
            onView={onView}
            hint="Held posts waiting for you, urgent first"
          >
            Waiting
            {queue.data && view === "waiting"
              ? ` (${count(Math.max(0, queue.data.open - gone.size))})`
              : ""}
          </ViewButton>
          <ViewButton
            view="decided"
            current={view}
            onView={onView}
            hint="What you decided lately, newest first. Undo any of them."
          >
            Decided
          </ViewButton>
        </nav>
        {testMode ? (
          <WithTooltip label="Test copies only: puts four made-up held posts in the queue">
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={adding}
              onClick={() => void addSamples()}
            >
              {adding ? "Adding…" : "Add test posts"}
            </Button>
          </WithTooltip>
        ) : null}
      </div>

      {queue.state === "failed" ? (
        <p role="status" className="mb-3 text-muted">
          Couldn't load the queue. {queue.message}
        </p>
      ) : null}

      {queue.data === null && queue.state === "loading" ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : items.length === 0 && queue.data ? (
        <p className="text-muted">
          {view === "waiting"
            ? "Nothing's waiting. Clean posts publish on their own."
            : "Nothing decided yet."}
        </p>
      ) : (
        <ul
          className="space-y-3"
          aria-label={view === "waiting" ? "Waiting" : "Decided"}
        >
          {items.map((item) => (
            <li key={item.id}>
              <QueueCard
                item={item}
                now={at}
                busy={busy === item.id}
                onResolve={(action, reason) =>
                  void resolve(item, action, reason)
                }
                onUndo={() => void undo(item)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ViewButton({
  view,
  current,
  onView,
  hint,
  children,
}: {
  view: QueueView;
  current: QueueView;
  onView: (view: QueueView) => void;
  hint: string;
  children: ReactNode;
}) {
  const on = view === current;
  return (
    <WithTooltip label={hint}>
      <Button
        variant={on ? "outline" : "ghost"}
        size="sm"
        aria-pressed={on}
        className={on ? "text-fg" : undefined}
        onClick={() => onView(view)}
      >
        {children}
      </Button>
    </WithTooltip>
  );
}

/** "Publish" a review, "Allow" a chat message (V2 §10). */
function publishWord(item: QueueItem): "Publish" | "Allow" {
  return item.kind === "review" ? "Publish" : "Allow";
}

function itemTitle(item: QueueItem): string {
  return item.course
    ? `${KIND_WORDS[item.kind]} in ${item.course}`
    : KIND_WORDS[item.kind];
}

/** "3 h ago", or "just now". */
function ago(iso: string, now: Date): string {
  const waited = waitedFor(iso, now);
  return waited === "just now" ? waited : `${waited} ago`;
}

/** The reasons worth showing: not the panel's own bookkeeping. */
function heldFor(item: QueueItem): ModerationReason[] {
  return item.reasons.filter((r) => r.source !== "admin");
}

export function QueueCard({
  item,
  now,
  busy,
  onResolve,
  onUndo,
}: {
  item: QueueItem;
  now: Date;
  busy: boolean;
  onResolve: (action: "approve" | "remove", reason: AdminReason) => void;
  onUndo: () => void;
}) {
  const titleId = useId();
  const reasons = heldFor(item);
  // Scores under 5% are noise; the rest, highest first.
  const scores = Object.entries(item.scores)
    .flatMap(([label, score]): [PolicyLabel, number][] =>
      score !== undefined && score >= 0.05
        ? [[label as PolicyLabel, score]]
        : [],
    )
    .sort(([, a], [, b]) => b - a);

  return (
    <article
      aria-labelledby={titleId}
      data-queue-item={item.id}
      className="rounded-lg border border-hairline bg-raised p-3"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {item.urgent ? (
          <span className="rounded-sm bg-warn-soft px-1.5 font-medium text-sm text-warn">
            Urgent
          </span>
        ) : null}
        <h2 id={titleId} className="font-medium text-base">
          {itemTitle(item)}
        </h2>
        <span className="text-muted text-sm">
          {item.status === "closed" && item.closedAt
            ? `decided ${ago(item.closedAt, now)}`
            : `waiting ${waitedFor(item.createdAt, now)}`}
        </span>
      </div>

      {item.text === null ? (
        <p className="mt-2 text-muted">
          The text was cleared 30 days after this was decided.
        </p>
      ) : (
        // User-written: plain text only, never HTML (CLAUDE.md).
        <p
          data-private=""
          className="mt-2 whitespace-pre-wrap break-words text-fg"
        >
          {markedSegments(item.text, reasons).map((segment, i) =>
            segment.marked ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder
              <mark key={i} className="rounded-sm bg-warn-soft text-fg">
                {segment.text}
              </mark>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder
              <span key={i}>{segment.text}</span>
            ),
          )}
        </p>
      )}

      {reasons.length > 0 ? (
        <div className="mt-3 text-sm">
          <h3 className="text-muted">Why it was held</h3>
          <ul className="mt-1 space-y-0.5">
            {reasons.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: reasons can repeat a code; order is fixed
              <li key={i}>
                {REASON_WORDS[r.code]}
                <span className="text-muted">
                  {" "}
                  · {SOURCE_WORDS[r.source]}
                  {r.score !== undefined ? `, ${percent(r.score)}` : ""}
                  {r.action === "flag" ? ", noted only" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scores.length > 0 ? (
        <p className="mt-2 text-muted text-sm">
          Policy check:{" "}
          {scores
            .map(([label, score]) => `${SCORE_WORDS[label]} ${percent(score)}`)
            .join(" · ")}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.status === "open" ? (
          <>
            <WithTooltip label={`${publishWord(item)} it now. You can undo.`}>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onResolve("approve", "fine")}
              >
                <Check size={14} aria-hidden="true" />
                {publishWord(item)}
              </Button>
            </WithTooltip>
            <RemoveMenu
              suggested={suggestedRemoveReason(reasons)}
              disabled={busy}
              onRemove={(reason) => onResolve("remove", reason)}
            />
          </>
        ) : (
          <>
            <span className="text-sm">
              {item.resolution?.decision === "publish"
                ? `${publishWord(item)}ed`
                : item.resolution?.decision === "remove"
                  ? `Removed${item.resolution.reason ? `: ${ADMIN_REASON_WORDS[item.resolution.reason]}` : ""}`
                  : "Closed"}
            </span>
            <WithTooltip label="Put it back in the queue, held">
              <Button variant="outline" size="sm" onClick={onUndo}>
                <Undo2 size={14} aria-hidden="true" />
                Undo
              </Button>
            </WithTooltip>
          </>
        )}
      </div>
    </article>
  );
}

function RemoveMenu({
  suggested,
  disabled,
  onRemove,
}: {
  suggested: AdminReason;
  disabled: boolean;
  onRemove: (reason: AdminReason) => void;
}) {
  const others = REMOVE_REASONS.filter((r) => r !== suggested);
  return (
    <DropdownMenu>
      <WithTooltip label="Remove it, with a reason. You can undo.">
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled}>
            <Trash2 size={14} aria-hidden="true" />
            Remove
            <ChevronDown size={12} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent>
        <DropdownMenuLabel>Remove because</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onRemove(suggested)}>
          {ADMIN_REASON_WORDS[suggested]}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {others.map((reason) => (
          <DropdownMenuItem key={reason} onSelect={() => onRemove(reason)}>
            {ADMIN_REASON_WORDS[reason]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
