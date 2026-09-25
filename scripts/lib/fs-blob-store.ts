import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { BlobStore } from "~/ingest/blob-store";

/**
 * A BlobStore on the local filesystem (`--target fs`), for running jobs
 * without touching R2. Etags are content hashes, which is enough for one
 * process at a time.
 */
export function createFsBlobStore(root: string): BlobStore {
  const file = (key: string) => {
    if (key.includes("..")) throw new Error(`Refusing key with "..": ${key}`);
    return path.join(root, key);
  };
  const read = (key: string): Uint8Array | null => {
    try {
      return new Uint8Array(readFileSync(file(key)));
    } catch {
      return null;
    }
  };
  const etagOf = (bytes: Uint8Array) =>
    createHash("md5").update(bytes).digest("hex");
  const write = (key: string, body: Uint8Array | string) => {
    mkdirSync(path.dirname(file(key)), { recursive: true });
    writeFileSync(file(key), body);
  };

  return {
    async get(key) {
      return read(key);
    },
    async getVersioned(key) {
      const body = read(key);
      return body ? { body, etag: etagOf(body) } : null;
    },
    async put(key, body) {
      write(key, body);
    },
    async putIfMatch(key, body, etag) {
      const current = read(key);
      if ((current ? etagOf(current) : null) !== etag) return false;
      write(key, body);
      return true;
    },
    async delete(key) {
      rmSync(file(key), { force: true });
    },
    async list(prefix) {
      const out: string[] = [];
      const walk = (dir: string) => {
        let entries: import("node:fs").Dirent[];
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const abs = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(abs);
          else {
            const key = path.relative(root, abs).split(path.sep).join("/");
            if (key.startsWith(prefix)) out.push(key);
          }
        }
      };
      walk(root);
      return out.sort();
    },
  };
}
