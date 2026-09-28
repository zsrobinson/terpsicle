import { cn } from "cn";
import { ExternalLink } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { track } from "~/app/analytics";
import { type ConnectAnswer, connectWords, parseFeedLink } from "~/core/todo";
import { askForPush } from "~/features/notifications/push-ask";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import { WithTooltip } from "~/ui/tooltip";
import { useTodo } from "./todo-store";

// Connecting ELMS (docs/V3.md §3.2): three steps and a paste. The link is a
// secret: it's checked here for its shape, sent only in `todo/connect`'s
// body, never echoed back, and cleared as soon as the answer comes.

/** Where Calendar Feed is: step one of connecting. */
export const ELMS_CALENDAR_URL = "https://umd.instructure.com/calendar";

export const WHAT_COMES_THROUGH =
  "Assignments, quizzes and exams with a due date, and events your professors put on the ELMS calendar. Undated work and grades don't come through.";

export const LINK_IS_SECRET =
  "This link is a secret: anyone with it can read your due dates. We keep it encrypted and fetch it from our server, so reminders work when the app's closed. Disconnect any time.";

/**
 * Said while ELMS is asked. Connecting waits up to 25 seconds for Canvas to
 * build the feed, so the wait gets a reason, in words rather than a spinner.
 */
export const CONNECT_WAIT =
  "ELMS gathers every course's dates when we ask, so this can take up to half a minute.";

export function ConnectSteps() {
  return (
    <ol className="list-decimal space-y-1 pl-4 text-fg marker:text-muted">
      <li>
        Open{" "}
        <WithTooltip label="Opens your ELMS calendar in a new tab">
          <a
            href={ELMS_CALENDAR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline decoration-hairline-strong underline-offset-2 hover:decoration-fg"
          >
            your ELMS calendar
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </WithTooltip>
        .
      </li>
      <li>Click Calendar Feed at the bottom right and copy the link.</li>
      <li>Paste it here.</li>
    </ol>
  );
}

export function ConnectForm({
  onConnected,
  submitLabel = "Connect ELMS",
}: {
  onConnected?: () => void;
  submitLabel?: string;
}) {
  const connect = useTodo((s) => s.connect);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<ConnectAnswer | null>(null);
  const inputId = useId();
  const answerId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const pasted = value;
    // Cleared at once: the link lives only in this call now.
    setValue("");
    setAnswer(null);
    if (parseFeedLink(pasted) === null) {
      setAnswer({ status: "invalid-link" });
      track("todo_connect_result", { outcome: "invalid-link" });
      return;
    }
    setBusy(true);
    const result = await connect(pasted);
    setBusy(false);
    switch (result.status) {
      case "connected":
        track("todo_connect_result", { outcome: "connected" });
        onConnected?.();
        // Reminders just turned on (V3 §4): ask for them on this device.
        void askForPush("todo-connected");
        return;
      case "invalid-link":
        track("todo_connect_result", { outcome: "invalid-link" });
        break;
      case "unreachable":
      case "not-a-calendar":
        // Codes only: the reason never carries the link.
        track("todo_connect_result", {
          outcome: result.status,
          reason: result.reason,
        });
        break;
      default:
        // Our own server didn't answer: not an ELMS outcome.
        break;
    }
    setAnswer(result);
  };

  const note = busy ? CONNECT_WAIT : answer ? connectWords(answer) : null;

  return (
    <form
      onSubmit={(e) => void submit(e)}
      aria-busy={busy}
      className="flex flex-col gap-1.5"
    >
      <label htmlFor={inputId} className="font-medium text-muted text-xs">
        ELMS calendar link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* Above the field, so it never covers Connect ELMS below it on phones. */}
        <WithTooltip
          label="Paste the link from Calendar Feed in ELMS"
          side="top"
        >
          <Input
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-private=""
            aria-describedby={note ? answerId : undefined}
            placeholder="https://umd.instructure.com/feeds/calendars/user_….ics"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            className="ph-no-capture flex-1"
          />
        </WithTooltip>
        <WithTooltip label="Check the link with ELMS and start showing your deadlines">
          <Button type="submit" disabled={busy || value.trim() === ""}>
            {busy ? "Checking ELMS…" : submitLabel}
          </Button>
        </WithTooltip>
      </div>
      {/* Always there, so a screen reader hears the wait and then the answer. */}
      <p
        id={answerId}
        role="status"
        className={cn(
          "mt-0.5 text-sm empty:hidden",
          busy ? "text-muted" : "text-fg",
        )}
      >
        {note}
      </p>
    </form>
  );
}
