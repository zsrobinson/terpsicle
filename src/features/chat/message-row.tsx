import { cn } from "cn";
import {
  Check,
  CircleHelp,
  Copy,
  Ellipsis,
  Eye,
  Flag,
  Laugh,
  type LucideIcon,
  Pencil,
  Reply,
  SmilePlus,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { type KeyboardEvent, memo, useId, useState } from "react";
import {
  CHAT_REPORT_REASON_WORDS,
  type ChatItem,
  chatErrorWords,
  clockWords,
  heldWords,
  REACTION_WORDS,
  threadWords,
  whenWords,
} from "~/core/chat";
import {
  CHAT_TEXT_MAX,
  type ChatAuthor,
  REACTIONS,
  REPORT_NOTE_MAX,
  type Reaction,
  type ReportReason,
} from "~/core/schema";
import { Avatar } from "~/features/auth/avatar";
import { Button } from "~/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";
import { showNote } from "./undo";

// One message (V2.md §8.6): the author's name and picture, the text as plain
// text (never HTML), reactions, the thread under it, and what only its
// author sees (still checking, held, removed) in muted words, never red.
// Hover, focus or a tap shows its actions; a long press on a phone does too.

export const REACTION_ICONS: Readonly<Record<Reaction, LucideIcon>> = {
  thumbs: ThumbsUp,
  check: Check,
  eyes: Eye,
  laugh: Laugh,
  question: CircleHelp,
};

export type ReportOutcome = "reported" | "own" | "not-found" | "failed";

export interface MessageActions {
  openThread: (item: ChatItem) => void;
  edit: (item: ChatItem, text: string) => Promise<boolean>;
  remove: (item: ChatItem) => void;
  react: (item: ChatItem, reaction: Reaction, on: boolean) => void;
  retry: (item: ChatItem) => void;
  discard: (item: ChatItem) => void;
  report: (
    item: ChatItem,
    reason: ReportReason,
    note: string | null,
  ) => Promise<ReportOutcome>;
}

export const MessageRow = memo(function MessageRow({
  item,
  you,
  now,
  showHeader,
  inThread,
  writable,
  actions,
}: {
  item: ChatItem;
  you: ChatAuthor | null;
  now: number;
  /** First of a run by one person: name, picture and time. */
  showHeader: boolean;
  /** In a thread view: replies have no thread of their own. */
  inThread: boolean;
  writable: boolean;
  actions: MessageActions;
}) {
  const [selected, setSelected] = useState(false);
  const [mode, setMode] = useState<"read" | "edit" | "report">("read");
  const mine = you !== null && item.author.directoryId === you.directoryId;
  const visible = item.moderation.state === "visible" && !item.local;
  const held = mine && !item.local ? heldWords(item.moderation) : null;
  const nowIso = new Date(now).toISOString();
  const when = whenWords(item.createdAt, nowIso);

  return (
    <article
      aria-label={`${item.author.name}, ${when}`}
      data-message-id={item.id}
      onContextMenu={(e) => {
        // A long press on a phone opens the message's actions.
        if (window.matchMedia?.("(pointer: coarse)").matches) {
          e.preventDefault();
          setSelected(true);
        }
      }}
      onPointerUp={(e) => {
        // A tap on a phone shows the message's actions; so does a long press.
        if (e.pointerType !== "touch") return;
        if (
          (e.target as HTMLElement).closest("button, a, textarea, input, label")
        )
          return;
        setSelected((was) => !was);
      }}
      className={cn(
        "group relative flex gap-3 px-4 transition-colors hover:bg-hover",
        showHeader ? "pt-2 pb-1" : "py-0.5",
        selected && "bg-hover",
      )}
    >
      <div className="w-8 shrink-0 pt-0.5">
        {showHeader ? (
          <Avatar name={item.author.name} src={item.author.picture} size="md" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        {showHeader ? (
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold" data-private="">
              {item.author.name}
            </span>
            <WithTooltip label={new Date(item.createdAt).toLocaleString()}>
              <time
                dateTime={item.createdAt}
                className="tnum shrink-0 text-muted text-xs"
              >
                {clockWords(item.createdAt)}
              </time>
            </WithTooltip>
          </div>
        ) : null}
        {mode === "edit" ? (
          <EditBox
            text={item.text}
            onCancel={() => setMode("read")}
            onSave={async (text) => {
              if (await actions.edit(item, text)) setMode("read");
            }}
          />
        ) : (
          <p
            data-message-body=""
            // A classmate's words: boxed out of feedback screenshots.
            data-private=""
            className={cn(
              "whitespace-pre-wrap break-words",
              (item.local || (mine && !visible)) && "text-muted",
            )}
          >
            {item.text}
            {item.editedAt ? (
              <WithTooltip label={`Edited ${whenWords(item.editedAt, nowIso)}`}>
                <span className="ml-1 text-muted text-xs">(edited)</span>
              </WithTooltip>
            ) : null}
          </p>
        )}
        <LocalState item={item} held={held} actions={actions} />
        {Object.keys(item.reactions).length > 0 ? (
          <Reactions
            item={item}
            you={you}
            canReact={writable && visible}
            onReact={actions.react}
          />
        ) : null}
        {!inThread && item.thread ? (
          <WithTooltip label="Open the thread">
            <button
              type="button"
              onClick={() => actions.openThread(item)}
              className="mt-1 flex items-center gap-1.5 text-sm font-medium text-fg underline-offset-2 hover:underline max-md:min-h-11"
            >
              <Reply size={13} aria-hidden="true" className="text-muted" />
              {threadWords(item.thread, nowIso)}
            </button>
          </WithTooltip>
        ) : null}
        {mode === "report" ? (
          <ReportForm
            onCancel={() => setMode("read")}
            onSend={(reason, note) => actions.report(item, reason, note)}
          />
        ) : null}
      </div>
      {item.local || mode !== "read" ? null : (
        <Toolbar
          item={item}
          mine={mine}
          visible={visible}
          writable={writable}
          inThread={inThread}
          shown={selected}
          you={you}
          actions={actions}
          onEdit={() => setMode("edit")}
          onReport={() => setMode("report")}
        />
      )}
    </article>
  );
});

/** Sending, refused, or (yours only) held: said quietly under the text. */
function LocalState({
  item,
  held,
  actions,
}: {
  item: ChatItem;
  held: string | null;
  actions: MessageActions;
}) {
  if (item.local?.state === "sending")
    return <p className="text-muted text-sm">Sending…</p>;
  if (item.local?.state === "failed")
    return (
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="text-muted" role="status">
          {chatErrorWords(item.local.error ?? "bad-frame")}
        </span>
        <WithTooltip label="Send it again">
          <Button
            variant="link"
            size="row"
            className="px-0 max-md:h-11"
            onClick={() => actions.retry(item)}
          >
            Try again
          </Button>
        </WithTooltip>
        <WithTooltip label="Don't send it">
          <Button
            variant="link"
            size="row"
            className="px-0 max-md:h-11"
            onClick={() => actions.discard(item)}
          >
            Discard
          </Button>
        </WithTooltip>
      </div>
    );
  if (held)
    return (
      <p className="text-muted text-sm" data-testid="held-note">
        {held}
      </p>
    );
  return null;
}

function reactedWords(
  reaction: Reaction,
  who: readonly string[],
  you: ChatAuthor | null,
): string {
  const yours = you !== null && who.includes(you.directoryId);
  const others = who.length - (yours ? 1 : 0);
  const people = yours
    ? others === 0
      ? "You"
      : `You and ${others} other${others === 1 ? "" : "s"}`
    : `${who.length} ${who.length === 1 ? "person" : "people"}`;
  return `${REACTION_WORDS[reaction]}: ${people}`;
}

function Reactions({
  item,
  you,
  canReact,
  onReact,
}: {
  item: ChatItem;
  you: ChatAuthor | null;
  canReact: boolean;
  onReact: MessageActions["react"];
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {REACTIONS.map((reaction) => {
        const who = item.reactions[reaction];
        if (!who) return null;
        const Icon = REACTION_ICONS[reaction];
        const yours = you !== null && who.includes(you.directoryId);
        return (
          <WithTooltip key={reaction} label={reactedWords(reaction, who, you)}>
            <button
              type="button"
              aria-pressed={yours}
              aria-label={reactedWords(reaction, who, you)}
              disabled={!canReact}
              onClick={() => onReact(item, reaction, !yours)}
              className={cn(
                "tnum flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors max-md:h-11 max-md:px-3",
                yours
                  ? "border-fg bg-accent-soft text-fg"
                  : "border-hairline-strong text-muted hover:bg-hover",
              )}
            >
              <Icon size={12} aria-hidden="true" />
              {who.length}
            </button>
          </WithTooltip>
        );
      })}
    </div>
  );
}

function ReactionPicker({
  item,
  you,
  onReact,
  open,
  setOpen,
}: {
  item: ChatItem;
  you: ChatAuthor | null;
  onReact: MessageActions["react"];
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <WithTooltip label="React">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="React"
            className="max-md:size-11"
          >
            <SmilePlus />
          </Button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent align="end" className="flex w-auto gap-1 p-1">
        {REACTIONS.map((reaction) => {
          const Icon = REACTION_ICONS[reaction];
          const yours =
            you !== null &&
            (item.reactions[reaction] ?? []).includes(you.directoryId);
          return (
            <WithTooltip key={reaction} label={REACTION_WORDS[reaction]}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={REACTION_WORDS[reaction]}
                aria-pressed={yours}
                className="aria-pressed:bg-accent-soft max-md:size-11"
                onClick={() => {
                  onReact(item, reaction, !yours);
                  setOpen(false);
                }}
              >
                <Icon />
              </Button>
            </WithTooltip>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function Toolbar({
  item,
  mine,
  visible,
  writable,
  inThread,
  shown,
  you,
  actions,
  onEdit,
  onReport,
}: {
  item: ChatItem;
  mine: boolean;
  visible: boolean;
  writable: boolean;
  inThread: boolean;
  shown: boolean;
  you: ChatAuthor | null;
  actions: MessageActions;
  onEdit: () => void;
  onReport: () => void;
}) {
  // Open menus keep the toolbar up: they're anchored to it.
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const canReply = writable && visible && !inThread && item.replyTo === null;
  const removed = item.moderation.state === "removed";
  return (
    <div
      className={cn(
        "absolute -top-3 right-4 z-10 items-center border border-keyline bg-raised shadow-offset",
        shown || menuOpen || pickerOpen
          ? "flex"
          : "hidden group-focus-within:flex group-hover:flex",
      )}
    >
      {writable && visible ? (
        <ReactionPicker
          item={item}
          you={you}
          onReact={actions.react}
          open={pickerOpen}
          setOpen={setPickerOpen}
        />
      ) : null}
      {canReply ? (
        <WithTooltip label="Reply in a thread">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reply in a thread"
            className="max-md:size-11"
            onClick={() => actions.openThread(item)}
          >
            <Reply />
          </Button>
        </WithTooltip>
      ) : null}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <WithTooltip label="More">
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More"
              className="max-md:size-11"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
        </WithTooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => void navigator.clipboard?.writeText(item.text)}
          >
            <Copy aria-hidden="true" />
            Copy text
          </DropdownMenuItem>
          {mine && writable && !removed ? (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden="true" />
              Edit
            </DropdownMenuItem>
          ) : null}
          {mine ? (
            <DropdownMenuItem onSelect={() => actions.remove(item)}>
              <Trash2 aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onReport}>
              <Flag aria-hidden="true" />
              Report
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EditBox({
  text,
  onSave,
  onCancel,
}: {
  text: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    await onSave(trimmed);
    setBusy(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void save();
    }
  };
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <label htmlFor={id} className="sr-only">
        Edit your message
      </label>
      <textarea
        id={id}
        // biome-ignore lint/a11y/noAutofocus: the person just chose Edit
        autoFocus
        value={draft}
        maxLength={CHAT_TEXT_MAX}
        rows={Math.min(6, draft.split("\n").length + 1)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full resize-none border border-hairline-strong bg-bg px-2 py-1.5 text-base text-fg focus-visible:border-fg"
      />
      <div className="flex gap-2">
        <WithTooltip label="Save the edit" shortcut="↵">
          <Button
            size="sm"
            className="max-md:h-11"
            disabled={busy || !draft.trim()}
            onClick={() => void save()}
          >
            Save
          </Button>
        </WithTooltip>
        <WithTooltip label="Keep it as it was" shortcut="Esc">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="max-md:h-11"
          >
            Cancel
          </Button>
        </WithTooltip>
      </div>
    </div>
  );
}

const REASONS = Object.keys(CHAT_REPORT_REASON_WORDS) as ReportReason[];

/** Report, inline (V2 §8.6): a reason, an optional note, and a plain thank-you. */
function ReportForm({
  onSend,
  onCancel,
}: {
  onSend: (reason: ReportReason, note: string | null) => Promise<ReportOutcome>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<
    "idle" | "busy" | Exclude<ReportOutcome, "reported">
  >("idle");
  const name = useId();
  if (state === "not-found" || state === "own")
    return (
      <p role="status" className="mt-1 text-muted text-sm">
        {state === "own"
          ? "That's your message. You can edit or delete it instead."
          : "That message isn't there anymore."}{" "}
        <WithTooltip label="Close">
          <Button variant="link" size="row" className="px-0" onClick={onCancel}>
            OK
          </Button>
        </WithTooltip>
      </p>
    );
  return (
    <form
      aria-label="Report this message"
      className="mt-2 flex flex-col gap-2 border border-hairline-strong bg-bg p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!reason) return;
        setState("busy");
        const outcome = await onSend(reason, note.trim() || null);
        // A toast, since a report can take the message off your screen.
        if (outcome === "reported") {
          showNote("Thanks. A person will look at it.");
          onCancel();
        } else setState(outcome);
      }}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium text-sm">
          What's wrong with it?
        </legend>
        {REASONS.map((r) => (
          <label
            key={r}
            className="flex min-h-7 items-center gap-2 text-sm max-md:min-h-11"
          >
            <input
              type="radio"
              name={name}
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
            />
            {CHAT_REPORT_REASON_WORDS[r]}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">
          Anything a person should know? (optional)
        </span>
        <textarea
          value={note}
          maxLength={REPORT_NOTE_MAX}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="w-full resize-none border border-hairline-strong bg-bg px-2 py-1.5 text-base text-fg focus-visible:border-fg"
        />
      </label>
      {state === "failed" ? (
        <p role="status" className="text-muted text-sm">
          That didn't send. Try again.
        </p>
      ) : null}
      <div className="flex gap-2">
        <WithTooltip label="A person checks every report">
          <Button
            type="submit"
            size="sm"
            disabled={!reason || state === "busy"}
          >
            Send report
          </Button>
        </WithTooltip>
        <WithTooltip label="Don't report it">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </WithTooltip>
      </div>
    </form>
  );
}
