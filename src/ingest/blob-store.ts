// Ingest code writes through this interface so the same pipeline runs in the
// Worker (R2, see src/jobs/r2-blob-store.ts), in Node scripts (local files or
// R2's S3 API, see scripts/lib) and in tests (memory). Keys are R2-style paths
// like `catalog/<term>/manifest.json`.

export interface PutOptions {
  contentType?: string;
}

/** A stored object plus the version tag conditional writes compare against. */
export interface VersionedBlob {
  body: Uint8Array;
  etag: string;
}

export interface BlobStore {
  /** The stored bytes, or `null` when the key doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Like `get`, with the object's current etag for `putIfMatch`. */
  getVersioned(key: string): Promise<VersionedBlob | null>;
  put(
    key: string,
    body: Uint8Array | string,
    options?: PutOptions,
  ): Promise<void>;
  /**
   * Writes only if the object still has `etag` (or, with `null`, doesn't
   * exist yet). Returns `false` when that precondition failed, so the caller
   * re-reads and retries (DATA.md §2.4).
   */
  putIfMatch(
    key: string,
    body: Uint8Array | string,
    etag: string | null,
    options?: PutOptions,
  ): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Every key starting with `prefix`, sorted. */
  list(prefix: string): Promise<string[]>;
}

export interface MemoryBlobStore extends BlobStore {
  /** The content type a key was written with, for asserting in tests. */
  contentTypeOf(key: string): string | undefined;
  /** How many puts (of either kind) have landed, for asserting minimal writes. */
  readonly writes: string[];
}

const encoder = new TextEncoder();

export function createMemoryBlobStore(
  initial: Record<string, Uint8Array | string> = {},
): MemoryBlobStore {
  const blobs = new Map<
    string,
    { body: Uint8Array; etag: string; contentType?: string }
  >();
  let version = 0;
  const nextEtag = () => `v${++version}`;
  for (const [key, body] of Object.entries(initial)) {
    blobs.set(key, { body: toBytes(body), etag: nextEtag() });
  }
  const writes: string[] = [];

  const write = (
    key: string,
    body: Uint8Array | string,
    options?: PutOptions,
  ) => {
    writes.push(key);
    blobs.set(key, {
      body: toBytes(body),
      etag: nextEtag(),
      ...(options?.contentType ? { contentType: options.contentType } : {}),
    });
  };

  return {
    writes,
    async get(key) {
      const blob = blobs.get(key);
      // Copy so callers can't mutate what's stored.
      return blob ? blob.body.slice() : null;
    },
    async getVersioned(key) {
      const blob = blobs.get(key);
      return blob ? { body: blob.body.slice(), etag: blob.etag } : null;
    },
    async put(key, body, options) {
      write(key, body, options);
    },
    async putIfMatch(key, body, etag, options) {
      const current = blobs.get(key)?.etag ?? null;
      if (current !== etag) return false;
      write(key, body, options);
      return true;
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
