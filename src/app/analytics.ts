// Anonymous product analytics (PostHog). What we track and why:
// docs/ANALYTICS.md. Add every new event to `AnalyticsEvents` first.
import type { PostHog } from "posthog-js";
import type {
  ConnectionVerdict,
  ExtraMinutes,
  Pace,
  ProblemFix,
  ProblemKind,
  RailTab,
  RankBy,
  Relaxable,
  SignInError,
  TermId,
  TermStatus,
  Theme,
  TravelMode,
} from "~/core/schema";
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
  course_removed: { via: "menu" | "details" };
  course_saved_for_later: { via: "menu" | "details" };
  problem_opened: { kind: ProblemKind };
  problem_fix_applied: { kind: ProblemFix["kind"]; problem: ProblemKind };
  export_codes_copied: { count: number };
  share_link_copied: NoProperties;
  ics_downloaded: { events: number };
  registration_item_checked: NoProperties;
  seat_alert_requested: NoProperties;
  seat_alert_stopped: NoProperties;
  first_visit_path_chosen: { path: "build" | "generate" };
  deep_link_opened: { outcome: "ok" | "unknown-term" };
  catalog_loaded: {
    termId: TermId;
    fromCache: boolean;
    deptsFetched: number;
    ms: number;
  };
  catalog_load_failed: {
    termId: TermId | null;
    reason: "missing" | "network" | "invalid" | "newer-data";
  };
  generate_run: {
    courses: number;
    /** The must-haves that narrowed the search, by name. */
    mustHaves: Relaxable[];
    rankBy: RankBy["preset"];
    results: number;
    durationMs: number;
    /** Stopped at the step budget ("Showing the best 200"). */
    truncated: boolean;
    /** Started from a suggested relaxation. */
    relaxed: boolean;
  };
  generate_result_previewed: { rank: number };
  generate_plans_saved: { count: number };
  generate_relaxation_applied: { constraint: Relaxable };
  /** Debounced; the query's length only, never its text. */
  search_performed: { queryLength: number; results: number; filtered: boolean };
  search_filter_changed: {
    filter: "gen-eds" | "credits" | "fits" | "open-seats" | "level";
  };
  /** 0-based position in the results. */
  search_result_opened: { position: number };
  course_details_tab: { tab: "instructors" | "grades" | "about" };
  course_added: { via: "details" | "ghost" };
  review_summary_viewed: { state: "shown" | "unavailable" };
  travel_settings_changed:
    | { setting: "pace"; value: Pace }
    | { setting: "accessible"; value: boolean }
    | { setting: "extraMinutes"; value: ExtraMinutes };
  travel_how_opened: NoProperties;
  connection_opened: { verdict: ConnectionVerdict };
  route_map_shown: { mode: TravelMode; hasGeometry: boolean };
  // Identity (V2.md §11). Never the user, their name, email or directory ID.
  signin_started: { from: "topbar" | "settings" | "signin-page" | "undo" };
  signin_completed: { firstOnDevice: boolean };
  signin_failed: { reason: SignInError };
  signed_out: { removedLocal: boolean };
  account_deletion_requested: NoProperties;
  // Plan sync (V2.md §11): counts only, never plan names or courses.
  sync_first_sign_in: { uploaded: number; renamed: number; copies: number };
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
  // Both chunks load only here, so the privacy rules add nothing to the
  // pages' eager bundles.
  const [{ default: posthog }, { posthogOptions, pagePrivateText }] =
    await Promise.all([import("posthog-js"), import("./posthog-options")]);
  posthog.init(
    token,
    posthogOptions(() => pagePrivateText()),
  );
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
