// P-256 keys as web push passes them around: a public key is the 65-byte
// uncompressed point (0x04 ‖ x ‖ y), a private key is the 32-byte scalar `d`,
// both base64url. WebCrypto can't import a raw private scalar, so it goes in
// as a JWK with its public point.
import { fromBase64url, toBase64url } from "./bytes";

type Algorithm = "ECDH" | "ECDSA";

/** The 65-byte uncompressed point, or null when `text` isn't one. */
export function publicKeyBytes(text: string): Uint8Array<ArrayBuffer> | null {
  const bytes = fromBase64url(text);
  return bytes && bytes.length === 65 && bytes[0] === 0x04 ? bytes : null;
}

function jwkOf(publicKey: Uint8Array, d?: string): JsonWebKey {
  return {
    kty: "EC",
    crv: "P-256",
    x: toBase64url(publicKey.subarray(1, 33)),
    y: toBase64url(publicKey.subarray(33, 65)),
    ...(d === undefined ? {} : { d }),
    ext: true,
  };
}

/** A raw public point as a WebCrypto key (throws when it isn't on the curve). */
export function importPublicKey(
  publicKey: Uint8Array<ArrayBuffer>,
  algorithm: Algorithm,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    publicKey,
    { name: algorithm, namedCurve: "P-256" },
    true,
    algorithm === "ECDSA" ? ["verify"] : [],
  );
}

/** `d` (base64url) with its public point as a WebCrypto private key. */
export function importPrivateKey(
  d: string,
  publicKey: Uint8Array,
  algorithm: Algorithm,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwkOf(publicKey, d),
    { name: algorithm, namedCurve: "P-256" },
    false,
    algorithm === "ECDSA" ? ["sign"] : ["deriveBits"],
  );
}

/** A key's public point, 65 bytes. */
export async function exportPublicKey(
  key: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  // Workers' types widen every export to `ArrayBuffer | JsonWebKey`.
  const raw = (await crypto.subtle.exportKey("raw", key)) as ArrayBuffer;
  return new Uint8Array(raw);
}

/** A fresh P-256 key pair (Workers' types don't narrow `generateKey` to a pair). */
export async function generateKeyPair(
  algorithm: Algorithm,
  extractable = false,
): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(
    { name: algorithm, namedCurve: "P-256" },
    extractable,
    algorithm === "ECDSA" ? ["sign", "verify"] : ["deriveBits"],
  )) as CryptoKeyPair;
}
