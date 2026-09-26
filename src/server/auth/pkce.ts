// PKCE (RFC 7636), state and nonce with WebCrypto: no OAuth library.
import { base64UrlEncodeBytes } from "~/core/auth";

/** 32 random bytes → 43 base64url chars: a code_verifier, state or nonce. */
export function randomSecret(): string {
  return base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(32)));
}

/** BASE64URL(SHA-256(verifier)): the `S256` code challenge. */
export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncodeBytes(new Uint8Array(digest));
}
