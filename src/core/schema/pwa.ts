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

/** What a push is about (V2 §6.1; `admin-urgent` is the owner's moderation alert). */
export const PushTypeSchema = z.enum([
  "seat-open",
  "chat-mention",
  "chat-reply",
  "admin-urgent",
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
   * busy room shows one notification, not twenty ("chat:<term>:CMSC131:…").
   */
  tag: z.string().min(1).max(64),
});
export type PushPayload = z.infer<typeof PushPayloadSchema>;

/** Where push subscriptions are saved (V2 §6.3); the service worker re-saves one that changes. */
export const PUSH_SUBSCRIBE_PATH = "/api/push/subscribe";

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
 * What the app posts to a waiting service worker when the person picks
 * "Reload" on "Update ready": take over now.
 */
export const SW_SKIP_WAITING_MESSAGE = "skip-waiting";

/**
 * Where the installed app opens (the manifest's `start_url`), and where a
 * notification without a usable link goes.
 */
export const PWA_START_URL = "/schedule";
