import { Check, ChevronDown, RotateCw, Trash2, Undo2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import {
  markedSegments,
  suggestedRemoveReason,
  waitedFor,
} from "~/core/moderation/admin";
import { REASON_WORDS } from "~/core/moderation/policy-text";
import { ADMIN_PATH } from "~/core/routing";
import type {
  AdminReason,
  ModerationReason,
  PolicyLabel,
  QueueItem,
} from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { adminApi } from "~/server/fns/admin-api";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { noteToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { type View, ViewSwitch } from "~/ui/view-switch";
import { AdminNav, PAGE_ROW } from "./admin-frame";
import { ChatRemoveForm } from "./chat-remove";
import { HealthSection } from "./health-section";
import { StopAuthor } from "./stop-author";
import { failureWords, useLoad } from "./use-load";
import {
  ADMIN_REASON_WORDS,
  CROSS_ROOM_WORDS,
  count,
  KIND_WORDS,
  percent,
  REMOVE_REASONS,
  REPORT_WORDS,
  reviewContextWords,
  SCORE_WORDS,
  SOURCE_WORDS,
  stoppedWords,
  stopWords,
} from "./words";

// `/admin` (V2 §10): held posts, urgent first, then oldest. Publish or
// remove at once, with a reason; the toast's Undo puts it back (no
// confirmation dialogs, DESIGN §5). A removal can also stop the item's
// author for a while; Reviews or Chat applies it, so the panel never learns
// who. "Decided" lists what you closed lately, each with its own Undo. Items
// never carry an author: moderation doesn't store one.

export type QueueView = "waiting" | "decided";

export type AdminClient = Pick<
  typeof adminApi,
  "queue" | "resolve" | "undo" | "health" | "samples" | "chatRemove"
>;

export function QueuePage({
  view,
  client = adminApi,
  now = () => new Date(),
}: {
  /** From the URL (`?show=decided`); the view switch links between them. */
  view: QueueView;
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
  const [removing, setRemoving] = useState(false);

  const refresh = () => {
    setGone(() => new Set());
    health.reload();
    queue.reload();
  };

  const undo = async (item: QueueItem) => {
    try {
      const result = await client.undo({ id: item.id });
      if (result.status === "ok") noteToast("Back in the queue");
      else if (result.status === "nothing-to-undo")
        noteToast("Nothing to undo", {
          description: "It was edited and held again since, so it's waiting.",
        });
      else noteToast("That post is gone, so there's nothing to undo.");
    } catch (error) {
      noteToast("Couldn't undo that", { description: failureWords(error) });
    }
    refresh();
  };

  /** The toast after a decision, with Undo (DESIGN §5: no dialogs). */
  const announce = (
    decided: QueueItem,
    action: "approve" | "remove",
    reason: AdminReason,
    stopAsked: boolean,
  ) =>
    undoToast({
      id: `resolved-${decided.id}`,
      message:
        action === "approve"
          ? `${publishWord(decided)}ed`
          : `Removed: ${ADMIN_REASON_WORDS[reason]}`,
      description: stopAsked
        ? decided.stoppedUntil
          ? `${itemTitle(decided)}. ${stoppedWords(decided.kind, decided.stoppedUntil)}.`
          : `${itemTitle(decided)}. No one to stop: the account or the post is gone.`
        : itemTitle(decided),
      tooltip: decided.stoppedUntil
        ? "Put it back in the queue, held, and lift the stop"
        : "Put it back in the queue, held",
      onUndo: () => void undo(decided),
    });

  const resolve = async (
    item: QueueItem,
    action: "approve" | "remove",
    reason: AdminReason,
    stop: boolean,
  ) => {
    setBusy(item.id);
    try {
      const result = await client.resolve({
        id: item.id,
        action,
        reason,
        ...(stop && action === "remove" ? { authorAction: "stop" } : {}),
      });
      if (result.status !== "ok") {
        noteToast("That post is gone", {
          description: "It was decided or deleted since this list loaded.",
        });
        refresh();
        return;
      }
      setGone((prev) => new Set(prev).add(item.id));
      health.reload();
      announce(result.item, action, reason, stop && action === "remove");
    } catch (error) {
      noteToast(
        `Couldn't ${action === "approve" ? "publish" : "remove"} that`,
        {
          description: failureWords(error),
        },
      );
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
      noteToast("Couldn't add test posts", {
        description: failureWords(error),
      });
    } finally {
      setAdding(false);
    }
  };

  const items = (queue.data?.items ?? []).filter((i) => !gone.has(i.id));
  const at = now();
  const views: readonly View[] = [
    {
      id: "waiting",
      label: `Waiting${
        queue.data && view === "waiting"
          ? ` (${count(Math.max(0, queue.data.open - gone.size))})`
          : ""
      }`,
      hint: "Held posts waiting for you, urgent first",
      to: ADMIN_PATH,
      search: {},
    },
    {
      id: "decided",
      label: "Decided",
      hint: "What you decided lately, newest first. Undo any of them.",
      to: ADMIN_PATH,
      search: { show: "decided" },
    },
  ];

  return (
    <>
      <PageHeader
        title="Moderation queue"
        status={
          view === "waiting"
            ? "Held posts, urgent first, then oldest"
            : "What you decided lately, newest first"
        }
        views={<AdminNav current="queue" />}
        actions={
          <WithTooltip label="Load the numbers and the queue again">
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RotateCw aria-hidden="true" />
              Refresh
            </Button>
          </WithTooltip>
        }
      />
      <HealthSection health={health} now={at} />
      <PageSection title="Posts">
        <div className="flex flex-wrap items-center gap-2">
          <ViewSwitch label="Queue" views={views} current={view} />
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <WithTooltip label="Take down a message you found in Chat, from its link">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={removing}
                onClick={() => setRemoving((was) => !was)}
              >
                Paste a chat link
              </Button>
            </WithTooltip>
            {testMode ? (
              <WithTooltip label="Test copies only: puts four made-up held posts in the queue">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={adding}
                  onClick={() => void addSamples()}
                >
                  {adding ? "Adding…" : "Add test posts"}
                </Button>
              </WithTooltip>
            ) : null}
          </span>
        </div>

        {removing ? (
          <ChatRemoveForm
            client={client}
            onClose={() => setRemoving(false)}
            onRemoved={(item, reason, stop) => {
              setRemoving(false);
              refresh();
              announce(item, "remove", reason, stop);
            }}
          />
        ) : null}

        {queue.state === "failed" ? (
          <InlineError
            message={`Couldn't load the queue. ${queue.message}`}
            onRetry={queue.reload}
          />
        ) : null}

        {queue.data === null && queue.state === "loading" ? (
          <RowSkeleton rows={3} inset={false} label="Loading the queue" />
        ) : items.length === 0 && queue.data ? (
          <p className="py-2 text-muted">
            {view === "waiting"
              ? "Nothing's waiting. Clean posts publish on their own."
              : "Nothing decided yet."}
          </p>
        ) : (
          <ul aria-label={view === "waiting" ? "Waiting" : "Decided"}>
            {items.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                now={at}
                busy={busy === item.id}
                onResolve={(action, reason, stop) =>
                  void resolve(item, action, reason, stop)
                }
                onUndo={() => void undo(item)}
              />
            ))}
          </ul>
        )}
      </PageSection>
    </>
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

/** "safety check, 82%", "readers, noted only": who found it and how sure. */
function reasonDetail(r: ModerationReason): string {
  return [
    // "Reported by readers: …" already says who.
    r.source === "reports" ? null : SOURCE_WORDS[r.source],
    r.score !== undefined ? percent(r.score) : null,
    r.action === "flag" ? "noted only" : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
}

/** The reasons worth showing: not the panel's own bookkeeping. */
function heldFor(item: QueueItem): ModerationReason[] {
  return item.reasons.filter((r) => r.source !== "admin");
}

/** One held (or decided) post: a row of the list, the whole post inside. */
export function QueueRow({
  item,
  now,
  busy,
  onResolve,
  onUndo,
}: {
  item: QueueItem;
  now: Date;
  busy: boolean;
  onResolve: (
    action: "approve" | "remove",
    reason: AdminReason,
    stop: boolean,
  ) => void;
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
    <ListRow as="li" align="start" className={PAGE_ROW}>
      <article aria-labelledby={titleId} data-queue-item={item.id}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {item.urgent ? (
            <span className="bg-warn-soft px-1.5 font-medium text-sm text-warn">
              Urgent
            </span>
          ) : null}
          <h3 id={titleId} className="font-medium text-base">
            {itemTitle(item)}
          </h3>
          <span className="tnum ml-auto text-muted text-sm">
            {item.status === "closed" && item.closedAt
              ? `decided ${ago(item.closedAt, now)}`
              : `waiting ${waitedFor(item.createdAt, now)}`}
          </span>
        </div>
        {item.review ? (
          <p className="mt-1 text-muted text-sm">
            {reviewContextWords(item.review)}
          </p>
        ) : null}

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
                <mark key={i} className="bg-warn-soft text-fg">
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
            <h4 className="text-muted">Why it was held</h4>
            <ul className="mt-1 space-y-0.5">
              {reasons.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: reasons can repeat a code; order is fixed
                <li key={i}>
                  {REASON_WORDS[r.code]}
                  {r.report ? `: ${REPORT_WORDS[r.report]}` : ""}
                  {r.crossRoom ? `: ${CROSS_ROOM_WORDS[r.crossRoom]}` : ""}
                  {reasonDetail(r) ? (
                    <span className="text-muted"> · {reasonDetail(r)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {scores.length > 0 ? (
          <p className="mt-2 text-muted text-sm">
            Policy check:{" "}
            {scores
              .map(
                ([label, score]) => `${SCORE_WORDS[label]} ${percent(score)}`,
              )
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
                  onClick={() => onResolve("approve", "fine", false)}
                >
                  <Check size={14} aria-hidden="true" />
                  {publishWord(item)}
                </Button>
              </WithTooltip>
              <RemoveMenu
                suggested={suggestedRemoveReason(reasons)}
                stopLabel={stopWords(item.kind)}
                disabled={busy}
                onRemove={(reason, stop) => onResolve("remove", reason, stop)}
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
                {item.stoppedUntil
                  ? `. ${stoppedWords(item.kind, item.stoppedUntil)}`
                  : ""}
              </span>
              <WithTooltip
                label={
                  item.stoppedUntil
                    ? "Put it back in the queue, held, and lift the stop"
                    : "Put it back in the queue, held"
                }
              >
                <Button variant="outline" size="sm" onClick={onUndo}>
                  <Undo2 size={14} aria-hidden="true" />
                  Undo
                </Button>
              </WithTooltip>
            </>
          )}
        </div>
      </article>
    </ListRow>
  );
}

// An inline list, not a popup menu: the reasons and "Also stop this author"
// sit side by side, so ticking the stop never closes the list.
function RemoveMenu({
  suggested,
  stopLabel,
  disabled,
  onRemove,
}: {
  suggested: AdminReason;
  stopLabel: string;
  disabled: boolean;
  onRemove: (reason: AdminReason, stop: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stop, setStop] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const others = REMOVE_REASONS.filter((r) => r !== suggested);
  const choice = (reason: AdminReason, suggestion: boolean) => (
    <WithTooltip key={reason} label="Remove it for this reason. You can undo.">
      <Button
        variant={suggestion ? "outline" : "ghost"}
        size="row"
        disabled={disabled}
        onClick={() => onRemove(reason, stop)}
      >
        {ADMIN_REASON_WORDS[reason]}
      </Button>
    </WithTooltip>
  );
  return (
    <>
      <WithTooltip label="Remove it, with a reason. You can undo.">
        <Button
          ref={trigger}
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((was) => !was)}
        >
          <Trash2 size={14} aria-hidden="true" />
          Remove
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={open ? "rotate-180" : undefined}
          />
        </Button>
      </WithTooltip>
      {open ? (
        <fieldset
          id={listId}
          aria-label="Remove because"
          className="flex basis-full flex-wrap items-center gap-1"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            setOpen(false);
            trigger.current?.focus();
          }}
        >
          {/* The fieldset's name already says it. */}
          <span aria-hidden="true" className="mr-1 text-muted text-sm">
            Remove because
          </span>
          {choice(suggested, true)}
          {others.map((reason) => choice(reason, false))}
          <StopAuthor label={stopLabel} checked={stop} onChange={setStop} />
        </fieldset>
      ) : null}
    </>
  );
}
