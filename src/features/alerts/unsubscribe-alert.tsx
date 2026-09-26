import { useEffect, useState } from "react";
import type { LookupResult } from "~/core/schema";
import { SCHEDULE_PATH } from "~/core/site";
import { ApiCallError, api } from "~/server/fns/api";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { AlertPage, Code } from "./alert-page";
import { courseHref, sectionLabel, termLabel } from "./labels";

type Found = Extract<LookupResult, { status: "found" }>;
type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "asking"; found: Found; working: boolean }
  | { kind: "stopped"; found: Found }
  | { kind: "error"; reason: ApiCallError["reason"] };

export interface UnsubscribeAlertProps {
  token: string | undefined;
  lookup?: typeof api.alerts.lookup;
  unsubscribe?: typeof api.alerts.unsubscribe;
}

const reasonOf = (error: unknown) =>
  error instanceof ApiCallError ? error.reason : "network";

/**
 * Lands from an alert email's "Stop alerts" link (and List-Unsubscribe).
 * Stopping asks first: the one confirmation SPEC §3.12 calls for.
 */
export function UnsubscribeAlert({
  token,
  lookup = api.alerts.lookup,
  unsubscribe = api.alerts.unsubscribe,
}: UnsubscribeAlertProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    let live = true;
    lookup({ token })
      .then((result) => {
        if (!live) return;
        if (result.status === "invalid-token") setState({ kind: "invalid" });
        else if (result.subscriptionStatus === "unsubscribed")
          setState({ kind: "stopped", found: result });
        else setState({ kind: "asking", found: result, working: false });
      })
      .catch(
        (error: unknown) =>
          live && setState({ kind: "error", reason: reasonOf(error) }),
      );
    return () => {
      live = false;
    };
  }, [token, lookup]);

  const stop = async (found: Found) => {
    if (!token) return;
    setState({ kind: "asking", found, working: true });
    try {
      const result = await unsubscribe({ token });
      setState(
        result.status === "unsubscribed"
          ? { kind: "stopped", found }
          : { kind: "invalid" },
      );
    } catch (error) {
      setState({ kind: "error", reason: reasonOf(error) });
    }
  };

  switch (state.kind) {
    case "loading":
      return <AlertPage title="Loading your seat alert…" busy />;
    case "invalid":
      return (
        <AlertPage title="This link doesn't work">
          <p>
            Use the “Stop alerts” link in your most recent seat-alert email.
          </p>
        </AlertPage>
      );
    case "error":
      return (
        <AlertPage title="We couldn't load your seat alert">
          <p>
            {state.reason === "rate-limited"
              ? "Too many tries from this network. Wait a few minutes, then open the link again."
              : "Something went wrong on our side. Open the link again in a minute."}
          </p>
        </AlertPage>
      );
    case "stopped":
      return (
        <AlertPage title="Seat alerts stopped">
          <p>
            You won't get emails about{" "}
            <Code>{sectionLabel(state.found.sectionKey)}</Code>,{" "}
            {termLabel(state.found.termId)}.
          </p>
          <WithTooltip label="Go to your schedule">
            <Button variant="outline" asChild>
              <a href={courseHref(state.found.termId, state.found.sectionKey)}>
                Open in Terpsicle
              </a>
            </Button>
          </WithTooltip>
        </AlertPage>
      );
    case "asking": {
      const { found, working } = state;
      return (
        <AlertPage title="Stop seat alerts?">
          <p>
            You'll stop getting emails when a seat opens in{" "}
            <Code>{sectionLabel(found.sectionKey)}</Code>,{" "}
            {termLabel(found.termId)}.
          </p>
          <div className="flex items-center gap-2">
            <WithTooltip label="No more emails about this section">
              <Button onClick={() => void stop(found)} disabled={working}>
                {working ? "Stopping…" : "Stop alerts"}
              </Button>
            </WithTooltip>
            <WithTooltip label="Leave the alert on">
              <Button variant="ghost" asChild>
                <a href={SCHEDULE_PATH}>Keep watching</a>
              </Button>
            </WithTooltip>
          </div>
        </AlertPage>
      );
    }
  }
}
