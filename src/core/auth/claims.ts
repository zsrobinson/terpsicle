import {
  GoogleIdClaimsSchema,
  type Identity,
  PictureUrlSchema,
  type SignInError,
  UmdDomainSchema,
  UmdEmailSchema,
} from "../schema";

// The checks on a Google ID token (docs/V2.md §4.2, docs/AUTH.md). The token
// comes straight from Google's token endpoint over TLS, in exchange for our
// client secret, so its signature needn't be checked ("you can be confident
// that the token you receive really comes from Google"); its claims must be.

/** Both spellings Google documents for `iss`. */
export const GOOGLE_ISSUERS: readonly string[] = [
  "https://accounts.google.com",
  "accounts.google.com",
];

/** An `exp` this far in the past still passes (our clock may be ahead). */
export const EXP_LEEWAY_SECONDS = 60;
/** An `iat` this far in the future still passes (our clock may be behind). */
export const IAT_LEEWAY_SECONDS = 300;

/** Which check failed: for tests and logs, never shown to people. */
export type ClaimCheckName =
  | "shape"
  | "iss"
  | "aud"
  | "exp"
  | "iat"
  | "nonce"
  | "hd"
  | "email_verified"
  | "email"
  | "local-part";

export type ClaimCheckResult =
  | { ok: true; identity: Identity }
  | { ok: false; error: SignInError; check: ClaimCheckName };

export interface ExpectedClaims {
  /** Our OAuth client id (GOOGLE_CLIENT_ID). */
  clientId: string;
  /** The nonce this browser's flow sent to Google. */
  nonce: string;
  now: Date;
}

const fail = (error: SignInError, check: ClaimCheckName): ClaimCheckResult => ({
  ok: false,
  error,
  check,
});

/**
 * Accepts only a verified UMD Google account, keyed on the directory ID.
 * `hd` must be exactly `terpmail.umd.edu` or `umd.edu`: an email suffix
 * alone doesn't prove the account, since Google is authoritative for a
 * non-Gmail address only "when email_verified is true and hd is set".
 */
export function checkGoogleClaims(
  payload: unknown,
  expected: ExpectedClaims,
): ClaimCheckResult {
  const parsed = GoogleIdClaimsSchema.safeParse(payload);
  if (!parsed.success) return fail("google-error", "shape");
  const claims = parsed.data;
  const nowSeconds = expected.now.getTime() / 1000;

  if (!GOOGLE_ISSUERS.includes(claims.iss)) return fail("google-error", "iss");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (audiences.length !== 1 || audiences[0] !== expected.clientId)
    return fail("google-error", "aud");
  if (!(claims.exp > nowSeconds - EXP_LEEWAY_SECONDS))
    return fail("expired", "exp");
  if (!(claims.iat < nowSeconds + IAT_LEEWAY_SECONDS))
    return fail("expired", "iat");
  if (!claims.nonce || !timingSafeEqualText(claims.nonce, expected.nonce))
    return fail("expired", "nonce");

  if (claims.hd === undefined) return fail("personal-account", "hd");
  const hd = UmdDomainSchema.safeParse(claims.hd);
  if (!hd.success) return fail("other-domain", "hd");
  if (claims.email_verified !== true)
    return fail("unverified-email", "email_verified");

  const email = (claims.email ?? "").trim().toLowerCase();
  if (!email.endsWith(`@${hd.data}`)) return fail("other-domain", "email");
  const umd = UmdEmailSchema.safeParse(email);
  if (!umd.success) return fail("other-domain", "local-part");

  const picture = PictureUrlSchema.safeParse(claims.picture);
  return {
    ok: true,
    identity: {
      directoryId: umd.data.directoryId,
      email: umd.data.email,
      hd: hd.data,
      name: displayName(claims) ?? umd.data.directoryId,
      pictureUrl: picture.success ? picture.data : null,
      sub: claims.sub,
    },
  };
}

function displayName(claims: {
  name?: string | undefined;
  given_name?: string | undefined;
  family_name?: string | undefined;
}): string | null {
  const full =
    claims.name?.trim() ||
    [claims.given_name, claims.family_name]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ");
  return full ? full.slice(0, 200) : null;
}

/** Compares without an early exit, so timing says nothing about the value. */
export function timingSafeEqualText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The payload of a compact JWT (`header.payload.signature`), or null when it
 * isn't one. Doesn't check the signature: see the note at the top.
 */
export function decodeJwtPayload(token: string): unknown {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    return JSON.parse(base64UrlDecodeText(parts[1]));
  } catch {
    return null;
  }
}

/** base64url (padded or not) → UTF-8 text; throws on anything else. */
export function base64UrlDecodeText(value: string): string {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) throw new Error("Not base64url");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
    bytes,
  );
}

/** UTF-8 text → base64url without padding. */
export function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

/** Bytes → base64url without padding. */
export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
