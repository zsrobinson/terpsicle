import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { feedWords } from "~/core/todo";
import { useAccount } from "~/features/auth/account-store";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { usePushAskCard } from "~/features/notifications/push-ask";
import { PushAskCard } from "~/features/notifications/push-ask-card";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton, Skeleton } from "~/ui/skeleton";
import { dismissToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import {
  ConnectForm,
  ConnectSteps,
  LINK_IS_SECRET,
  WHAT_COMES_THROUGH,
} from "./connect-form";
import { FileDrop } from "./file-drop";
import {
  TODO_CONNECT_PATH,
  TODO_PATH,
  TodoFrame,
  TodoOff,
  useNow,
} from "./todo-page";
import { useTodo } from "./todo-store";

// `/todo/connect` (docs/V3.md §3.2, §3.7): connect ELMS, see how the
// connection is doing, disconnect (Undo, no dialog), and add a calendar file.
// A note page, with Back to the list.

const DISCONNECT_TOAST = "todo-disconnect";

function Connection() {
  const { now } = useNow();
  const feed = useTodo((s) => s.feed);
  const disconnecting = useTodo((s) => s.disconnecting);
  const disconnect = useTodo((s) => s.disconnect);
  const undoDisconnect = useTodo((s) => s.undoDisconnect);
  const confirmDisconnect = useTodo((s) => s.confirmDisconnect);
  const [connected, setConnected] = useState(false);
  // Its card, once connecting asks (V2 §6.7).
  usePushAskCard("todo-connected");

  // Undo's window is over: the toast goes with it.
  useEffect(() => {
    if (!disconnecting) dismissToast(DISCONNECT_TOAST);
  }, [disconnecting]);

  const onDisconnect = () => {
    setConnected(false);
    disconnect();
    undoToast({
      id: DISCONNECT_TOAST,
      message: "ELMS disconnected",
      description: "We'll delete the link and its deadlines in a few seconds.",
      tooltip: "Keep ELMS connected",
      onUndo: undoDisconnect,
      onDone: confirmDisconnect,
    });
  };

  if (!feed)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted">{WHAT_COMES_THROUGH}</p>
        <ConnectSteps />
        <ConnectForm onConnected={() => setConnected(true)} />
        <p className="text-muted text-sm">{LINK_IS_SECRET}</p>
      </div>
    );

  const words = feedWords(feed, now);
  return (
    <div className="flex flex-col gap-3">
      {feed.status === "broken" ? (
        <>
          <p className="text-fg">{words.problem}</p>
          <ConnectSteps />
          <ConnectForm submitLabel="Connect the new link" />
        </>
      ) : (
        <>
          <p className="text-fg" role="status">
            {connected ? "Connected. " : "ELMS is connected. "}
            {words.checked ? `${words.checked}.` : "We haven't read it yet."}
          </p>
          {words.problem ? (
            <p className="text-muted text-sm">{words.problem}</p>
          ) : null}
          <p className="text-muted text-sm">
            We check it about every 20 minutes.
          </p>
          <PushAskCard moment="todo-connected" />
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <WithTooltip label="Back to your calendar">
          <Button asChild>
            <Link to={TODO_PATH}>See your calendar</Link>
          </Button>
        </WithTooltip>
        <WithTooltip label="Stop reading ELMS and delete the link and its deadlines">
          <Button variant="ghost" onClick={onDisconnect}>
            Disconnect
          </Button>
        </WithTooltip>
      </div>
      <p className="text-muted text-sm">{LINK_IS_SECRET}</p>
    </div>
  );
}

function SignedIn() {
  const { today } = useNow();
  const phase = useTodo((s) => s.phase);
  const load = useTodo((s) => s.load);
  const flushDisconnect = useTodo((s) => s.flushDisconnect);

  useEffect(() => {
    void load(today, Date.now());
  }, [load, today]);

  // Leaving the page ends Undo's window: send the disconnect now.
  useEffect(() => {
    window.addEventListener("pagehide", flushDisconnect);
    return () => window.removeEventListener("pagehide", flushDisconnect);
  }, [flushDisconnect]);

  return (
    <>
      <PageSection title="ELMS">
        {phase === "ready" ? (
          <Connection />
        ) : phase === "failed" ? (
          <InlineError
            message="We couldn't check your ELMS connection. Check your internet and try again."
            onRetry={() => void load(today, Date.now())}
          />
        ) : (
          <RowSkeleton
            rows={2}
            inset={false}
            label="Checking your ELMS connection"
          />
        )}
      </PageSection>
      <PageSection title="Add a calendar file">
        <p className="text-muted">
          Have deadlines that aren't in ELMS? Export them as an .ics file and
          add it here. It's read on this device; only the deadlines in it are
          saved. Files don't update. Drop a new one when your deadlines change.
        </p>
        <FileDrop />
      </PageSection>
    </>
  );
}

export function ConnectPage() {
  const status = useAccount((s) => s.status);
  const on = useAccount((s) => s.flags.todo);
  // Named like the list's "ELMS link" once there's one to look after;
  // until the connection's known, a placeholder rather than a wrong name.
  const title = useTodo((s) =>
    s.phase === "failed"
      ? "ELMS link"
      : s.phase !== "ready"
        ? null
        : s.feed
          ? "ELMS link"
          : "Connect ELMS",
  );
  if (status !== "loading" && !on) return <TodoOff />;
  return (
    <TodoFrame>
      <PageHeader
        title={
          status === "signed-out"
            ? "Connect ELMS"
            : (title ?? <Skeleton className="h-6 w-40" />)
        }
        back={{ label: "Todo", to: TODO_PATH }}
      />
      <div className="flex flex-col gap-6">
        {status === "loading" ? (
          <RowSkeleton rows={3} inset={false} label="Loading" />
        ) : status === "signed-out" ? (
          <div className="flex flex-col gap-3">
            <p className="text-fg">
              Sign in to connect ELMS. Your deadlines stay with your account.
            </p>
            <GoogleButton
              returnTo={TODO_CONNECT_PATH}
              from="todo"
              className="w-fit"
            />
          </div>
        ) : (
          <SignedIn />
        )}
      </div>
    </TodoFrame>
  );
}
