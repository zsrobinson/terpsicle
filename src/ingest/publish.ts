import type { z } from "zod";
import type { BlobStore } from "./blob-store";
import { contentHash, JSON_TYPE, toJsonBytes } from "./hash";

// Writing published files by the rules in DATA.md §2: hashed files first,
// fixed-name pointers last, pointers updated with conditional writes.

const decoder = new TextDecoder();

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  info: (message, data) => console.info(message, data ?? ""),
  warn: (message, data) => console.warn(message, data ?? ""),
  error: (message, data) => console.error(message, data ?? ""),
};

export const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

/** Validates `value` and returns its bytes and content hash. */
export async function encodeHashed<S extends z.ZodType>(
  schema: S,
  value: z.input<S>,
  what: string,
): Promise<{ value: z.output<S>; bytes: Uint8Array; hash: string }> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `${what} doesn't match its schema at ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "unknown"}`,
    );
  }
  const bytes = toJsonBytes(parsed.data);
  return { value: parsed.data, bytes, hash: await contentHash(bytes) };
}

/**
 * Writes a content-hashed file unless `previousHash` shows it's already there.
 * Returns the hash and whether anything was written.
 */
export async function writeHashed<S extends z.ZodType>(
  store: BlobStore,
  schema: S,
  value: z.input<S>,
  keyFor: (hash: string) => string,
  what: string,
  previousHash: string | null = null,
): Promise<{ hash: string; key: string; written: boolean; bytes: number }> {
  const encoded = await encodeHashed(schema, value, what);
  const key = keyFor(encoded.hash);
  if (encoded.hash === previousHash) {
    return {
      hash: encoded.hash,
      key,
      written: false,
      bytes: encoded.bytes.length,
    };
  }
  await store.put(key, encoded.bytes, { contentType: JSON_TYPE });
  return {
    hash: encoded.hash,
    key,
    written: true,
    bytes: encoded.bytes.length,
  };
}

/** Reads and validates a JSON file; null when it's missing. Throws a specific error if it's invalid. */
export async function readJson<S extends z.ZodType>(
  store: BlobStore,
  key: string,
  schema: S,
): Promise<z.output<S> | null> {
  const bytes = await store.get(key);
  if (!bytes) return null;
  return parseJsonBytes(bytes, schema, key);
}

function parseJsonBytes<S extends z.ZodType>(
  bytes: Uint8Array,
  schema: S,
  key: string,
): z.output<S> {
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error(`${key} isn't valid JSON`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `${key} doesn't match its schema at ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "unknown"}`,
    );
  }
  return parsed.data;
}

/** Like `readJson`, but a file that fails validation reads as missing (job state we can rebuild). */
export async function readJsonOrNull<S extends z.ZodType>(
  store: BlobStore,
  key: string,
  schema: S,
  log: Logger,
): Promise<z.output<S> | null> {
  try {
    return await readJson(store, key, schema);
  } catch (error) {
    log.warn(`Ignoring unreadable ${key}`, { error: String(error) });
    return null;
  }
}

export async function writeJson(
  store: BlobStore,
  key: string,
  value: unknown,
): Promise<void> {
  await store.put(key, toJsonBytes(value), { contentType: JSON_TYPE });
}

/**
 * A source answered with data we won't publish (empty, truncated, or not
 * there at all), so the last good files stay. Jobs report it as
 * `cron_job_failed` with the reason as `firstError` (docs/ANALYTICS.md).
 */
export class SourceFailureError extends Error {
  constructor(
    readonly source: string,
    readonly reason: string,
    readonly counts: Record<string, number>,
  ) {
    super(`${source} looks broken, so the last good data was kept: ${reason}`);
    this.name = "SourceFailureError";
  }
}

export class ManifestConflictError extends Error {
  constructor(key: string, attempts: number) {
    super(
      `${key}: another job kept changing it; gave up after ${attempts} conditional writes`,
    );
    this.name = "ManifestConflictError";
  }
}

/**
 * Read → change → conditional write, retried when another job wrote in
 * between (DATA.md §2.4). `change` gets the current value (null if missing)
 * and returns the next one, or null to leave the file alone. The result is
 * validated before it's written.
 */
export async function updatePointer<S extends z.ZodType>(
  store: BlobStore,
  key: string,
  schema: S,
  change: (current: z.output<S> | null) => z.input<S> | null,
  attempts = 5,
): Promise<z.output<S> | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const current = await store.getVersioned(key);
    const value = current ? parseJsonBytes(current.body, schema, key) : null;
    const next = change(value);
    if (next === null) return value;
    const parsed = schema.safeParse(next);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Refusing to write ${key}: doesn't match its schema at ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "unknown"}`,
      );
    }
    const ok = await store.putIfMatch(
      key,
      toJsonBytes(parsed.data),
      current?.etag ?? null,
      { contentType: JSON_TYPE },
    );
    if (ok) return parsed.data;
  }
  throw new ManifestConflictError(key, attempts);
}
