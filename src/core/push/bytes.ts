// Bytes for web push: base64url without padding (what push subscriptions,
// VAPID keys and JWTs use) and concatenation.

/** Bytes → base64url without padding. */
export function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** base64url (padding and whitespace allowed) → bytes, or null when it isn't base64url. */
export function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text.replace(/\s+/g, "").replace(/=+$/, "");
  if (!/^[A-Za-z0-9_-]*$/.test(clean) || clean.length % 4 === 1) return null;
  const binary = atob(clean.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export const utf8 = (text: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
