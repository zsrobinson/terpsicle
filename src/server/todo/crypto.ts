// The ELMS feed link at rest (docs/V3.md §3.3, §5.1): AES-256-GCM under the
// Worker secret TODO_FEED_KEY, bound to its row. This file and fetch.ts are
// the only code that may touch the `url_enc` column or open a sealed link
// (scripts/check-imports.ts enforces it), and an opened link goes only to
// the fetcher. Nothing here logs, and no error carries the link.
import type { FeedSource } from "~/core/schema";

/** Whose link it is: the additional data every ciphertext is bound to. */
export interface FeedOwner {
  userId: string;
  source: Extract<FeedSource, "elms">;
}

export interface FeedKey {
  /** Named in every ciphertext, so a rotation knows which key to try. */
  id: string;
  key: CryptoKey;
}

export interface FeedKeys {
  /** Seals everything new. */
  current: FeedKey;
  /** During a rotation: still opens rows sealed before it. */
  previous: FeedKey | null;
}

/** The secret and var names, as the Worker's env has them. */
export interface FeedKeyVars {
  TODO_FEED_KEY?: string;
  TODO_FEED_KEY_ID?: string;
  TODO_FEED_KEY_PREVIOUS?: string;
  TODO_FEED_KEY_PREVIOUS_ID?: string;
}

const VERSION = "v1";
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Test mode's fixed key (previews, `pnpm dev:mock`, e2e, worker tests): not
 * a secret, and its id `test` never names a production row, because
 * production never runs in test mode (docs/AUTH.md, "Test mode").
 */
export const TEST_FEED_KEY_VARS = {
  TODO_FEED_KEY: "dGVycHNpY2xlLXRvZG8tdGVzdC1rZXktMzItYnl0ZXM",
  TODO_FEED_KEY_ID: "test",
} as const satisfies FeedKeyVars;

// Imported once per isolate, per secret.
const imported = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> | null {
  const raw = fromBase64url(secret.trim());
  if (raw?.length !== 32) return null;
  let key = imported.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
    imported.set(secret, key);
  }
  return key;
}

/**
 * The keys from the env, or null when the current one is missing or isn't
 * 32 bytes of base64url (Todo then answers "unavailable"). A malformed
 * previous key is left out rather than failing everything.
 */
export async function loadFeedKeys(
  vars: FeedKeyVars,
): Promise<FeedKeys | null> {
  const id = vars.TODO_FEED_KEY_ID ?? "";
  const current = vars.TODO_FEED_KEY ? importKey(vars.TODO_FEED_KEY) : null;
  if (!current || !KEY_ID.test(id)) return null;
  const previousId = vars.TODO_FEED_KEY_PREVIOUS_ID ?? "";
  const previous =
    vars.TODO_FEED_KEY_PREVIOUS && KEY_ID.test(previousId) && previousId !== id
      ? importKey(vars.TODO_FEED_KEY_PREVIOUS)
      : null;
  return {
    current: { id, key: await current },
    previous: previous ? { id: previousId, key: await previous } : null,
  };
}

const additionalData = (owner: FeedOwner) =>
  encoder.encode(`todo-feed:${owner.userId}:${owner.source}`);

/** `v1.<keyId>.<iv>.<ciphertext>`, under the current key, with a fresh IV. */
export async function sealFeedLink(
  keys: FeedKeys,
  owner: FeedOwner,
  url: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(owner) },
    keys.current.key,
    encoder.encode(url),
  );
  return [
    VERSION,
    keys.current.id,
    toBase64url(iv),
    toBase64url(new Uint8Array(sealed)),
  ].join(".");
}

/** The key id a sealed link names, or null if it isn't one. */
export function sealedKeyId(sealed: string): string | null {
  const [version, keyId] = sealed.split(".");
  return version === VERSION && keyId && KEY_ID.test(keyId) ? keyId : null;
}

/**
 * The link, for the fetcher only (fetch.ts). Null when the key it names is
 * gone, or it was sealed for someone else's row or tampered with.
 */
export async function openFeedLink(
  keys: FeedKeys,
  owner: FeedOwner,
  sealed: string,
): Promise<string | null> {
  const [version, keyId, iv, data, ...rest] = sealed.split(".");
  if (version !== VERSION || rest.length > 0 || !iv || !data) return null;
  const key = [keys.current, keys.previous].find((k) => k?.id === keyId)?.key;
  const ivBytes = fromBase64url(iv);
  const dataBytes = fromBase64url(data);
  if (!key || !ivBytes || ivBytes.length !== 12 || !dataBytes) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes, additionalData: additionalData(owner) },
      key,
      dataBytes,
    );
    return decoder.decode(plain);
  } catch {
    return null;
  }
}

// ---------- The url_enc column ----------

/**
 * Connecting: the feed row with its new link, created if it's the first.
 * Everything else about the row is store.ts's, in the same batch.
 */
export function saveFeedLinkStatement(
  db: D1Database,
  owner: FeedOwner,
  sealed: string,
  now: Date,
): D1PreparedStatement {
  const at = now.toISOString();
  return db
    .prepare(
      `INSERT INTO todo_feeds (user_id, source, url_enc, status, created_at, next_fetch_at, last_opened_at)
       VALUES (?1, ?2, ?3, 'active', ?4, ?4, ?4)
       ON CONFLICT (user_id, source) DO UPDATE SET url_enc = excluded.url_enc`,
    )
    .bind(owner.userId, owner.source, sealed, at);
}

/** A link sealed again under the current key (the cron's rotation). */
export function resealStatement(
  db: D1Database,
  owner: FeedOwner,
  sealed: string,
): D1PreparedStatement {
  return db
    .prepare(
      "UPDATE todo_feeds SET url_enc = ?3 WHERE user_id = ?1 AND source = ?2",
    )
    .bind(owner.userId, owner.source, sealed);
}

const ownerKey = (owner: FeedOwner) => `${owner.userId}\n${owner.source}`;

/** The sealed links of these feeds, in one query, by `ownerKey`. */
export async function loadSealedLinks(
  db: D1Database,
  owners: readonly FeedOwner[],
): Promise<(owner: FeedOwner) => string | null> {
  const found = new Map<string, string>();
  if (owners.length > 0) {
    const { results } = await db
      .prepare(
        `SELECT f.user_id, f.source, f.url_enc FROM todo_feeds f
         JOIN json_each(?1) o
           ON f.user_id = json_extract(o.value, '$[0]') AND f.source = json_extract(o.value, '$[1]')`,
      )
      .bind(JSON.stringify(owners.map((o) => [o.userId, o.source])))
      .all<{ user_id: unknown; source: unknown; url_enc: unknown }>();
    for (const row of results) {
      if (
        typeof row.user_id === "string" &&
        row.source === "elms" &&
        typeof row.url_enc === "string"
      )
        found.set(
          ownerKey({ userId: row.user_id, source: row.source }),
          row.url_enc,
        );
    }
  }
  return (owner) => found.get(ownerKey(owner)) ?? null;
}
