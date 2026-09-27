// Message encryption for web push (RFC 8291) in the aes128gcm content coding
// (RFC 8188): ECDH on P-256 between a one-off sender key and the
// subscription's key, HKDF-SHA-256 with the subscription's auth secret, then
// AES-128-GCM over one record. WebCrypto only, so it runs in the Worker.
// The sender's key pair and the salt are arguments: the server makes fresh
// ones per message, and the test passes RFC 8291 Appendix A's.
import { concatBytes, utf8 } from "./bytes";
import { exportPublicKey, importPublicKey } from "./keys";

/** One record holds the whole message (V2 §6.4 caps payloads at 3 KB). */
export const PUSH_RECORD_SIZE = 4096;
/** Room for the message in a record: less the 16-byte tag and the 0x02 delimiter. */
export const PUSH_MAX_PLAINTEXT = PUSH_RECORD_SIZE - 17;

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      key,
      bytes * 8,
    ),
  );
}

/** The content key and nonce both sides derive (RFC 8291 §3.3–3.4). */
async function contentKeys(args: {
  ecdhSecret: Uint8Array<ArrayBuffer>;
  authSecret: Uint8Array<ArrayBuffer>;
  uaPublic: Uint8Array;
  asPublic: Uint8Array;
  salt: Uint8Array<ArrayBuffer>;
}): Promise<{ key: CryptoKey; nonce: Uint8Array<ArrayBuffer> }> {
  const keyInfo = concatBytes(
    utf8("WebPush: info\0"),
    args.uaPublic,
    args.asPublic,
  );
  const ikm = await hkdf(args.authSecret, args.ecdhSecret, keyInfo, 32);
  const cek = await hkdf(
    args.salt,
    ikm,
    utf8("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    args.salt,
    ikm,
    utf8("Content-Encoding: nonce\0"),
    12,
  );
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return { key, nonce };
}

async function ecdh(
  privateKey: CryptoKey,
  publicKey: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const peer = await importPublicKey(publicKey, "ECDH");
  // Workers' types spell the peer `$public`; both runtimes read `public`.
  const algorithm = { name: "ECDH", public: peer } as unknown as Parameters<
    typeof crypto.subtle.deriveBits
  >[0];
  return new Uint8Array(
    await crypto.subtle.deriveBits(algorithm, privateKey, 256),
  );
}

export interface EncryptArgs {
  plaintext: Uint8Array;
  /** The subscription's `keys.p256dh`, 65 bytes. */
  uaPublic: Uint8Array<ArrayBuffer>;
  /** The subscription's `keys.auth`, 16 bytes. */
  authSecret: Uint8Array<ArrayBuffer>;
  /** A fresh ECDH P-256 pair per message. */
  sender: CryptoKeyPair;
  /** 16 random bytes per message. */
  salt: Uint8Array<ArrayBuffer>;
}

/**
 * The request body for one push: the aes128gcm header (salt, record size,
 * the sender's public key) and the one encrypted record.
 */
export async function encryptPushPayload(
  args: EncryptArgs,
): Promise<Uint8Array<ArrayBuffer>> {
  if (args.plaintext.length > PUSH_MAX_PLAINTEXT)
    throw new RangeError("Push payload too large for one record");
  if (args.salt.length !== 16) throw new RangeError("Salt must be 16 bytes");
  const asPublic = await exportPublicKey(args.sender.publicKey);
  const { key, nonce } = await contentKeys({
    ecdhSecret: await ecdh(args.sender.privateKey, args.uaPublic),
    authSecret: args.authSecret,
    uaPublic: args.uaPublic,
    asPublic,
    salt: args.salt,
  });
  const record = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      concatBytes(args.plaintext, new Uint8Array([0x02])),
    ),
  );
  const header = new Uint8Array(21);
  header.set(args.salt, 0);
  new DataView(header.buffer).setUint32(16, PUSH_RECORD_SIZE);
  header[20] = asPublic.length;
  return concatBytes(header, asPublic, record);
}

/**
 * What the browser does with a push body: the reverse of
 * `encryptPushPayload`, for tests (and e2e's stand-in push service).
 * Returns null for a body that doesn't decrypt.
 */
export async function decryptPushPayload(args: {
  body: Uint8Array;
  /** The subscription's private ECDH key and its public point. */
  uaPrivate: CryptoKey;
  uaPublic: Uint8Array;
  authSecret: Uint8Array<ArrayBuffer>;
}): Promise<Uint8Array<ArrayBuffer> | null> {
  const { body } = args;
  if (body.length < 21) return null;
  const idLength = body[20] ?? 0;
  const salt = body.slice(0, 16);
  const asPublic = body.slice(21, 21 + idLength);
  const record = body.slice(21 + idLength);
  try {
    const { key, nonce } = await contentKeys({
      ecdhSecret: await ecdh(args.uaPrivate, asPublic),
      authSecret: args.authSecret,
      uaPublic: args.uaPublic,
      asPublic,
      salt,
    });
    const padded = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, record),
    );
    // The last record ends with 0x02, then zero padding (RFC 8188 §2).
    let end = padded.length - 1;
    while (end >= 0 && padded[end] === 0) end--;
    return padded[end] === 0x02 ? padded.slice(0, end) : null;
  } catch {
    return null;
  }
}
