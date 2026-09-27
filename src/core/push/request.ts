// Everything about a push request that isn't cryptography: which endpoints
// we'll send to, and the headers (RFC 8030 §5).
import { toBase64url, utf8 } from "./bytes";

/**
 * The push services browsers use: Chrome, Android and most Chromium browsers
 * (FCM), Edge (WNS), Firefox (Mozilla) and Safari (Apple). The server POSTs
 * to whatever endpoint a person saves, so anything else is refused: a saved
 * endpoint must never point our Worker at an arbitrary host.
 */
const PUSH_SERVICE_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/,
];

/** Test mode's stand-in push service (e2e) runs on this machine. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Whether we'll send pushes to `endpoint`: https on a known push service, or
 * with `allowLocal` (test mode only), http or https on this machine.
 */
export function isPushEndpoint(
  endpoint: string,
  options: { allowLocal: boolean },
): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (options.allowLocal && LOCAL_HOSTS.has(url.hostname))
    return url.protocol === "http:" || url.protocol === "https:";
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))
  );
}

/**
 * A push service's `Topic` for a tag: pushes with the same topic replace
 * each other while waiting for an offline device. At most 32 base64url
 * characters, so the tag (which may name a course) is hashed.
 */
export async function pushTopic(tag: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8(tag)),
  );
  return toBase64url(digest).slice(0, 32);
}

export type PushUrgency = "very-low" | "low" | "normal" | "high";

/** The headers of one push request, besides `Authorization`. */
export function pushHeaders(options: {
  /** Seconds the push service keeps it for an offline device. */
  ttl: number;
  urgency: PushUrgency;
  topic: string;
  authorization: string;
}): Record<string, string> {
  return {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    TTL: String(Math.max(0, Math.round(options.ttl))),
    Urgency: options.urgency,
    Topic: options.topic,
    Authorization: options.authorization,
  };
}
