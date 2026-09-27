import {
  type ActivityEntry,
  FEEDBACK_CONTEXT_MAX_CHARS,
  FEEDBACK_MAX_ACTIONS,
  type FeedbackContext,
  type FeedbackPlan,
} from "../schema/feedback";
import type { Block, Plan } from "../schema/local";
import { formatDays } from "../time/format";
import { ACTIVITY_LOG_SIZE, boundedProps, cut, type PropValue } from "./props";
import { sanitizeContext } from "./sanitize";

// "Include what I was doing" (docs/FEEDBACK.md): the sheet gathers what the
// page knows and this shapes it into `FeedbackContextSchema`, cut to the
// schema's limits and sanitized, so what leaves the browser always parses.

/** Actions older than this are about something else: left out. */
export const ACTIVITY_MAX_AGE_MS = 60 * 60_000;

export interface FeedbackContextInput {
  version: string;
  userAgent: string;
  screen: { width: number; height: number; dpr: number };
  viewport: { width: number; height: number };
  online: boolean;
  theme: "light" | "dark";
  /** The page's path and search, before scrubbing. */
  url: string;
  actions: readonly ActivityEntry[];
  plan: FeedbackPlan | null;
  settings: Readonly<Record<string, PropValue>>;
}

const size = (n: number) =>
  Math.min(100_000, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

function fitEntry(entry: ActivityEntry): ActivityEntry {
  switch (entry.type) {
    case "nav":
      return { ...entry, route: cut(entry.route, 300) };
    case "request":
      return { ...entry, route: cut(entry.route, 200) };
    case "event":
      return { ...entry, props: boundedProps(entry.props, 20) };
    case "error":
      return {
        ...entry,
        name: cut(entry.name, 100),
        message: cut(entry.message, 500),
        stack: entry.stack === null ? null : cut(entry.stack, 2_000),
      };
  }
}

/** "Chrome 141 · macOS", or "Unknown browser". */
export function browserName(userAgent: string): string {
  const ua = userAgent;
  const version = (re: RegExp) => ua.match(re)?.[1] ?? "";
  const name = /Edg\//.test(ua)
    ? `Edge ${version(/Edg\/(\d+)/)}`
    : /OPR\//.test(ua)
      ? `Opera ${version(/OPR\/(\d+)/)}`
      : /Firefox\//.test(ua)
        ? `Firefox ${version(/Firefox\/(\d+)/)}`
        : /CriOS\//.test(ua)
          ? `Chrome ${version(/CriOS\/(\d+)/)}`
          : /Chrome\//.test(ua)
            ? `Chrome ${version(/Chrome\/(\d+)/)}`
            : /Safari\//.test(ua) && /Version\//.test(ua)
              ? `Safari ${version(/Version\/(\d+(?:\.\d+)?)/)}`
              : "";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  const parts = [name.trim(), os].filter(Boolean);
  return parts.length > 0 ? cut(parts.join(" · "), 120) : "Unknown browser";
}

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The person's own plan as a report carries it: placed sections, saved
 * courses and their blocks (labels included; the screenshot still covers
 * them). Never someone else's shared plan: the caller passes only their own.
 */
export function feedbackPlan(
  plan: Plan,
  blocks: readonly Block[],
): FeedbackPlan {
  return {
    termId: cut(plan.termId, 16),
    name: cut(plan.name, 80),
    sections: plan.courses
      .flatMap((c) =>
        c.sectionCode ? [`${c.courseCode} ${c.sectionCode}`] : [],
      )
      .slice(0, 80),
    bookmarks: plan.courses
      .flatMap((c) => (c.sectionCode ? [] : [c.courseCode]))
      .slice(0, 80),
    blocks: blocks
      .filter((b) => b.termId === plan.termId)
      .slice(0, 40)
      .map((b) => ({
        label: cut(b.label, 80),
        days: cut(formatDays(b.days), 12),
        start: clock(b.start),
        end: clock(b.end),
      })),
  };
}

/**
 * What "Include what I was doing" sends: the page and device, the last
 * `ACTIVITY_LOG_SIZE` actions from the past hour, the plan and settings,
 * cut to the schema's limits and sanitized (routes scrubbed, links and
 * tokens redacted). Oldest actions go first if it's still too big.
 */
export function buildFeedbackContext(
  input: FeedbackContextInput,
  now: Date,
): FeedbackContext {
  const nowMs = now.getTime();
  const limit = Math.min(ACTIVITY_LOG_SIZE, FEEDBACK_MAX_ACTIONS);
  const actions = input.actions
    .filter((a) => a.at <= nowMs && nowMs - a.at <= ACTIVITY_MAX_AGE_MS)
    .slice(-limit);
  // Scrubbed first, then cut: a cut link could slip past the scrubber.
  const clean = sanitizeContext({
    version: cut(input.version, 64),
    browser: browserName(input.userAgent),
    screen: {
      width: size(input.screen.width),
      height: size(input.screen.height),
      dpr: Math.min(10, Math.max(0, input.screen.dpr || 1)),
    },
    viewport: {
      width: size(input.viewport.width),
      height: size(input.viewport.height),
    },
    online: input.online,
    theme: input.theme,
    route: input.url,
    actions,
    plan: input.plan,
    settings: boundedProps(input.settings, 40),
  });
  const context: FeedbackContext = {
    ...clean,
    route: cut(clean.route, 300),
    actions: clean.actions.map(fitEntry),
  };
  while (
    JSON.stringify(context).length > FEEDBACK_CONTEXT_MAX_CHARS &&
    context.actions.length > 0
  )
    context.actions = context.actions.slice(1);
  return context;
}
