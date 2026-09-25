import { BellRing, MailCheck } from "lucide-react";
import { useState } from "react";
import { PanelLabel } from "~/app/panel";
import type { LocalSeatAlert, TermId } from "~/core/schema";
import { sectionLabel, termLabel } from "~/features/alerts/labels";
import {
  stopSeatAlert,
  useSeatAlertList,
  useSeatAlertsAvailable,
} from "~/features/alerts/seat-alerts";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

// Export → Seat alerts (SPEC §3.12): the sections this browser watches.
// Stopping one asks first: the one confirmation in the app, kept inline
// rather than in a dialog.

export function SeatAlertsList({ termId }: { termId: TermId }) {
  const available = useSeatAlertsAvailable();
  const alerts = useSeatAlertList();
  if (!available || alerts.length === 0) return null;
  return (
    <section aria-label="Seat alerts">
      <PanelLabel>Seat alerts</PanelLabel>
      <ul className="mx-4 overflow-hidden rounded-lg border border-hairline">
        {alerts.map((alert) => (
          <AlertRow
            key={`${alert.termId}|${alert.sectionKey}`}
            alert={alert}
            showTerm={alert.termId !== termId}
          />
        ))}
      </ul>
    </section>
  );
}

type RowState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "stopping" }
  | { kind: "message"; text: string };

function AlertRow({
  alert,
  showTerm,
}: {
  alert: LocalSeatAlert;
  showTerm: boolean;
}) {
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const label = sectionLabel(alert.sectionKey);
  const watching = alert.status === "active";

  const stop = async () => {
    setState({ kind: "stopping" });
    const outcome = await stopSeatAlert(alert.termId, alert.sectionKey);
    if (outcome.status === "stopped") return; // The row goes away.
    setState({
      kind: "message",
      text:
        outcome.status === "no-token"
          ? "This watch was confirmed on another device. To stop it, use the stop link in any seat-alert email."
          : outcome.message,
    });
  };

  return (
    <li
      className="border-hairline border-b px-3 py-2.5 last:border-b-0"
      data-testid={`seat-alert-${alert.sectionKey}`}
    >
      <div className="flex items-center gap-2">
        {watching ? (
          <BellRing size={13} className="shrink-0 text-muted" aria-hidden />
        ) : (
          <MailCheck size={13} className="shrink-0 text-muted" aria-hidden />
        )}
        <span className="font-mono font-semibold text-[12.5px]">{label}</span>
        {showTerm ? (
          <span className="text-[11.5px] text-muted">
            {termLabel(alert.termId)}
          </span>
        ) : null}
        <span className="ml-auto text-[11.5px] text-muted">
          {watching ? "Watching" : "Check your email"}
        </span>
      </div>
      {state.kind === "confirming" || state.kind === "stopping" ? (
        <fieldset
          aria-label={`Stop watching ${label}?`}
          className="mt-2 flex items-center gap-2 pl-5"
          onKeyDown={(e) => {
            if (e.key === "Escape" && state.kind === "confirming") {
              e.stopPropagation();
              setState({ kind: "idle" });
            }
          }}
        >
          <span className="flex-1 text-[12px]">Stop these emails?</span>
          <WithTooltip label="Keep watching" shortcut="Esc">
            <Button
              size="sm"
              variant="ghost"
              className="text-[12px]"
              disabled={state.kind === "stopping"}
              onClick={() => setState({ kind: "idle" })}
            >
              Keep
            </Button>
          </WithTooltip>
          <WithTooltip label={`No more emails about ${label}`}>
            <Button
              size="sm"
              variant="outline"
              className="text-[12px]"
              disabled={state.kind === "stopping"}
              onClick={() => void stop()}
            >
              {state.kind === "stopping" ? "Stopping…" : "Stop watching"}
            </Button>
          </WithTooltip>
        </fieldset>
      ) : (
        <div className="mt-0.5 flex items-center gap-2 pl-5">
          <span
            className="min-w-0 flex-1 truncate text-[11.5px] text-muted"
            data-private
          >
            {state.kind === "message"
              ? state.text
              : watching
                ? alert.email
                  ? `Emails go to ${alert.email}`
                  : "We'll email you when a seat opens"
                : "Click the link we sent to start watching"}
          </span>
          <WithTooltip
            label={
              watching
                ? "Stop the emails for this section"
                : "Cancel this request"
            }
          >
            <button
              type="button"
              onClick={() => setState({ kind: "confirming" })}
              className="shrink-0 rounded px-1 text-[11.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              Stop watching
            </button>
          </WithTooltip>
        </div>
      )}
    </li>
  );
}
