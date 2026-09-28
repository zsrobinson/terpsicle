import { z } from "zod";
import { IsoDateTimeSchema } from "./primitives";

// The installable app (docs/V2.md §3, DATA.md §5.2): the web push payload
// the service worker shows, and what the browser remembers about the
// install prompt.

/**
 * A path on our own site ("/chat/<term>/CMSC131/section-0303?m=…"), never
 * another origin: a notification can only open Terpsicle. `//evil.example`
 * is protocol-relative, so it's refused too.
 */
export const SitePathSchema = z
  .string()
  .max(2048)
  .regex(/^\/(?!\/)/, "Must be a path on this site, starting with one /");

/**
 * What a push is about (V2 §6.1; `admin-urgent` is the owner's moderation
 * alert, `todo-due` is V3 §4's, and `test` is "Send me a test" in Settings).
 */
export const PushTypeSchema = z.enum([
  "seat-open",
  "chat-mention",
  "chat-reply",
  "admin-urgent",
  "todo-due",
  "test",
]);
export type PushType = z.infer<typeof PushTypeSchema>;

/**
 * One web push message (V2 §6.4), at most 3 KB. The sender validates with
 * this; the service worker can't load zod, so it repeats the same checks by
 * hand (`readPushPayload` in src/server/service-worker.ts), and a test holds
 * the two together.
 */
export const PushPayloadSchema = z.object({
  v: z.literal(1),
  type: PushTypeSchema,
  /** "Hannah Lee replied in CMSC131 · 0303". */
  title: z.string().trim().min(1).max(120),
  /** One or two plain sentences. */
  body: z.string().max(400),
  /** Where a click goes; focuses a window already there. */
  url: SitePathSchema,
  /**
   * A newer notification with the same tag replaces the older one, so a
   * busy room shows one notification, not twenty. One tag per group (V2
   * §6.7): "chat-mention:<room>", "chat-reply:<thread>", "seat:<term>",
   * "todo-due:<date>", "admin-urgent".
   */
  tag: z.string().min(1).max(64),
  /** Events the tag's notification stands for now ("3 mentions in CMSC351"). */
  count: z.number().int().min(1).max(100_000).optional(),
  /** Unread in the inbox after this event: the app badge (V2 §6.7). */
  badge: z.number().int().min(0).max(100_000).optional(),
  /**
   * Buzz again when this replaces a notification still showing (V2 §6.7).
   * A notification that replaces none buzzes anyway.
   */
  renotify: z.boolean().optional(),
  /** The inbox row, so a click reads it (`notifications/read`). */
  id: z.string().min(1).max(200).optional(),
});
export type PushPayload = z.infer<typeof PushPayloadSchema>;

/**
 * Declarative Web Push's marker (the Push API's "declarative push
 * message"): with it, Safari on iOS and iPadOS 18.4+ and macOS 15.5+ shows
 * `notification` itself, without running a service worker.
 */
export const DECLARATIVE_WEB_PUSH = 8030;

/**
 * What a push carries on the wire (V2 §6.7): the payload's own members, for
 * our service worker (and any older one still installed), plus the
 * declarative members. `mutable` lets our service worker, where it runs,
 * rewrite the notification for its group; where it doesn't, the browser
 * shows `notification` as is. Built by `pushMessage` in ~/core/push.
 */
export type PushMessage = PushPayload & {
  web_push: typeof DECLARATIVE_WEB_PUSH;
  notification: {
    title: string;
    body: string;
    /** Absolute: WebKit parses it without a base URL. */
    navigate: string;
    tag: string;
    /**
     * Safari 18.4 read the badge here, as a string (WebKit's own example);
     * later versions read the top-level `app_badge`, per the Push API.
     */
    app_badge?: string;
  };
  mutable: true;
  /** The app badge: the inbox's unread count. */
  app_badge?: number;
};

/** Where push subscriptions are saved (V2 §6.3); the service worker re-saves one that changes. */
export const PUSH_SUBSCRIBE_PATH = "/api/push/subscribe";

/** Where a notification click reads its inbox row (V2 §6.7), from the service worker. */
export const NOTIFICATIONS_READ_PATH = "/api/notifications/read";

/**
 * What the service worker posts to open pages once a notification click
 * has read something (`{type, unread}`), so a bell can match the badge.
 */
export const SW_NOTIFICATIONS_READ_MESSAGE = "notifications-read";

/** The key moments that ask for the install prompt (V2 §3.4). */
export const InstallTriggerSchema = z.enum([
  "first-sign-in",
  "chat-joined",
  "alert-on",
]);
export type InstallTrigger = z.infer<typeof InstallTriggerSchema>;

/** `localStorage["terpsicle:install-prompt"]`. */
export const InstallPromptStateSchema = z.object({
  /** Times the prompt was closed without installing, after a key moment. */
  dismissals: z.number().int().min(0),
  lastDismissedAt: IsoDateTimeSchema.nullable(),
});
export type InstallPromptState = z.infer<typeof InstallPromptStateSchema>;

export const INSTALL_PROMPT_STORAGE_KEY = "terpsicle:install-prompt";

/**
 * The moments that ask to turn on notifications here (V2 §6.7, "Asking"):
 * your first post in Chat, connecting ELMS in Todo, a seat watch starting,
 * and the app's first launch from the iPhone Home Screen.
 */
export const PushAskMomentSchema = z.enum([
  "chat-post",
  "todo-connected",
  "seat-watch",
  "home-screen",
]);
export type PushAskMoment = z.infer<typeof PushAskMomentSchema>;

/** `localStorage["terpsicle:push-ask"]`: "Not now", remembered. */
export const PushAskStateSchema = z.object({
  /** Times an ask was closed without turning notifications on. */
  dismissals: z.number().int().min(0),
  lastDismissedAt: IsoDateTimeSchema.nullable(),
  /** When the Home Screen app's own ask showed (it shows once per device). */
  homeScreenAskedAt: IsoDateTimeSchema.nullable().default(null),
});
export type PushAskState = z.infer<typeof PushAskStateSchema>;

export const PUSH_ASK_STORAGE_KEY = "terpsicle:push-ask";

/**
 * What the app posts to a waiting service worker when the person picks
 * "Reload" on "Update ready": take over now.
 */
export const SW_SKIP_WAITING_MESSAGE = "skip-waiting";

/**
 * Where the installed app opens (the manifest's `start_url`), and where a
 * notification without a usable link goes: Home (`HOME_PATH`, docs/V3.md
 * §1.5). Apps installed while it was `/schedule` keep opening there, which
 * is still the scheduler.
 */
export const PWA_START_URL = "/home";

/** Shown with every notification (scripts/build-icons.ts draws it). */
export const NOTIFICATION_ICON = "/icons/icon-192.png";
/** Android's status-bar icon: white on clear (scripts/build-icons.ts). */
export const NOTIFICATION_BADGE = "/icons/badge-72.png";
