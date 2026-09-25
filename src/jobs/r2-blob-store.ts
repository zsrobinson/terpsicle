import type { BlobStore, PutOptions } from "~/ingest/blob-store";

/** The Worker's `BlobStore`: R2 bucket `DATA`. */
export function createR2BlobStore(bucket: R2Bucket): BlobStore {
  const metadata = (options?: PutOptions) =>
    options?.contentType
      ? { httpMetadata: { contentType: options.contentType } }
      : {};

  return {
    async get(key) {
      const object = await bucket.get(key);
      return object ? new Uint8Array(await object.arrayBuffer()) : null;
    },
    async getVersioned(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        body: new Uint8Array(await object.arrayBuffer()),
        etag: object.etag,
      };
    },
    async put(key, body, options) {
      await bucket.put(key, body, metadata(options));
    },
    async putIfMatch(key, body, etag, options) {
      // R2 returns null instead of an object when the precondition fails.
      // "Must not exist yet" is If-None-Match: *.
      const onlyIf =
        etag === null
          ? new Headers({ "If-None-Match": "*" })
          : { etagMatches: etag };
      const written = await bucket.put(key, body, {
        ...metadata(options),
        onlyIf,
      });
      return written !== null;
    },
    async delete(key) {
      await bucket.delete(key);
    },
    async list(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      // R2 pages listings at 1000 keys.
      do {
        const page = await bucket.list({
          prefix,
          ...(cursor ? { cursor } : {}),
        });
        keys.push(...page.objects.map((object) => object.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return keys.sort();
    },
  };
}
