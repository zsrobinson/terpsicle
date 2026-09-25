import type { ContentHash } from "~/core/schema";

const encoder = new TextEncoder();

/** First 16 hex chars of SHA-256 over the exact bytes (DATA.md §2.2). */
export async function contentHash(
  bytes: Uint8Array | string,
): Promise<ContentHash> {
  const data = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  // Copy into a plain ArrayBuffer: subtle.digest rejects shared buffers.
  const digest = await crypto.subtle.digest("SHA-256", data.slice().buffer);
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The published bytes of a JSON file: `JSON.stringify` without whitespace. */
export function toJsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

export const JSON_TYPE = "application/json; charset=utf-8";
