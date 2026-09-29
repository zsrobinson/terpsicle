import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { RefreshCw, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { PanelNote } from "~/components/panel";
import { feedWords } from "~/core/todo";
import { relativeWords } from "~/core/words";
import { usePushAskCard } from "~/features/notifications/push-ask";
import { PushAskCard } from "~/features/notifications/push-ask-card";
import { useIsMobile } from "~/hooks/use-media-query";
import { Button } from "~/ui/button";
import { PageHeader } from "~/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { WithTooltip } from "~/ui/tooltip";
import { ConnectForm, ConnectSteps } from "./connect-form";
import { TODO_CONNECT_PATH } from "./todo-bar";
import { useTodo } from "./todo-store";
import { openElmsSettings, useTodoWorkbench } from "./workbench-store";

// ELMS in Todo's sidebar (the owner, 2026-09-29): its first part, as Chat's
// "Your classes" is, before the sections: "ELMS synced 3 minutes ago", and a
// settings icon at its right that opens a small popover (a sheet on a
// phone) to sync now or change the link. With no link yet, the line asks
// for one and the same popover takes the paste.

const TEXT_LINK =
  "text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg";

const TOO_SOON = "ELMS was synced in the last 5 minutes.";
const NO_ANSWER = "ELMS didn't answer. We'll try again in 20 minutes.";

/** The popover's title and the name of its button. */
const SETTINGS = "ELMS settings";

/** Sync now, with what it last said. */
function SyncNow() {
  const refresh = useTodo((s) => s.refresh);
  const refreshing = useTodo((s) => s.refreshing);
  const note = useTodo((s) => s.refreshNote);
  return (
    <>
      <WithTooltip label="Read your ELMS calendar again now">
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn(
              "size-3.5",
              refreshing && "animate-spin motion-reduce:animate-none",
            )}
          />
          {refreshing ? "Syncing…" : "Sync now"}
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

/** What's in the popover: the link's state, Sync now, and a new link. */
function ElmsSettings({
  hasFileItems,
  now,
  onDone,
}: {
  hasFileItems: boolean;
  now: number;
  onDone: () => void;
}) {
  const feed = useTodo((s) => s.feed);
  const words = feedWords(feed, now);
  const manage = (
    <WithTooltip label="Disconnect ELMS, or add a calendar file">
      <Link to={TODO_CONNECT_PATH} className={TEXT_LINK}>
        {feed ? "Disconnect or add a file" : "Add a calendar file instead"}
      </Link>
    </WithTooltip>
  );
  if (!feed)
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="emph-secondary">
          {hasFileItems
            ? "Some deadlines came from a file. Connect ELMS to keep them up to date."
            : "Your assignments and quizzes show up on their due dates, and stay up to date."}
        </p>
        <ConnectSteps />
        <ConnectForm stacked onConnected={onDone} />
        <p>{manage}</p>
      </div>
    );
  if (feed.status === "broken")
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p>{words.problem}</p>
        <ConnectSteps />
        <ConnectForm
          stacked
          submitLabel="Save the new link"
          onConnected={onDone}
        />
        <p>{manage}</p>
      </div>
    );
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p role="status" className="min-w-0 flex-1">
          {feed.lastSuccessAt
            ? `Synced ${relativeWords(feed.lastSuccessAt, now)}.`
            : "Connected. We haven't read it yet."}
          {words.problem ? (
            <span className="emph-secondary"> {words.problem}</span>
          ) : null}
        </p>
        <SyncNow />
      </div>
      <div className="flex flex-col gap-2 border-hairline border-t pt-3">
        <p className="emph-secondary">
          Reset your link in ELMS? Paste the new one here.
        </p>
        <ConnectForm
          stacked
          submitLabel="Save the new link"
          onConnected={onDone}
        />
      </div>
      <p>{manage}</p>
    </div>
  );
}

/**
 * The settings icon (or, with no link, Connect), and what it opens: a
 * popover under it on a desktop, a sheet on a phone.
 */
