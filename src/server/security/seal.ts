// Sealing data at rest: AES-256-GCM with WebCrypto, every ciphertext naming
// the key that sealed it and bound to where it's stored by its additional
// data, so a value copied to another row won't open. Todo's ELMS link
// (src/server/todo/crypto.ts, docs/V3.md §3.3) and each account's data key
// (./user-keys.ts, docs/DATA.md §7.7) are sealed with it.
//
// Nothing here logs, and no error carries what was sealed.

/** A key and the id every ciphertext it seals names. */
export interface SealKey {
  id: string;
  key: CryptoKey;
}

export interface SealKeys {
  /** Seals everything new. */
  current: SealKey;
  /** During a rotation: still opens what was sealed before it. */
  previous: SealKey | null;
}

/** A key from the Worker's secrets: base64url text, and its id (a var). */
export interface SealSecrets {
  key?: string | undefined;
  id?: string | undefined;
  previousKey?: string | undefined;
  previousId?: string | undefined;
}

const VERSION = "v1";
/** A key id: short, and free of the format's `.` separator. */
export const SEAL_KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** A raw 32-byte key as a non-extractable AES-GCM key. */
export function importSealKey(
  raw: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

// Secrets are imported once per isolate, each.
const imported = new Map<string, Promise<CryptoKey>>();

function importSecret(secret: string): Promise<CryptoKey> | null {
  const raw = fromBase64url(secret.trim());
  if (raw?.length !== 32) return null;
  let key = imported.get(secret);
  if (!key) {
    key = importSealKey(raw);
    imported.set(secret, key);
  }
  return key;
}

/**
 * The keys a pair of secrets names, or null when the current one is missing,
 * isn't 32 bytes of base64url, or has no valid id. A malformed previous key
 * is left out rather than failing everything.
 */
export async function loadSealKeys(
  secrets: SealSecrets,
): Promise<SealKeys | null> {
  const id = secrets.id ?? "";
  const current = secrets.key ? importSecret(secrets.key) : null;
  if (!current || !SEAL_KEY_ID.test(id)) return null;
  const previousId = secrets.previousId ?? "";
  const previous =
    secrets.previousKey && SEAL_KEY_ID.test(previousId) && previousId !== id
      ? importSecret(secrets.previousKey)
      : null;
  return {
    current: { id, key: await current },
    previous: previous ? { id: previousId, key: await previous } : null,
  };
}

/**
 * `v1.<keyId>.<iv>.<ciphertext>` (base64url), under the current key with a
 * fresh 12-byte IV. `context` is the additional data: name the row it's
 * stored in, so it opens only there.
 */
export async function sealBytes(
  keys: SealKeys,
  context: string,
  plain: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    keys.current.key,
    plain,
  );
  return [
    VERSION,
    keys.current.id,
    toBase64url(iv),
    toBase64url(new Uint8Array(sealed)),
  ].join(".");
}

/**
 * What `sealBytes` sealed, or null when the key it names is gone, it was
 * sealed with another context (another row), or it was tampered with.
 */
export async function openBytes(
  keys: SealKeys,
  context: string,
  sealed: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const [version, keyId, iv, data, ...rest] = sealed.split(".");
  if (version !== VERSION || rest.length > 0 || !iv || !data) return null;
  const key = [keys.current, keys.previous].find((k) => k?.id === keyId)?.key;
  const ivBytes = fromBase64url(iv);
  const dataBytes = fromBase64url(data);
  if (!key || !ivBytes || ivBytes.length !== 12 || !dataBytes) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes, additionalData: encoder.encode(context) },
      key,
      dataBytes,
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

/** `sealBytes` for text. */
export function sealText(
  keys: SealKeys,
  context: string,
  text: string,
): Promise<string> {
  return sealBytes(keys, context, new Uint8Array(encoder.encode(text)));
}

/** `openBytes` for text. */
export async function openText(
  keys: SealKeys,
  context: string,
  sealed: string,
): Promise<string | null> {
  const plain = await openBytes(keys, context, sealed);
  return plain ? decoder.decode(plain) : null;
}

/**
 * Whether a stored value is in the sealed format at all (it may still not
 * open). Anything else was written in plain text, by a build from before
 * sealing. SQL's form: `NOT GLOB 'v1.*'` (UNSEALED below).
 */
export function isSealed(value: string): boolean {
  return value.startsWith(`${VERSION}.`);
}

/** SQL for "this column isn't sealed", the inverse of `isSealed`. */
export const UNSEALED = (column: string) => `${column} NOT GLOB 'v1.*'`;

/** The key id a sealed value names, or null if it isn't one. */
export function sealedKeyId(sealed: string): string | null {
  const [version, keyId] = sealed.split(".");
  return version === VERSION && keyId && SEAL_KEY_ID.test(keyId) ? keyId : null;
}
