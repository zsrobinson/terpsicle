// Web push's settings (V2.md §6.4): PUSH_ENABLED, the VAPID key pair and
// subject. Test mode (previews, `pnpm dev:mock`, e2e) signs with a fixed
// pair from this file and may send to this machine (e2e's stand-in push
// service); production uses VAPID_PUBLIC_KEY (a var) and VAPID_PRIVATE_KEY
// (a secret), and only the real push services.
import { FeatureVarsSchema } from "~/core/schema";

export interface PushEnv {
  PUSH_ENABLED?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

/** Test mode's key pair: never used for a real device (`scripts/vapid-keys.ts` makes real ones). */
export const TEST_VAPID_KEYS = {
  publicKey:
    "BCaZdJdFpRKWBFQ3DgGmlr7qXSXYHrxL1ktLZ4D2K5obuJNbs_n3StLJluqcDpQ7JLHoJfcVyYTqNiqYkBfSZ8o",
  privateKey: "s23yGhHqllxO0pO2ssFua08lyjDtCQcpPzewNXi3wn0",
} as const;

const DEFAULT_SUBJECT = "mailto:alerts@terpsicle.com";

export type PushConfig =
  | { enabled: false }
  | {
      enabled: true;
      /** base64url, 65 bytes: what browsers subscribe with. */
      publicKey: string;
      /** base64url `d`. */
      privateKey: string;
      subject: string;
      /** Test mode: endpoints on this machine are allowed. */
      allowLocal: boolean;
    };

let warned = false;

/**
 * Whether push works here, and with what. `testMode` is auth's `isTestMode`
 * for a request, or AUTH_TEST_MODE in a cron.
 */
export function pushConfig(env: PushEnv, testMode: boolean): PushConfig {
  if (!FeatureVarsSchema.parse(env).PUSH_ENABLED) return { enabled: false };
  const subject = env.VAPID_SUBJECT?.trim() || DEFAULT_SUBJECT;
  if (testMode)
    return { enabled: true, ...TEST_VAPID_KEYS, subject, allowLocal: true };
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    if (!warned) {
      warned = true;
      console.warn({ push: "PUSH_ENABLED without VAPID keys; push is off" });
    }
    return { enabled: false };
  }
  return { enabled: true, publicKey, privateKey, subject, allowLocal: false };
}
