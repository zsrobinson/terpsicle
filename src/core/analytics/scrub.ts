// Direct module paths, not the barrels: this loads on every page with
// src/app/analytics.ts, and ~/core/share brings the share codec with it.
import { SIGNIN_ERROR_PARAM } from "../schema/auth";
import { isUnderRoute } from "./routes";

// What PostHog may see of a URL, and the last check on every event before it
// leaves the browser (PostHog's `before_send`; docs/ANALYTICS.md "Privacy").
// A share link carries a whole plan, block labels included (DATA.md §8), and
// a chat room's path names a course and a section (V2.md §11), so URLs keep
// only their route and a few search params that describe the page.

/**
 * Search params that describe the page, not the person: a tab, a view, a
 * term, a step, where a link came from, a sign-in error code. Everything else
 * is dropped, and `plan` (a share link) becomes `plan=shared`.
 */
export const QUERY_ALLOWLIST: readonly string[] = [
  "tab",
  "view",
  "term",
  "semester",
  "step",
  "from",
  SIGNIN_ERROR_PARAM,
];

/** `SHARE_PARAM` in ~/core/share (a test keeps them equal). */
export const SHARE_LINK_PARAM = "plan";

/** What a share link's `plan` becomes: that it was one, not what it held. */
export const SHARED_PLAN_VALUE = "shared";

/** Longest text one of our own event properties may hold. */
export const MAX_PROPERTY_LENGTH = 200;

/**
 * Paths whose segments name a course, a section or a room, kept only as
 * their route pattern.
 */
const PATH_PATTERNS: readonly { route: string; params: readonly string[] }[] = [
  { route: "/chat", params: [":term", ":course", ":room"] },
];

/** Allowlisted values are short words or ids, never free text. */
const SAFE_VALUE = /^[\w.-]{1,32}$/;

/** `/chat/202608/CMSC131/s-0101` → `/chat/:term/:course/:room`. */
export function scrubPath(pathname: string): string {
  for (const { route, params } of PATH_PATTERNS) {
    if (!isUnderRoute(pathname, route)) continue;
    const rest = pathname.slice(route.length).split("/").filter(Boolean);
    return [route, ...rest.map((_, i) => params[i] ?? ":param")].join("/");
  }
  return pathname;
}

/** `?plan=…&tab=generate&q=x` → `?plan=shared&tab=generate`. */
export function scrubSearch(search: string): string {
  const out = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) {
    if (key === SHARE_LINK_PARAM) out.set(key, SHARED_PLAN_VALUE);
    else if (QUERY_ALLOWLIST.includes(key) && SAFE_VALUE.test(value))
      out.append(key, value);
  }
  const text = out.toString();
  return text ? `?${text}` : "";
}

/**
 * A URL with its path scrubbed, its search params allowlisted, and no hash
 * or credentials. Relative URLs stay relative; values that aren't URLs
 * (PostHog's `$direct`) pass through.
 */
export function scrubUrl(url: string): string {
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
  if (!absolute && !url.startsWith("/")) return url;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://relative.invalid");
  } catch {
    return "";
  }
  const origin = absolute ? parsed.origin : "";
  return `${origin}${scrubPath(parsed.pathname)}${scrubSearch(parsed.search)}`;
}

