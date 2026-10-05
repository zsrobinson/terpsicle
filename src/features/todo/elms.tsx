import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import {
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CalendarSync,
  CalendarX,
  RefreshCw,
} from "lucide-react";
import { SYNC_SLOT_CLASS, SyncSlotFace } from "~/components/workbench/status";
import { feedWords } from "~/core/todo";
import { relativeWords } from "~/core/words";
import { useIsMobile } from "~/hooks/use-media-query";
import { Button } from "~/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { WithTooltip } from "~/ui/tooltip";
import { ConnectForm, ConnectSteps } from "./connect-form";
import { TODO_CONNECT_PATH } from "./todo-bar";
import { syncTodoNow } from "./todo-mutations";
import { useElmsSync, useTodoList } from "./use-todo";
import { openElmsSettings, useTodoWorkbench } from "./workbench-store";

// Todo's sync, in the family bar (the owner, 2026-09-29): "ELMS synced 3
// minutes ago" under the week's dates, and the bar's sync slot
// (~/components/workbench/status), where Schedule and Plan show plan sync.
// Todo syncs two ways, with ELMS and with our own server (your tasks and
// checks), so the slot's popover (a sheet on a phone) says when each last
// synced, has Sync now, and takes a new ELMS link, or the first one. Its
// glyph is a calendar, for the ELMS feed it shows the state of: the cloud
// means your plans with your account, and nothing else.

const TEXT_LINK =
  "text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg";

const TOO_SOON = "ELMS was synced in the last 5 minutes.";
const NO_ANSWER = "ELMS didn't answer. We'll try again in 20 minutes.";

/** The slot's name and word, and its popover's name. */
export const SYNC_NAME = "Sync";

/** How Todo's sync is doing, for the bar's line and its slot. */
type SyncState = "loading" | "syncing" | "none" | "broken" | "stale" | "ok";

function useSyncState(
  now: number,
  ready: boolean,
): { state: SyncState; line: string } {
  const { feed, busy } = useElmsSync();
  const words = feedWords(feed, now);
  if (!ready) return { state: "loading", line: "Loading your deadlines…" };
  if (busy) return { state: "syncing", line: "Syncing ELMS…" };
  if (!feed) return { state: "none", line: "ELMS isn't connected" };
  if (feed.status === "broken")
    return { state: "broken", line: "ELMS stopped sharing your calendar" };
  if (words.problem)
    return { state: "stale", line: "ELMS didn't answer the last try" };
  return { state: "ok", line: words.synced ?? "ELMS is connected" };
}

/** The bar's line under the week: "ELMS synced 3 minutes ago". */
export function SyncLine({ now, ready }: { now: number; ready: boolean }) {
  const { line } = useSyncState(now, ready);
  return (
    <span role="status" className="tnum truncate">
      {line}
    </span>
  );
}

const ICONS: Record<SyncState, typeof CalendarCheck> = {
  loading: CalendarSync,
  syncing: CalendarSync,
  none: CalendarOff,
  broken: CalendarX,
  stale: CalendarClock,
  ok: CalendarCheck,
};

/** Sync now, with what ELMS last said. */
function SyncNow() {
  const client = useQueryClient();
  const { busy, note } = useElmsSync();
  return (
    <>
      <WithTooltip label="Read ELMS and your account's tasks again now">
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={() => void syncTodoNow(client)}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn(
              "size-3.5",
              busy && "animate-spin motion-reduce:animate-none",
            )}
          />
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </WithTooltip>
      {note ? (
        <p className="emph-secondary basis-full text-sm">
          {note === "too-soon" ? TOO_SOON : NO_ANSWER}
        </p>
      ) : null}
    </>
  );
}

/** One of the two syncs: what it is, and when it last synced. */
function SyncRow({ name, words }: { name: string; words: string }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="emph-label w-24 shrink-0">{name}</span>
      <span className="emph-secondary min-w-0">{words}</span>
    </p>
  );
}

