// Sends one web push to one device (V2.md §6.4): encrypt the payload for its
// keys (RFC 8291), sign a VAPID JWT for its push service (RFC 8292), POST.
// Callers go through ~/server/notifications, which picks the devices, reads
// settings, records deliveries and prunes what the push service says is gone.
import {
  encryptPushPayload,
  fromBase64url,
  generateKeyPair,
  importPrivateKey,
  isPushEndpoint,
  type PushUrgency,
  publicKeyBytes,
  pushHeaders,
  pushTopic,
  signVapidJwt,
  utf8,
  VAPID_JWT_SECONDS,
  vapidAuthorization,
} from "~/core/push";
import { type PushPayload, PushPayloadSchema } from "~/core/schema";
import type { PushConfig } from "./config";
import type { SendEffect } from "./store";

/** A JWT is reused for this long per push service (V2 §6.4). */
const JWT_REUSE_MS = 3_600_000;
/** A push service that hasn't answered by now counts as a failure. */
const SEND_TIMEOUT_MS = 10_000;

const jwtCache = new Map<string, { jwt: string; madeAt: number }>();
const keyCache = new Map<string, Promise<CryptoKey>>();

function signingKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const cacheKey = `${publicKey}.${privateKey}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    const point = publicKeyBytes(publicKey);
    key = point
      ? importPrivateKey(privateKey, point, "ECDSA")
      : Promise.reject(new Error("VAPID_PUBLIC_KEY isn't a P-256 point"));
    key.catch(() => keyCache.delete(cacheKey));
    keyCache.set(cacheKey, key);
  }
  return key;
}

/** A JWT for this push service's origin, made at most hourly. */
async function vapidJwt(
  config: Extract<PushConfig, { enabled: true }>,
  audience: string,
  now: Date,
): Promise<string> {
  const cacheKey = `${config.publicKey}|${audience}`;
  const cached = jwtCache.get(cacheKey);
  const at = now.getTime();
  if (cached && at - cached.madeAt >= 0 && at - cached.madeAt < JWT_REUSE_MS)
    return cached.jwt;
  const jwt = await signVapidJwt(
    {
      aud: audience,
      exp: Math.floor(at / 1000) + VAPID_JWT_SECONDS,
      sub: config.subject,
    },
    await signingKey(config.publicKey, config.privateKey),
  );
  jwtCache.set(cacheKey, { jwt, madeAt: at });
  return jwt;
}

/** Test hook: forget cached JWTs and keys. */
export function resetPushCachesForTests(): void {
  jwtCache.clear();
  keyCache.clear();
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushOptions {
  /** Seconds the push service keeps it for an offline device. */
  ttl: number;
  urgency: PushUrgency;
  now: Date;
  fetch?: typeof fetch;
}

export interface PushOutcome {
  effect: SendEffect;
  /** The push service's status, or null when it never answered. */
  status: number | null;
}

/**
 * Sends `payload` to one device. Never throws: a bad subscription, a
 * refused request and a network error are all outcomes.
 */
export async function sendPush(
  config: Extract<PushConfig, { enabled: true }>,
  target: PushTarget,
  payload: PushPayload,
  options: PushOptions,
): Promise<PushOutcome> {
  const uaPublic = publicKeyBytes(target.p256dh);
  const authSecret = fromBase64url(target.auth);
  // A stored endpoint we'd no longer send to, or keys that can't be right:
  // nothing will ever work, so it goes.
  if (
    !isPushEndpoint(target.endpoint, { allowLocal: config.allowLocal }) ||
    !uaPublic ||
    authSecret?.length !== 16
  )
    return { effect: "gone", status: null };
  try {
    const sender = await generateKeyPair("ECDH");
    const body = await encryptPushPayload({
      plaintext: utf8(JSON.stringify(PushPayloadSchema.parse(payload))),
      uaPublic,
      authSecret,
      sender,
      salt: crypto.getRandomValues(new Uint8Array(16)),
    });
    const jwt = await vapidJwt(
      config,
      new URL(target.endpoint).origin,
      options.now,
    );
    const response = await (options.fetch ?? fetch)(target.endpoint, {
      method: "POST",
      headers: pushHeaders({
        ttl: options.ttl,
        urgency: options.urgency,
        topic: await pushTopic(payload.tag),
        authorization: vapidAuthorization(jwt, config.publicKey),
      }),
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    // The body is the push service's own words; we don't need them.
    await response.body?.cancel();
    const { status } = response;
    if (status >= 200 && status < 300) return { effect: "success", status };
    if (status === 404 || status === 410) return { effect: "gone", status };
    return { effect: "failure", status };
  } catch (error) {
    // The name only: a message could carry the endpoint, which stays private.
    console.warn({
      push: "send failed",
      error: error instanceof Error ? error.name : "unknown",
    });
    return { effect: "failure", status: null };
  }
}