/** The part of PostHog's event this module reads and rewrites. */
export interface ScrubbableEvent {
  event: string;
  properties: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/** Events that carry the clicked element's text and attributes. */
const ELEMENT_EVENTS: ReadonlySet<string> = new Set([
  "$autocapture",
  "$rageclick",
  "$dead_click",
  "$copy_autocapture",
]);

/** PostHog's own properties without a `$`, left to PostHog. */
const POSTHOG_PLAIN_KEYS: ReadonlySet<string> = new Set([
  "token",
  "distinct_id",
  "title",
]);

const URL_KEY = /(url|referrer)$/i;
const PATH_KEY = /pathname$/i;

/** Session recording data. Terpsicle never records sessions. */
export const RECORDING_EVENT = "$snapshot";

/**
 * The event as it may leave the browser, or null to drop it:
 * - every URL and path property scrubbed (`scrubUrl`, `scrubPath`), at any
 *   depth PostHog nests them (web vitals carry their own `$current_url`),
 *   plus link hrefs in the clicked element's chain;
 * - the page `title` dropped where the path names a course or room;
 * - session recording data always dropped: recordings are off in
 *   `posthog.init`, and this makes sure none ever leaves, whatever the
 *   PostHog project says;
 * - on click events, any text or attribute that contains `privateText` (the
 *   page's `data-private` text) removed, and copied text never sent;
 * - our own events dropped if a property holds more than 200 characters of
 *   text: a backstop against pasted or typed text.
 */
export function scrubEvent<E extends ScrubbableEvent>(
  event: E,
  options: {
    /** The page's `data-private` text; read only for click events. */
    privateText?: () => readonly string[];
  } = {},
): E | null {
  if (event.event === RECORDING_EVENT) return null;
  const rawUrl = event.properties.$current_url;
  const rawPath =
    typeof rawUrl === "string" ? pathOf(rawUrl) : event.properties.$pathname;

  const properties = scrubProperties(event.properties, 0);
  if (!event.event.startsWith("$") && hasLongText(properties)) return null;
  if (typeof rawPath === "string" && scrubPath(rawPath) !== rawPath)
    delete properties.title;
  if (ELEMENT_EVENTS.has(event.event))
    removePrivateText(properties, options.privateText?.() ?? []);

  const out: E = { ...event, properties };
  if (event.$set) out.$set = scrubProperties(event.$set, 0);
  if (event.$set_once) out.$set_once = scrubProperties(event.$set_once, 0);
  return out;
}

function scrubProperties(
  properties: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && URL_KEY.test(key))
      out[key] = scrubUrl(value);
    else if (typeof value === "string" && PATH_KEY.test(key))
      out[key] = scrubPath(value);
    else if (typeof value === "string" && key === "$elements_chain")
      out[key] = scrubChainHrefs(value);
    else if (isRecord(value) && depth < 3)
      out[key] = scrubProperties(value, depth + 1);
    else out[key] = value;
  }
  return out;
}

function hasLongText(properties: Record<string, unknown>): boolean {
  return Object.entries(properties).some(
    ([key, value]) =>
      !key.startsWith("$") &&
      !POSTHOG_PLAIN_KEYS.has(key) &&
      (isLong(value) || (Array.isArray(value) && value.some(isLong))),
  );
}

function isLong(value: unknown): boolean {
  return typeof value === "string" && value.length > MAX_PROPERTY_LENGTH;
}

/** `key="value"` pairs in PostHog's `$elements_chain`; `\"` escapes quotes. */
const CHAIN_PAIR = /([\w-]+)="((?:[^"\\]|\\.)*)"/g;

function scrubChainHrefs(chain: string): string {
  return chain.replace(CHAIN_PAIR, (pair, key: string, value: string) =>
    /(^|_)href$/.test(key)
      ? `${key}="${scrubUrl(unescapeChain(value))}"`
      : pair,
  );
}

function removePrivateText(
  properties: Record<string, unknown>,
  privateText: readonly string[],
): void {
  delete properties.$selected_content;
  const matchers = privateMatchers(privateText);
  if (matchers.length === 0) return;
  const isPrivate = (value: unknown) =>
    typeof value === "string" && matchers.some((m) => m.test(value));

  if (isPrivate(properties.$el_text)) delete properties.$el_text;
  const chain = properties.$elements_chain;
  if (typeof chain === "string")
    properties.$elements_chain = chain.replace(
      CHAIN_PAIR,
      (pair, _key: string, value: string) =>
        isPrivate(unescapeChain(value)) ? "" : pair,
    );
  const elements = properties.$elements;
  if (Array.isArray(elements))
    properties.$elements = elements.map((element: unknown) =>
      isRecord(element)
        ? Object.fromEntries(
            Object.entries(element).filter(([, value]) => !isPrivate(value)),
          )
        : element,
    );
}

/**
 * One whole-word, case-insensitive matcher per distinct private text of two
 * characters or more ("Therapy" matches "Edit Therapy", "me" doesn't match
 * "Remove").
 */
function privateMatchers(privateText: readonly string[]): RegExp[] {
  const texts = new Set(
    privateText
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter((text) => text.length >= 2),
  );
  return [...texts].map(
    (text) =>
      new RegExp(
        `(?<![\\p{L}\\p{N}])${text
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`,
        "iu",
      ),
  );
}

function pathOf(url: string): string | undefined {
  try {
    return new URL(url, "https://relative.invalid").pathname;
  } catch {
    return undefined;
  }
}

function unescapeChain(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