function ElmsSettingsButton({
  connected,
  hasFileItems,
  now,
}: {
  connected: boolean;
  hasFileItems: boolean;
  now: number;
}) {
  const open = useTodoWorkbench((s) => s.elmsOpen);
  const setOpen = openElmsSettings;
  const mobile = useIsMobile();
  const body = (
    <ElmsSettings
      hasFileItems={hasFileItems}
      now={now}
      onDone={() => setOpen(false)}
    />
  );
  const trigger = connected ? (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={SETTINGS}
      aria-expanded={open}
      className="-mr-1.5 aria-expanded:bg-hover aria-expanded:text-fg max-md:-my-1.5"
      onClick={mobile ? () => setOpen(true) : undefined}
    >
      <Settings2 aria-hidden="true" />
    </Button>
  ) : (
    <Button
      variant="outline"
      size="sm"
      className="max-md:-my-1.5"
      aria-expanded={open}
      onClick={mobile ? () => setOpen(true) : undefined}
    >
      Connect
    </Button>
  );
  const tooltip = connected
    ? "Sync ELMS now, or change its link"
    : "Paste your ELMS calendar link";
  // A phone's sheet is the page's (`ElmsSheet`), not the drawer's.
  if (mobile) return <WithTooltip label={tooltip}>{trigger}</WithTooltip>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <WithTooltip label={tooltip}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </WithTooltip>
      <PopoverContent
        side="bottom"
        align="end"
        role="dialog"
        aria-label={connected ? SETTINGS : "Connect ELMS"}
        className="w-80"
      >
        <p className="emph-heading mb-2 text-base">
          {connected ? "ELMS" : "Connect ELMS"}
        </p>
        {body}
      </PopoverContent>
    </Popover>
  );
}

/**
 * ELMS's settings on a phone: a sheet over the page, opened from the
 * drawer's line or the first visit. It's the page's, outside the drawer,
 * so it covers the tab bar as every sheet does.
 */
export function ElmsSheet({
  hasFileItems,
  now,
}: {
  hasFileItems: boolean;
  now: number;
}) {
  const open = useTodoWorkbench((s) => s.elmsOpen);
  const connected = useTodo((s) => s.feed !== null);
  return (
    <Sheet open={open} onOpenChange={openElmsSettings}>
      <SheetTitle className="px-4 pb-2">
        {connected ? SETTINGS : "Connect ELMS"}
      </SheetTitle>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-6">
        <ElmsSettings
          hasFileItems={hasFileItems}
          now={now}
          onDone={() => openElmsSettings(false)}
        />
      </div>
    </Sheet>
  );
}

/** The sidebar's first part: ELMS's last sync, and its settings. */
export function ElmsHeader({
  hasFileItems,
  now,
}: {
  hasFileItems: boolean;
  now: number;
}) {
  const feed = useTodo((s) => s.feed);
  const ready = useTodo((s) => s.phase === "ready");
  const refreshing = useTodo((s) => s.refreshing);
  // Connecting here asks for reminders here (V2 §6.7), under this line.
  usePushAskCard("todo-connected");
  const words = feedWords(feed, now);
  const line: ReactNode = !ready
    ? "Loading your deadlines…"
    : refreshing
      ? "Syncing ELMS…"
      : !feed
        ? "Connect ELMS to fill in your week"
        : feed.status === "broken"
          ? "ELMS stopped sharing your calendar"
          : (words.synced ?? "ELMS is connected");
  return (
    <section aria-label="ELMS" className="shrink-0">
      <PageHeader
        size="panel"
        title="Your deadlines"
        status={<span role="status">{line}</span>}
        actions={
          ready ? (
            <ElmsSettingsButton
              connected={feed !== null}
              hasFileItems={hasFileItems}
              now={now}
            />
          ) : null
        }
      />
      {ready && feed && feed.status !== "broken" && words.problem ? (
        <PanelNote className="border-hairline border-b">
          {words.problem}
        </PanelNote>
      ) : null}
      <PushAskCard moment="todo-connected" className="m-3" />
    </section>
  );
}
