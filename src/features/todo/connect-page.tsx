import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { feedWords } from "~/core/todo";
import { useAccount } from "~/features/auth/account-store";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { Button } from "~/ui/button";
import { undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import {
  ConnectForm,
  ConnectSteps,
  LINK_IS_SECRET,
  WHAT_COMES_THROUGH,
} from "./connect-form";
import { FileDrop } from "./file-drop";
import { GRADESCOPE_EXTENSIONS_NOTE } from "./todo-item";
import {
  ListSkeleton,
  TODO_CONNECT_PATH,
  TODO_PATH,
  TodoFrame,
  TodoOff,
  useNow,
} from "./todo-page";
import { useTodo } from "./todo-store";

// `/todo/connect` (docs/V3.md §3.2, §3.7): connect ELMS, see how the
// connection is doing, disconnect (Undo, no dialog), and add a calendar file.

const DISCONNECT_TOAST = "todo-disconnect";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-hairline border-t pt-4">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Connection() {
  const { now } = useNow();
  const feed = useTodo((s) => s.feed);
  const disconnecting = useTodo((s) => s.disconnecting);
  const disconnect = useTodo((s) => s.disconnect);
  const undoDisconnect = useTodo((s) => s.undoDisconnect);
  const [connected, setConnected] = useState(false);

  // Undo's window is over: the toast goes with it.
  useEffect(() => {
    if (!disconnecting) toast.dismiss(DISCONNECT_TOAST);
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
    });
  };

  if (!feed)
    return (
      <div className="space-y-4">
        <p className="text-muted">{WHAT_COMES_THROUGH}</p>
        <ConnectSteps />
        <ConnectForm onConnected={() => setConnected(true)} />
        <p className="text-muted text-sm">{LINK_IS_SECRET}</p>
      </div>
    );

  const words = feedWords(feed, now);
  return (
    <div className="space-y-3">
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
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <WithTooltip label="See your deadlines">
          <Button asChild className="h-11 md:h-8">
            <a href={TODO_PATH}>View todos</a>
          </Button>
        </WithTooltip>
        <WithTooltip label="Stop reading ELMS and delete the link and its deadlines">
          <Button
            variant="ghost"
            className="h-11 md:h-8"
            onClick={onDisconnect}
          >
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
      <Section title="ELMS">
        {phase === "ready" ? (
          <Connection />
        ) : phase === "failed" ? (
          <div className="space-y-3">
            <p className="text-fg">
              We couldn't check your connection. Check your internet and try
              again.
            </p>
            <WithTooltip label="Check the connection again">
              <Button
                variant="outline"
                onClick={() => void load(today, Date.now())}
              >
                Try again
              </Button>
            </WithTooltip>
          </div>
        ) : (
          <ListSkeleton />
        )}
      </Section>
      <Section title="Gradescope">
        <p className="text-muted">
          Gradescope work your professors link in ELMS comes through the feed,
          tagged Gradescope. We never ask for your Gradescope or ELMS password.
        </p>
        <p className="text-fg">{GRADESCOPE_EXTENSIONS_NOTE}</p>
      </Section>
      <Section title="Add a calendar file">
        <p className="text-muted">
          Have deadlines that aren't in ELMS? Export them as an .ics file and
          add it here. It's read on this device; only the deadlines in it are
          saved. Files don't update. Drop a new one when your deadlines change.
        </p>
        <FileDrop />
      </Section>
    </>
  );
}

export function ConnectPage() {
  const status = useAccount((s) => s.status);
  const on = useAccount((s) => s.flags.todo);
  if (status !== "loading" && !on) return <TodoOff />;
  return (
    <TodoFrame>
      <div className="mx-auto max-w-[560px] space-y-6">
        <div className="space-y-1">
          <WithTooltip label="Back to your deadlines">
            <a href={TODO_PATH} className="text-muted text-sm hover:text-fg">
              Todo
            </a>
          </WithTooltip>
          <h1 className="font-semibold text-xl tracking-tight">Connect ELMS</h1>
        </div>
        {status === "loading" ? (
          <ListSkeleton />
        ) : status === "signed-out" ? (
          <div className="space-y-3">
            <p className="text-fg">
              Sign in to connect ELMS. Your deadlines stay with your account.
            </p>
            <div className="max-w-[320px]">
              <GoogleButton returnTo={TODO_CONNECT_PATH} from="todo" />
            </div>
          </div>
        ) : (
          <SignedIn />
        )}
      </div>
    </TodoFrame>
  );
}
