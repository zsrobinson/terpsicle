import type { BlobStore } from "~/ingest/blob-store";

/** The Worker's `BlobStore`: R2 bucket `DATA`. */
export function createR2BlobStore(bucket: R2Bucket): BlobStore {
  return {
    async get(key) {
      const object = await bucket.get(key);
      return object ? new Uint8Array(await object.arrayBuffer()) : null;
    },
    async put(key, body, options) {
      await bucket.put(key, body, {
        ...(options?.contentType
          ? { httpMetadata: { contentType: options.contentType } }
          : {}),
      });
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
