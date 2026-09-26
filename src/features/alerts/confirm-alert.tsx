import { useEffect, useRef, useState } from "react";
import type { ConfirmResult } from "~/core/schema";
import { SCHEDULE_PATH } from "~/core/site";
import { ApiCallError, api } from "~/server/fns/api";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { AlertPage, Code } from "./alert-page";
import { putAlertsInbox } from "./inbox";
import { courseHref, sectionLabel, termLabel } from "./labels";

type State =
  | { kind: "loading" }
  | { kind: "done"; result: ConfirmResult }
  | { kind: "error"; reason: ApiCallError["reason"] };

export interface ConfirmAlertProps {
  token: string | undefined;
  confirm?: typeof api.alerts.confirm;
  now?: () => Date;
}

/** Lands from the confirmation email: confirms once, then says "Watching". */
export function ConfirmAlert({
  token,
  confirm = api.alerts.confirm,
  now = () => new Date(),
}: ConfirmAlertProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Confirming spends the token, so it runs once even in React's dev double-mount.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ kind: "done", result: { status: "invalid-token" } });
      return;
    }
    confirm({ token })
      .then((result) => {
        if (result.status === "confirmed") {
          putAlertsInbox({
            termId: result.termId,
            sectionKey: result.sectionKey,
            subscriptionId: result.subscriptionId,
            manageToken: result.manageToken,
            status: "active",
            at: now().toISOString(),
          });
        }
        setState({ kind: "done", result });
      })
      .catch((error: unknown) =>
        setState({
          kind: "error",
          reason: error instanceof ApiCallError ? error.reason : "network",
        }),
      );
  }, [token, confirm, now]);

  if (state.kind === "loading")
    return <AlertPage title="Confirming your seat alert…" busy />;
  if (state.kind === "error") {
    return (
      <AlertPage title="We couldn't confirm your seat alert">
        <p>
          {state.reason === "unavailable"
            ? "Seat alerts are turned off right now. Your link still works later."
            : state.reason === "rate-limited"
              ? "Too many tries from this network. Wait a few minutes, then open the link again."
              : "Something went wrong on our side. Open the link again in a minute."}
        </p>
      </AlertPage>
    );
  }

  const { result } = state;
  if (result.status === "invalid-token") {
    return (
      <AlertPage title="This link doesn't work anymore">
        <p>
          Confirmation links work once, for 48 hours. To watch the section,
          click the bell next to it in Terpsicle and enter your email again.
        </p>
        <OpenApp href={SCHEDULE_PATH} label="Open Terpsicle" />
      </AlertPage>
    );
  }
  const section = <Code>{sectionLabel(result.sectionKey)}</Code>;
  return (
    <AlertPage title="Watching">
      <p>
        We'll email you when a seat opens in {section},{" "}
        {termLabel(result.termId)}. Every email has a link to stop.
      </p>
      <OpenApp
        href={courseHref(result.termId, result.sectionKey)}
        label="Open in Terpsicle"
      />
    </AlertPage>
  );
}

function OpenApp({ href, label }: { href: string; label: string }) {
  return (
    <WithTooltip label="Go to your schedule">
      <Button asChild>
        <a href={href}>{label}</a>
      </Button>
    </WithTooltip>
  );
}
