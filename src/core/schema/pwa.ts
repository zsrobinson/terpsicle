import { z } from "zod";
import { IsoDateTimeSchema } from "./primitives";

// The installable app (docs/DATA.md §5.2): the web push payload the service
// worker shows, and what the browser remembers about the install prompt.

/**
 * A path on our own site ("/chat/cmsc131?m=42"), never another origin: a
 * notification can only open Terpsicle. `//evil.example` is protocol-relative,
 * so it's refused too.
 */
export const SitePathSchema = z
  .string()
  .max(2048)
  .regex(/^\/(?!\/)/, "Must be a path on this site, starting with one /");

/**
 * One web push message. The sender (the server) validates with this; the
 * service worker can't import zod, so it repeats the same checks by hand in
 * `src/server/service-worker.ts` (`readPushPayload`), and a test holds the
 * two together.
 */
export const PushPayloadSchema = z.object({
  /** "CMSC131 0101 has a seat". */
  title: z.string().trim().min(1).max(120),
  /** One or two plain sentences. */
  body: z.string().max(400),
  /** Where a click goes; focuses a tab already there. */
  url: SitePathSchema,
  /**
   * A newer notification with the same tag replaces the older one, so a
   * busy chat room shows one notification, not twenty.
   */
  tag: z.string().min(1).max(64).optional(),
});
export type PushPayload = z.infer<typeof PushPayloadSchema>;

/** The key moments other features offer the install prompt at. */
export const InstallReasonSchema = z.enum([
  "first-sign-in",
  "joined-chat",
  "enabled-alerts",
]);
export type InstallReason = z.infer<typeof InstallReasonSchema>;

/** `localStorage["terpsicle:install-prompt"]`. */
export const InstallPromptPrefsSchema = z.object({
  /** When the prompt last opened on its own; starts the cooldown. */
  lastOfferedAt: IsoDateTimeSchema.nullable(),
  /** "Don't ask again": never offered on its own again. */
  never: z.boolean(),
});
export type InstallPromptPrefs = z.infer<typeof InstallPromptPrefsSchema>;

export const INSTALL_PROMPT_STORAGE_KEY = "terpsicle:install-prompt";

/**
 * What the app posts to a waiting service worker when the person picks
 * "Reload" on "Update ready": take over now.
 */
export const SW_SKIP_WAITING_MESSAGE = "skip-waiting";

/**
 * Where the installed app opens (the manifest's `start_url`), and the page a
 * notification without a usable link goes to.
 */
export const PWA_START_URL = "/schedule";
