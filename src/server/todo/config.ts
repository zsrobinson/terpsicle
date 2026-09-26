// Whether Todo works here, and with which key and fetch (docs/V3.md §3.3,
// §3.8). `TODO_ENABLED` is the switch; production also needs the secret
// TODO_FEED_KEY. Test mode (previews, `pnpm dev:mock`, e2e) uses a fixed key
// and answers feed links from the fixture feed instead of the network.
import { newYorkDateOf, TEST_FEED_TOKENS, testFeedIcs } from "~/core/todo";
import {
  type FeedKeys,
  type FeedKeyVars,
  loadFeedKeys,
  TEST_FEED_KEY_VARS,
} from "./crypto";

export interface TodoEnv extends FeedKeyVars {
  DB: D1Database;
  /** `on` | `off` (anything else is off). */
  TODO_ENABLED?: string;
  /** The cron's test mode (a request's comes from its host too). */
  AUTH_TEST_MODE?: string;
  POSTHOG_TOKEN?: string;
}

export type TodoMode =
  | { kind: "off" }
  | { kind: "live" | "test"; keys: FeedKeys; fetch: typeof fetch };

const enabled = (env: TodoEnv) => env.TODO_ENABLED === "on";

/** For `/api/me`'s flags: whether `todoMode` would find Todo on. */
export function todoAvailable(env: TodoEnv, testMode: boolean): boolean {
  return enabled(env) && (testMode || Boolean(env.TODO_FEED_KEY));
}

let warned = false;

/**
 * Todo's mode for a request or a cron run. `testMode` comes from the
 * request's host (auth's `isTestMode`) or, in a cron, `AUTH_TEST_MODE`,
 * which production never sets.
 */
export async function todoMode(
  env: TodoEnv,
  options: { testMode: boolean; fetch: typeof fetch; now: Date },
): Promise<TodoMode> {
  if (!enabled(env)) return { kind: "off" };
  if (options.testMode) {
    const keys = await loadFeedKeys(TEST_FEED_KEY_VARS);
    // The fixed key always loads; null would mean the constant was edited.
    if (!keys) return { kind: "off" };
    return { kind: "test", keys, fetch: testFeedFetch(options.now) };
  }
  const keys = await loadFeedKeys(env);
  if (!keys) {
    if (env.TODO_FEED_KEY && !warned) {
      warned = true;
      // Names only: never the value.
      console.error({
        todo: "TODO_FEED_KEY must be 32 bytes of base64url, with TODO_FEED_KEY_ID set",
      });
    }
    return { kind: "off" };
  }
  return { kind: "live", keys, fetch: options.fetch };
}

/**
 * Test mode's ELMS: the calendar token answers the fixture feed dated from
 * `now`, the not-a-calendar token a web page, and anything else 404.
 */
export function testFeedFetch(now: Date): typeof fetch {
  return async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    const token = /\/user_([A-Za-z0-9]+)\.ics$/.exec(
      new URL(url).pathname,
    )?.[1];
    if (token === TEST_FEED_TOKENS.calendar)
      return new Response(testFeedIcs(newYorkDateOf(now.getTime())), {
        headers: { "Content-Type": "text/calendar; charset=utf-8" },
      });
    if (token === TEST_FEED_TOKENS.notCalendar)
      return new Response("<!doctype html><title>ELMS</title>", {
        headers: { "Content-Type": "text/html" },
      });
    return new Response("Not found", { status: 404 });
  };
}
