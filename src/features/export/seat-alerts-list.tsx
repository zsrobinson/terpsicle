import { BellRing, MailCheck } from "lucide-react";
import { useState } from "react";
import { ListRow, SectionHeader } from "~/app/panel";
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
      <SectionHeader title="Seat alerts" count={alerts.length} />
      <ul>
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
    <ListRow
      as="li"
      className="items-start"
      data-testid={`seat-alert-${alert.sectionKey}`}
      lead={
        watching ? (
          <BellRing size={13} className="mt-0.5 text-muted" aria-hidden />
        ) : (
          <MailCheck size={13} className="mt-0.5 text-muted" aria-hidden />
        )
      }
      trail={
        <span className="text-muted">
          {watching ? "Watching" : "Check your email"}
        </span>
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="ident font-semibold text-base">{label}</span>
        {showTerm ? (
          <span className="text-muted text-sm">{termLabel(alert.termId)}</span>
        ) : null}
      </div>
      {state.kind === "confirming" || state.kind === "stopping" ? (
        <fieldset
          aria-label={`Stop watching ${label}?`}
          className="mt-2 flex items-center gap-2"
          onKeyDown={(e) => {
            if (e.key === "Escape" && state.kind === "confirming") {
              e.stopPropagation();
              setState({ kind: "idle" });
            }
          }}
        >
          <span className="flex-1 text-sm">Stop these emails?</span>
          <WithTooltip label="Keep watching" shortcut="Esc">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-sm"
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
              className="h-6 px-2 text-sm"
              disabled={state.kind === "stopping"}
              onClick={() => void stop()}
            >
              {state.kind === "stopping" ? "Stopping…" : "Stop watching"}
            </Button>
          </WithTooltip>
        </fieldset>
      ) : (
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-muted text-sm"
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
              className="shrink-0 rounded px-1 text-muted text-sm transition-colors hover:bg-hover hover:text-fg"
            >
              Stop watching
            </button>
          </WithTooltip>
        </div>
      )}
    </ListRow>
  );
}
