// Identity fixtures: test mode's users, golden Google ID-token payloads and
// builders around them. The payloads follow the shape Google documents for
// the token endpoint's `id_token`
// (developers.google.com/identity/openid-connect/openid-connect), with one
// real-looking account per case the claim checks must handle.
import {
  base64UrlEncodeText,
  type GoogleIdClaims,
  type Identity,
  TEST_USERS,
} from "~/core";

export { TEST_USERS };

/** The OAuth client id every fixture token is issued to. */
export const FIXTURE_CLIENT_ID =
  "1234567890-terpsicle.apps.googleusercontent.com";
/** The nonce the fixture flow sent to Google. */
export const FIXTURE_NONCE = "n-0S6_WzA2Mj-fixture-nonce-4f2b1c9d8e7a0b1c2d3";
/** "Now" for the fixture tokens: a minute after they were issued. */
export const FIXTURE_TOKEN_NOW = new Date("2026-10-01T15:01:00.000Z");

const ISSUED_AT = Date.parse("2026-10-01T15:00:00.000Z") / 1000;

/** A TERPmail undergraduate: `hd` is terpmail.umd.edu. */
const terpmail: GoogleIdClaims = {
  iss: "https://accounts.google.com",
  azp: FIXTURE_CLIENT_ID,
  aud: FIXTURE_CLIENT_ID,
  sub: "110169484474386276334",
  hd: "terpmail.umd.edu",
  email: "testudo@terpmail.umd.edu",
  email_verified: true,
  at_hash: "HK6E_P6Dh8Y93mRNtsDB1Q",
  nonce: FIXTURE_NONCE,
  name: "Testudo Terrapin",
  picture:
    "https://lh3.googleusercontent.com/a/ACg8ocJtestudo0000000000000000000=s96-c",
  given_name: "Testudo",
  family_name: "Terrapin",
  iat: ISSUED_AT,
  exp: ISSUED_AT + 3600,
};

function omit<T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const { [key]: _, ...rest } = value;
  return rest;
}

/** Golden payloads, one per case (src/core/auth/claims.test.ts). */
export const ID_TOKEN_PAYLOADS = {
  terpmail,
  /**
   * The same person's UMD Gmail account (student workers have both): `hd`
   * is umd.edu, and Google's `sub` differs from the TERPmail one.
   */
  umdEdu: {
    ...terpmail,
    sub: "104857395827394857201",
    hd: "umd.edu",
    email: "testudo@umd.edu",
    picture:
      "https://lh3.googleusercontent.com/a/ACg8ocKtestudoUMD000000000000000=s96-c",
  },
  /** A personal Gmail account: no `hd` at all. */
  personalGmail: {
    ...omit(terpmail, "hd"),
    sub: "117263748592034857612",
    email: "testudo.terrapin@gmail.com",
  },
  /**
   * A consumer Google account whose login is a UMD address (made at
   * accounts.google.com with an existing email): no `hd`, so Google isn't
   * authoritative for the address.
   */
  missingHd: {
    ...omit(terpmail, "hd"),
    sub: "108273645501928374650",
    email: "testudo@umd.edu",
  },
  /** Another school's Workspace. */
  otherDomain: { ...terpmail, hd: "jhu.edu", email: "testudo@jhu.edu" },
  /** A lookalike domain, to prove `hd` is matched exactly. */
  lookalikeHd: {
    ...terpmail,
    hd: "terpmail.umd.edu.evil.com",
    email: "testudo@terpmail.umd.edu.evil.com",
  },
  /** Issued to someone else's OAuth client. */
  wrongAud: {
    ...terpmail,
    aud: "999999999999-someone-else.apps.googleusercontent.com",
    azp: "999999999999-someone-else.apps.googleusercontent.com",
  },
  /** Expired an hour before `FIXTURE_TOKEN_NOW`. */
  expired: { ...terpmail, iat: ISSUED_AT - 3 * 3600, exp: ISSUED_AT - 3600 },
  /** From another sign-in (a replayed or swapped token). */
  badNonce: {
    ...terpmail,
    nonce: "a-different-flows-nonce-00000000000000000000",
  },
  /** Google says the address isn't verified. */
  unverified: { ...terpmail, email_verified: false },
  /** A UMD address that isn't a directory ID. */
  aliasAddress: { ...terpmail, email: "testudo.terrapin@terpmail.umd.edu" },
  /** From an issuer that isn't Google. */
  wrongIssuer: { ...terpmail, iss: "https://accounts.example.com" },
} satisfies Record<string, GoogleIdClaims>;

/** A TERPmail token payload with overrides. */
export function anIdTokenPayload(
  overrides: Partial<GoogleIdClaims> = {},
): GoogleIdClaims {
  return { ...terpmail, ...overrides };
}

/**
 * A compact, unsigned JWT around `payload`, as the token endpoint would
 * return it (we never check the signature: src/core/auth/claims.ts).
 */
export function anIdToken(payload: object = terpmail): string {
  const header = base64UrlEncodeText(
    JSON.stringify({ alg: "RS256", kid: "fixture", typ: "JWT" }),
  );
  return `${header}.${base64UrlEncodeText(JSON.stringify(payload))}.c2lnbmF0dXJl`;
}

/** Who `terpmail` signs in as. */
export function anIdentity(overrides: Partial<Identity> = {}): Identity {
  return {
    directoryId: "testudo",
    email: "testudo@terpmail.umd.edu",
    hd: "terpmail.umd.edu",
    name: "Testudo Terrapin",
    pictureUrl:
      "https://lh3.googleusercontent.com/a/ACg8ocJtestudo0000000000000000000=s96-c",
    sub: "110169484474386276334",
    ...overrides,
  };
}
