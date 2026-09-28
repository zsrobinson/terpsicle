import { DEFAULT_PUSH_ASK_STATE } from "~/core/pwa";
import {
  PUSH_ASK_STORAGE_KEY,
  type PushAskState,
  PushAskStateSchema,
} from "~/core/schema";

// What this browser remembers about asking for notifications (V2 §6.7,
// DATA.md §5.2): "Not now" and the Home Screen app's one ask, in
// localStorage. Apart from push-ask.ts so the install prompt, whose iPhone
// steps are the same ask, can record its Got it here without loading it.
// Blocked storage means nothing asks, since "Not now" couldn't be kept.

/** The saved state, the default if nothing (or nothing valid) is saved, or null if storage is blocked. */
export function readPushAskState(): PushAskState | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PUSH_ASK_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return DEFAULT_PUSH_ASK_STATE;
  try {
    const parsed = PushAskStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PUSH_ASK_STATE;
  } catch {
    return DEFAULT_PUSH_ASK_STATE;
  }
}

export function writePushAskState(state: PushAskState): void {
  try {
    window.localStorage.setItem(PUSH_ASK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Full or blocked: reading fails the same way, so nothing asks.
  }
}
