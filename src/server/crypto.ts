// Tokens, hashes and the keyed hash that stands in for IP addresses.
import { JOBS_PREFIX } from "~/core/schema";

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

/** `bytes` random bytes, base64url without padding (32 → 43 chars, 16 → 22). */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

const HASH_KEY = `${JOBS_PREFIX}keys/hmac.json`;
let cachedKey: Promise<CryptoKey> | null = null;

/**
 * An HMAC key that lives only in R2 (under `_jobs/`, never served): made on
 * first use with a create-only put, so every isolate agrees on it. It keeps
 * hashed IPs from being reversed by hashing all 4 billion addresses.
 */
async function hashKey(bucket: R2Bucket): Promise<CryptoKey> {
  const load = async () => {
    let stored = await bucket.get(HASH_KEY);
    if (!stored) {
      const fresh = JSON.stringify({ key: randomToken(32) });
      await bucket.put(HASH_KEY, fresh, { onlyIf: { etagDoesNotMatch: "*" } });
      stored = await bucket.get(HASH_KEY);
    }
    const parsed = stored ? ((await stored.json()) as { key?: unknown }) : {};
    if (typeof parsed.key !== "string")
      throw new Error("HMAC key object is malformed");
    return crypto.subtle.importKey(
      "raw",
      encoder.encode(parsed.key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  };
  cachedKey ??= load().catch((error: unknown) => {
    cachedKey = null;
    throw error;
  });
  return cachedKey;
}

/** HMAC-SHA-256 of `value` under the bucket's key, hex. */
export async function keyedHash(
  bucket: R2Bucket,
  value: string,
): Promise<string> {
  const key = await hashKey(bucket);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

/** Test hook: forget the in-isolate key cache. */
export function resetKeyCacheForTests(): void {
  cachedKey = null;
}
