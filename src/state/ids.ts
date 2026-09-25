import type { LocalId } from "~/core/schema";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A fresh local id for plans and blocks (`LocalIdSchema`: 8–64 URL-safe chars). */
export function newLocalId(): LocalId {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

/** The clock lives here, not in core: core takes time as an argument. */
export function nowIso(): string {
  return new Date().toISOString();
}
