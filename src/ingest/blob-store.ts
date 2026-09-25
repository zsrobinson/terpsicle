// Ingest code writes through this interface so the same pipeline runs in the
// Worker (R2, see src/jobs/r2-blob-store.ts), in Node scripts (local files or
// R2) and in tests (memory). Keys are R2-style paths like
// `catalog/<term>/manifest.json`.

export interface PutOptions {
  contentType?: string;
}

export interface BlobStore {
  /** The stored bytes, or `null` when the key doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  put(
    key: string,
    body: Uint8Array | string,
    options?: PutOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every key starting with `prefix`, sorted. */
  list(prefix: string): Promise<string[]>;
}

export interface MemoryBlobStore extends BlobStore {
  /** The content type a key was written with, for asserting in tests. */
  contentTypeOf(key: string): string | undefined;
}

const encoder = new TextEncoder();

export function createMemoryBlobStore(
  initial: Record<string, Uint8Array | string> = {},
): MemoryBlobStore {
  const blobs = new Map<string, { body: Uint8Array; contentType?: string }>();
  for (const [key, body] of Object.entries(initial)) {
    blobs.set(key, { body: toBytes(body) });
  }

  return {
    async get(key) {
      const blob = blobs.get(key);
      // Copy so callers can't mutate what's stored.
      return blob ? blob.body.slice() : null;
    },
    async put(key, body, options) {
      blobs.set(key, {
        body: toBytes(body),
        ...(options?.contentType ? { contentType: options.contentType } : {}),
      });
    },
    async delete(key) {
      blobs.delete(key);
    },
    async list(prefix) {
      return [...blobs.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
    contentTypeOf(key) {
      return blobs.get(key)?.contentType;
    },
  };
}

function toBytes(body: Uint8Array | string): Uint8Array {
  return typeof body === "string" ? encoder.encode(body) : body.slice();
}
