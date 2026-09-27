import type {
  TodoConnectResult,
  TodoFetchFailure,
  TodoHttpError,
} from "../schema";

// Why connecting ELMS didn't work (docs/V3.md §3.2), from the server's code
// to the form's one sentence. Each says what happened and what to do next,
// and none repeats the link.

/** A failed first fetch, as `todo/connect` answers it. */
export type ConnectFailure = Extract<
  TodoConnectResult,
  { status: "unreachable" | "not-a-calendar" }
>;

/**
 * How a failed first fetch reads: `unreachable` when ELMS didn't answer (a
 * timeout, a network error, a 5xx), `not-a-calendar` when it answered with
 * something else (a 4xx, a redirect off ELMS, something far too big). The
 * code goes along as the reason.
 */
export function connectFailure(code: TodoFetchFailure): ConnectFailure {
  return code === "timeout" || code === "network" || /^http-5/.test(code)
    ? { status: "unreachable", reason: code }
    : { status: "not-a-calendar", reason: code };
}

/**
 * Everything the connect form can say instead of connecting: the server's
 * answers, and three for a call to our own server that didn't come back
 * (`signed-out` for a gone session, `rate-limited` past `todo/connect`'s
 * hourly limit, `failed` for anything else).
 */
export type ConnectAnswer =
  | Exclude<TodoConnectResult, { status: "connected" }>
  | { status: "failed" | "signed-out" | "rate-limited" };

const COPY_AGAIN = "Copy it again from Calendar Feed";

/** The form's sentence for an answer. */
export function connectWords(answer: ConnectAnswer): string {
  switch (answer.status) {
    case "invalid-link":
      return "That isn't an ELMS calendar link. In ELMS, open Calendar, click Calendar Feed, and copy the link.";
    case "failed":
      return "That didn't go through. Check your connection and try again.";
    case "signed-out":
      return "You've been signed out. Sign in again to connect ELMS.";
    case "rate-limited":
      return "You've tried to connect a lot in the last hour. Try again later.";
    case "unreachable":
    case "not-a-calendar":
      return reasonWords(answer.reason);
  }
}

function reasonWords(reason: ConnectFailure["reason"]): string {
  switch (reason) {
    case "timeout":
      return "ELMS took too long to send your calendar. Try again in a minute.";
    case "network":
      return "We couldn't reach ELMS. Try again in a minute.";
    case "bad-redirect":
      return `ELMS sent us somewhere that isn't ELMS, so we stopped. ${COPY_AGAIN}.`;
    case "too-large":
      return "Your ELMS calendar is bigger than we can read (over 5 MB). Tell us with Feedback and we'll look into it.";
    case "not-recognized":
      return `ELMS sent something that isn't a calendar. ${COPY_AGAIN} and paste it here.`;
    default:
      return httpWords(reason);
  }
}

function httpWords(code: TodoHttpError): string {
  const status = Number(code.slice("http-".length));
  if (status === 404 || status === 410)
    return `ELMS doesn't know that link anymore; it changes if you reset it. ${COPY_AGAIN}.`;
  if (status === 401 || status === 403)
    return `ELMS turned the request away. ${COPY_AGAIN}, and if it happens again, tell us with Feedback.`;
  if (status === 429)
    return "ELMS is getting too many requests. Try again in a few minutes.";
  if (status >= 500)
    return "ELMS is having trouble right now. Try again in a few minutes.";
  return `ELMS answered with error ${status}. ${COPY_AGAIN}, and if it happens again, tell us with Feedback.`;
}
