// VAPID (RFC 8292): the application server proves who it is to a push
// service with an ES256 JWT, `{aud: <push service origin>, exp, sub}`, and
// its public key. WebCrypto's ECDSA signature is already the raw r ‖ s that
// JWS wants (RFC 7518 §3.4).
import { fromBase64url, toBase64url, utf8 } from "./bytes";
import { importPublicKey } from "./keys";

/** How long a JWT is good for (RFC 8292 allows at most 24 h). */
export const VAPID_JWT_SECONDS = 12 * 3600;

const HEADER = toBase64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));

export interface VapidClaims {
  /** The push service's origin: `https://fcm.googleapis.com`. */
  aud: string;
  /** Seconds since the epoch. */
  exp: number;
  /** A contact: `mailto:alerts@terpsicle.com`. */
  sub: string;
}

/** A signed JWT for these claims. `privateKey` is ECDSA P-256, "sign". */
export async function signVapidJwt(
  claims: VapidClaims,
  privateKey: CryptoKey,
): Promise<string> {
  const unsigned = `${HEADER}.${toBase64url(utf8(JSON.stringify(claims)))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      utf8(unsigned),
    ),
  );
  return `${unsigned}.${toBase64url(signature)}`;
}

/** The `Authorization` header for a push request (RFC 8292 §3). */
export function vapidAuthorization(jwt: string, publicKey: string): string {
  return `vapid t=${jwt}, k=${publicKey}`;
}

/**
 * A JWT's claims when its ES256 signature checks out under `publicKey`
 * (base64url, 65 bytes), else null. What a push service does; for tests.
 */
export async function verifyVapidJwt(
  jwt: string,
  publicKey: string,
): Promise<Record<string, unknown> | null> {
  const [header, payload, signature, ...rest] = jwt.split(".");
  const key = fromBase64url(publicKey);
  const sig = signature === undefined ? null : fromBase64url(signature);
  if (!header || !payload || !sig || !key || rest.length > 0) return null;
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    await importPublicKey(key, "ECDSA"),
    sig,
    utf8(`${header}.${payload}`),
  );
  if (!ok) return null;
  const claims = fromBase64url(payload);
  return claims
    ? (JSON.parse(new TextDecoder().decode(claims)) as Record<string, unknown>)
    : null;
}
