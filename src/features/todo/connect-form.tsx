import { ExternalLink } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { track } from "~/app/analytics";
import { parseFeedLink } from "~/core/todo";
import { Button } from "~/ui/button";
import { Input } from "~/ui/input";
import { WithTooltip } from "~/ui/tooltip";
import { useTodo } from "./todo-store";

// Connecting ELMS (docs/V3.md §3.2): three steps and a paste. The link is a
// secret: it's checked here for its shape, sent only in `todo/connect`'s
// body, never echoed back, and cleared as soon as the answer comes.

export const WHAT_COMES_THROUGH =
  "Assignments, quizzes and exams with a due date, and events your professors put on the ELMS calendar. Undated work and grades don't come through.";

export const LINK_IS_SECRET =
  "This link is a secret: anyone with it can read your due dates. We keep it encrypted and fetch it from our server, so reminders work when the app's closed. Disconnect any time.";

const ANSWERS = {
  "invalid-link":
    "That isn't an ELMS calendar link. In ELMS, open Calendar, click Calendar Feed, and copy the link.",
  unreachable: "ELMS didn't answer. Try again in a minute.",
  "not-a-calendar":
    "ELMS didn't send a calendar for that link. Copy the link from Calendar Feed again and paste it here.",
  failed: "That didn't go through. Check your connection and try again.",
} as const;

export function ConnectSteps() {
  return (
    <ol className="list-decimal space-y-1 pl-4 text-fg marker:text-muted">
      <li>
        Open{" "}
        <WithTooltip label="Opens your ELMS calendar in a new tab">
          <a
            href="https://umd.instructure.com/calendar"
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
  const [answer, setAnswer] = useState<keyof typeof ANSWERS | null>(null);
  const inputId = useId();
  const answerId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const pasted = value;
    // Cleared at once: the link lives only in this call now.
    setValue("");
    setAnswer(null);
    if (parseFeedLink(pasted) === null) {
      setAnswer("invalid-link");
      track("todo_connect_result", { outcome: "invalid-link" });
      return;
    }
    setBusy(true);
    const status = await connect(pasted);
    setBusy(false);
    if (status !== "failed") track("todo_connect_result", { outcome: status });
    if (status === "connected") onConnected?.();
    else setAnswer(status);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="font-medium text-muted text-xs">
        ELMS calendar link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          data-private=""
          aria-describedby={answer ? answerId : undefined}
          placeholder="https://umd.instructure.com/feeds/calendars/user_….ics"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          className="ph-no-capture flex-1"
        />
        <WithTooltip label="Check the link with ELMS and start showing your deadlines">
          <Button type="submit" disabled={busy || value.trim() === ""}>
            {busy ? "Checking with ELMS…" : submitLabel}
          </Button>
        </WithTooltip>
      </div>
      {answer ? (
        <p id={answerId} role="status" className="mt-0.5 text-fg text-sm">
          {ANSWERS[answer]}
        </p>
      ) : null}
    </form>
  );
}
