// Anonymous product analytics (PostHog). What we track and why:
// docs/ANALYTICS.md. Add every new event to `AnalyticsEvents` first.
import type { PostHog } from "posthog-js";
import type { RailTab, TermStatus, Theme } from "~/core/schema";
import { type ClientConfig, clientConfig, type DataSource } from "./config";

type NoProperties = Record<string, never>;

/** Every client event and its properties, in one place. Why each exists: docs/ANALYTICS.md. */
export interface AnalyticsEvents {
  app_loaded: { dataSource: DataSource };
  plan_created: { source: "empty" | "copy" | "generate" | "shared" };
  plan_deleted: NoProperties;
  plan_renamed: { via: "menu" | "double-click" };
  tab_opened: { tab: RailTab; via: "click" | "shortcut" };
  sidebar_collapsed: NoProperties;
  term_switched: { status: TermStatus };
  theme_changed: { theme: Theme };
  undo_used: { via: "shortcut" | "toast" };
  shared_link_opened: { outcome: "ok" | "invalid" | "newer-version" };
  shared_plan_saved: { droppedSections: number };
  section_switched: { via: "ghost" | "list" | "keyboard" };
  block_created: { via: "drag" | "form" };
  course_color_changed: NoProperties;
}
export type AnalyticsEvent = keyof AnalyticsEvents;

/**
 * The only host that reports. Localhost, PR previews (*.workers.dev) and
 * anything else stay out of the numbers.
 */
export const ANALYTICS_HOST = "terpsicle.com";

/** Only real visits to terpsicle.com, never fixtures, tests or other hosts. */
export function analyticsEnabled(
  config: Pick<ClientConfig, "mode" | "dataSource" | "posthogToken">,
  hostname: string,
): boolean {
  return (
    config.posthogToken !== undefined &&
    config.dataSource !== "mock" &&
    config.mode !== "test" &&
    hostname === ANALYTICS_HOST
  );
}

type Pending = { event: AnalyticsEvent; properties: object };

let client: PostHog | undefined;
let pending: Pending[] | undefined;

/**
 * Loads PostHog (its own chunk, so disabled environments never download it)
 * and flushes events tracked while it loaded. Safe to call more than once.
 */
export async function initAnalytics(
  config: ClientConfig = clientConfig,
): Promise<void> {
  if (client || pending || typeof window === "undefined") return;
  if (!analyticsEnabled(config, window.location.hostname)) return;
  const token = config.posthogToken;
  if (!token) return;

  pending = [];
  const { default: posthog } = await import("posthog-js");
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    // We never call identify(), so every visitor stays anonymous.
    person_profiles: "identified_only",
    // No cookies; the /ingest proxy strips them anyway.
    persistence: "localStorage",
    capture_pageview: "history_change",
    autocapture: true,
    // We don't run surveys; don't download their code.
    disable_surveys: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-private]",
    },
  });
  client = posthog;
  for (const { event, properties } of pending)
    client.capture(event, properties);
  pending = undefined;
}

export function track<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEvents[E],
): void {
  if (client) client.capture(event, properties);
  else pending?.push({ event, properties });
}