/** The popover's body: each sync, Sync now, and ELMS's link. */
function SyncSettings({
  hasFileItems,
  now,
  onDone,
}: {
  hasFileItems: boolean;
  now: number;
  onDone: () => void;
}) {
  const { feed } = useElmsSync();
  const { listedAt } = useTodoList();
  const words = feedWords(feed, now);
  const ours =
    listedAt === null
      ? "Not read yet"
      : `Up to date ${relativeWords(listedAt, now)}`;
  const elms = !feed
    ? "Not connected"
    : feed.status === "broken"
      ? "Stopped sharing your calendar"
      : feed.lastSuccessAt
        ? `Synced ${relativeWords(feed.lastSuccessAt, now)}`
        : "Connected. We haven't read it yet.";
  const manage = (
    <WithTooltip label="Disconnect ELMS, or add a calendar file">
      <Link to={TODO_CONNECT_PATH} className={TEXT_LINK}>
        {feed ? "Disconnect or add a file" : "Add a calendar file instead"}
      </Link>
    </WithTooltip>
  );
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div role="status" className="flex flex-col gap-1">
        <SyncRow name="ELMS" words={elms} />
        <SyncRow name="Your tasks" words={ours} />
        {feed && feed.status !== "broken" && words.problem ? (
          <p className="emph-secondary">{words.problem}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <SyncNow />
      </div>
      <div className="flex flex-col gap-2 border-hairline border-t pt-3">
        {!feed ? (
          <>
            <p className="emph-heading">Connect ELMS</p>
            <p className="emph-secondary">
              {hasFileItems
                ? "Some deadlines came from a file. Connect ELMS to keep them up to date."
                : "Your assignments and quizzes show up on their due dates, and stay up to date."}
            </p>
            <ConnectSteps />
            <ConnectForm stacked onConnected={onDone} />
          </>
        ) : feed.status === "broken" ? (
          <>
            <p>{words.problem}</p>
            <ConnectSteps />
            <ConnectForm
              stacked
              submitLabel="Save the new link"
              onConnected={onDone}
            />
          </>
        ) : (
          <>
            <p className="emph-secondary">
              Reset your link in ELMS? Paste the new one here.
            </p>
            <ConnectForm
              stacked
              submitLabel="Save the new link"
              onConnected={onDone}
            />
          </>
        )}
      </div>
      <p>{manage}</p>
    </div>
  );
}

/**
 * The bar's sync slot, as Schedule's and Plan's (a glyph, then "Sync" from
 * 1280px), and what it opens: a popover on a desktop; on a phone the page's
 * sheet (`SyncSheet`).
 */
export function TodoSyncButton({
  hasFileItems,
  now,
  ready,
}: {
  hasFileItems: boolean;
  now: number;
  /** The week on screen has loaded. */
  ready: boolean;
}) {
  const open = useTodoWorkbench((s) => s.elmsOpen);
  const mobile = useIsMobile();
  const { state, line } = useSyncState(now, ready);
  const Icon = ICONS[state];
  const trigger = (
    <button
      type="button"
      aria-expanded={open}
      data-todo-sync={state}
      onClick={mobile ? () => openElmsSettings(true) : undefined}
      className={SYNC_SLOT_CLASS}
    >
      <SyncSlotFace
        icon={<Icon size={15} strokeWidth={1.75} aria-hidden="true" />}
        word={SYNC_NAME}
      />
    </button>
  );
  const tooltip = `${line}. Sync ELMS and your tasks, or change the ELMS link`;
  if (mobile) return <WithTooltip label={tooltip}>{trigger}</WithTooltip>;
  return (
    <Popover open={open} onOpenChange={openElmsSettings}>
      <WithTooltip label={tooltip} side="bottom">
        <PopoverTrigger render={trigger} />
      </WithTooltip>
      <PopoverContent
        side="bottom"
        align="end"
        role="dialog"
        aria-label={SYNC_NAME}
        className="w-80"
      >
        <p className="emph-heading mb-2 text-base">{SYNC_NAME}</p>
        <SyncSettings
          hasFileItems={hasFileItems}
          now={now}
          onDone={() => openElmsSettings(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The sync's settings on a phone: a sheet over the page, opened from the
 * bar's sync slot or the first visit. It's the page's, outside the drawer, so
 * it covers the tab bar as every sheet does.
 */
export function SyncSheet({
  hasFileItems,
  now,
}: {
  hasFileItems: boolean;
  now: number;
}) {
  const open = useTodoWorkbench((s) => s.elmsOpen);
  return (
    <Sheet open={open} onOpenChange={openElmsSettings}>
      <SheetTitle className="px-4 pb-2">{SYNC_NAME}</SheetTitle>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-6">
        <SyncSettings
          hasFileItems={hasFileItems}
          now={now}
          onDone={() => openElmsSettings(false)}
        />
      </div>
    </Sheet>
  );
}
