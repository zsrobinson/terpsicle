import { scrubUrl } from "../analytics/scrub";
import type { ActivityEntry, FeedbackContext } from "../schema/feedback";

// The last check on "what I was doing" before it's stored (and before it
// leaves the browser): never a secret. Routes are scrubbed like analytics,
// and free-ish text (event values, settings, error messages and stacks)
// loses anything shaped like a link or a token: an ELMS feed link, a share
// link's plan or a session token can't pass through an error message.

/** Our own built files in a stack trace: kept, they make the stack useful. */
const ASSET_URL = /^https?:\/\/[^/\s]+\/assets\/[\w.-]+$/;
const URL_LIKE = /\b(?:https?|webcal|wss?):\/\/[^\s"'<>)]+/gi;
/** Long base64url or hex runs: tokens, keys, encoded plans. */
const TOKEN_LIKE = /[A-Za-z0-9_-]{32,}/g;

/** `text` with links (other than our /assets files) and tokens replaced. */
export function redactSecrets(text: string): string {
  return text
    .replace(URL_LIKE, (url) => {
      // A stack frame's ":line:col" isn't part of the file's name.
      const file = url.replace(/(?::\d+){1,2}$/, "");
      return ASSET_URL.test(file) ? url : "[link]";
    })
    .replace(TOKEN_LIKE, "[token]");
}

const clean = <V>(value: V): V =>
  (typeof value === "string" ? redactSecrets(value) : value) as V;

const cleanRecord = <V>(record: Record<string, V>): Record<string, V> =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, clean(value)]),
  );

function sanitizeEntry(entry: ActivityEntry): ActivityEntry {
  switch (entry.type) {
    case "nav":
      return { ...entry, route: scrubUrl(entry.route) };
    case "request":
      return { ...entry, route: scrubUrl(entry.route) };
    case "event":
      return { ...entry, props: cleanRecord(entry.props) };
    case "error":
      return {
        ...entry,
        message: redactSecrets(entry.message),
        stack: entry.stack === null ? null : redactSecrets(entry.stack),
      };
  }
}

/** The context with routes scrubbed and secrets redacted. */
export function sanitizeContext(context: FeedbackContext): FeedbackContext {
  return {
    ...context,
    route: scrubUrl(context.route),
    actions: context.actions.map(sanitizeEntry),
    settings: cleanRecord(context.settings),
  };
}
