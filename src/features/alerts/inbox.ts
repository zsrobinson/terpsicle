// Hand-off from the confirm page to the app's state: the confirm page runs
// before the app loads, so it leaves each confirmed watch (with this
// browser's manage token) in localStorage. The state layer moves them into
// Dexie `seatAlerts` (DATA.md §5) on startup and clears the inbox.
import { z } from "zod";
import {
  SectionKeySchema,
  SubscriptionIdSchema,
  TermIdSchema,
  TokenSchema,
} from "~/core/schema";

export const ALERTS_INBOX_KEY = "terpsicle:alerts-inbox";

export const InboxEntrySchema = z.object({
  termId: TermIdSchema,
  sectionKey: SectionKeySchema,
  subscriptionId: SubscriptionIdSchema,
  manageToken: TokenSchema,
  status: z.enum(["active", "unsubscribed"]),
  at: z.iso.datetime(),
});
export type InboxEntry = z.infer<typeof InboxEntrySchema>;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Blocked storage (private modes, cookie settings): nothing to hand off.
    return null;
  }
}

export function readAlertsInbox(): InboxEntry[] {
  try {
    const raw = storage()?.getItem(ALERTS_INBOX_KEY);
    const parsed = z
      .array(InboxEntrySchema)
      .safeParse(raw ? JSON.parse(raw) : []);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Adds or replaces the entry for this subscription. */
export function putAlertsInbox(entry: InboxEntry): void {
  const rest = readAlertsInbox().filter(
    (e) => e.subscriptionId !== entry.subscriptionId,
  );
  try {
    storage()?.setItem(ALERTS_INBOX_KEY, JSON.stringify([...rest, entry]));
  } catch {
    // Full or blocked storage: the watch still works; this browser just
    // won't list it until the next confirmation.
  }
}

export function clearAlertsInbox(): void {
  try {
    storage()?.removeItem(ALERTS_INBOX_KEY);
  } catch {
    // Nothing to clear.
  }
}
