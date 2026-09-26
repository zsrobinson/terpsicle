import { describe, expect, it } from "vitest";
import {
  anIdToken,
  anIdTokenPayload,
  FIXTURE_CLIENT_ID,
  FIXTURE_NONCE,
  FIXTURE_TOKEN_NOW,
  ID_TOKEN_PAYLOADS,
} from "~/fixtures";
import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  checkGoogleClaims,
  decodeJwtPayload,
  EXP_LEEWAY_SECONDS,
  IAT_LEEWAY_SECONDS,
  timingSafeEqualText,
} from "./claims";

const expected = {
  clientId: FIXTURE_CLIENT_ID,
  nonce: FIXTURE_NONCE,
  now: FIXTURE_TOKEN_NOW,
};

const check = (payload: unknown, overrides: Partial<typeof expected> = {}) =>
  checkGoogleClaims(payload, { ...expected, ...overrides });

describe("checkGoogleClaims: golden payloads", () => {
  it("accepts a TERPmail account, keyed on the directory ID", () => {
    expect(check(ID_TOKEN_PAYLOADS.terpmail)).toEqual({
      ok: true,
      identity: {
        directoryId: "testudo",
        email: "testudo@terpmail.umd.edu",
        hd: "terpmail.umd.edu",
        name: "Testudo Terrapin",
        pictureUrl:
          "https://lh3.googleusercontent.com/a/ACg8ocJtestudo0000000000000000000=s96-c",
        sub: "110169484474386276334",
      },
    });
  });

  it("accepts the same person's umd.edu account as the same directory ID", () => {
    const result = check(ID_TOKEN_PAYLOADS.umdEdu);
    expect(result.ok && result.identity).toMatchObject({
      directoryId: "testudo",
      email: "testudo@umd.edu",
      hd: "umd.edu",
      sub: "104857395827394857201",
    });
  });

  it.each([
    ["personalGmail", "personal-account", "hd"],
    ["missingHd", "personal-account", "hd"],
    ["otherDomain", "other-domain", "hd"],
    ["lookalikeHd", "other-domain", "hd"],
    ["wrongAud", "google-error", "aud"],
    ["expired", "expired", "exp"],
    ["badNonce", "expired", "nonce"],
    ["unverified", "unverified-email", "email_verified"],
    ["aliasAddress", "other-domain", "local-part"],
    ["wrongIssuer", "google-error", "iss"],
  ] as const)("rejects %s (%s, failing %s)", (name, error, failed) => {
    expect(check(ID_TOKEN_PAYLOADS[name])).toEqual({
      ok: false,
      error,
      check: failed,
    });
  });
});

describe("checkGoogleClaims: each check", () => {
  const nowSeconds = FIXTURE_TOKEN_NOW.getTime() / 1000;

  it("accepts both issuer spellings", () => {
    expect(check(anIdTokenPayload({ iss: "accounts.google.com" })).ok).toBe(
      true,
    );
  });

  it("accepts aud as a one-item array, not a list with others", () => {
    expect(check(anIdTokenPayload({ aud: [FIXTURE_CLIENT_ID] })).ok).toBe(true);
    expect(
      check(anIdTokenPayload({ aud: [FIXTURE_CLIENT_ID, "someone-else"] })),
    ).toMatchObject({ ok: false, check: "aud" });
  });

  it("wants exp > now − 60 s", () => {
    const exp = nowSeconds - EXP_LEEWAY_SECONDS;
    expect(check(anIdTokenPayload({ exp: exp + 1 })).ok).toBe(true);
    expect(check(anIdTokenPayload({ exp }))).toEqual({
      ok: false,
      error: "expired",
      check: "exp",
    });
  });

  it("wants iat < now + 300 s", () => {
    const iat = nowSeconds + IAT_LEEWAY_SECONDS;
    expect(check(anIdTokenPayload({ iat: iat - 1 })).ok).toBe(true);
    expect(check(anIdTokenPayload({ iat }))).toMatchObject({
      ok: false,
      error: "expired",
      check: "iat",
    });
  });

  it("requires a nonce", () => {
    const { nonce: _, ...noNonce } = anIdTokenPayload();
    expect(check(noNonce)).toMatchObject({ ok: false, check: "nonce" });
  });

  it("matches hd exactly: case, subdomains and parents all fail", () => {
    for (const hd of ["TERPMAIL.UMD.EDU", "cs.umd.edu", "edu", "umd.edu "]) {
      expect(check(anIdTokenPayload({ hd }))).toMatchObject({
        ok: false,
        error: "other-domain",
        check: "hd",
      });
    }
  });

  it("wants email_verified to be exactly true", () => {
    const { email_verified: _, ...missing } = anIdTokenPayload();
    expect(check(missing)).toMatchObject({ check: "email_verified" });
    expect(check({ ...anIdTokenPayload(), email_verified: "true" })).toEqual({
      ok: false,
      error: "google-error",
      check: "shape",
    });
  });

  it("requires the email's domain to be the token's hd", () => {
    expect(
      check(
        anIdTokenPayload({ hd: "umd.edu", email: "testudo@terpmail.umd.edu" }),
      ),
    ).toEqual({ ok: false, error: "other-domain", check: "email" });
    expect(
      check(anIdTokenPayload({ email: "testudo@gmail.com" })),
    ).toMatchObject({ ok: false, check: "email" });
  });

  it("takes the local part as the directory ID: 2–16 letters and digits", () => {
    const id = (email: string) => {
      const result = check(anIdTokenPayload({ email }));
      return result.ok ? result.identity.directoryId : result.check;
    };
    expect(id("TESTUDO@terpmail.umd.edu")).toBe("testudo");
    expect(id("ab@terpmail.umd.edu")).toBe("ab");
    expect(id("a1234567890bcdef@terpmail.umd.edu")).toBe("a1234567890bcdef");
    expect(id("a@terpmail.umd.edu")).toBe("local-part");
    expect(id("a1234567890bcdefg@terpmail.umd.edu")).toBe("local-part");
    expect(id("terp+x@terpmail.umd.edu")).toBe("local-part");
  });

  it("builds the name from its parts, or falls back to the directory ID", () => {
    const { name: _, ...parts } = anIdTokenPayload();
    const fromParts = check(parts);
    expect(fromParts.ok && fromParts.identity.name).toBe("Testudo Terrapin");
    const {
      name: _n,
      given_name: _g,
      family_name: _f,
      ...nameless
    } = anIdTokenPayload();
    const fallback = check(nameless);
    expect(fallback.ok && fallback.identity.name).toBe("testudo");
  });

  it("keeps only Google-hosted https pictures", () => {
    for (const picture of [
      "http://lh3.googleusercontent.com/a/x",
      "https://evil.example/a.png",
      "javascript:alert(1)",
    ]) {
      const result = check(anIdTokenPayload({ picture }));
      expect(result.ok && result.identity.pictureUrl).toBeNull();
    }
  });

  it("rejects payloads that aren't claims", () => {
    for (const payload of [null, "token", { iss: "x" }, []]) {
      expect(check(payload)).toMatchObject({ ok: false, check: "shape" });
    }
  });
});

describe("decodeJwtPayload", () => {
  it("reads a compact JWT's payload, UTF-8 included", () => {
    const payload = anIdTokenPayload({ name: "Zoë Ångström 李" });
    expect(decodeJwtPayload(anIdToken(payload))).toEqual(payload);
  });

  it("is null for anything else", () => {
    for (const token of ["", "a.b", "a.b.c.d", "a.!!!.c", "a..c"]) {
      expect(decodeJwtPayload(token)).toBeNull();
    }
    expect(
      decodeJwtPayload(`x.${base64UrlEncodeText("{not json")}.y`),
    ).toBeNull();
  });
});

describe("base64url", () => {
  it("round-trips text, with or without padding", () => {
    for (const text of ["", "a", "ab", "abc", "✓ ok", "?>?"]) {
      const encoded = base64UrlEncodeText(text);
      expect(encoded).not.toMatch(/[+/=]/);
      expect(base64UrlDecodeText(encoded)).toBe(text);
    }
    expect(base64UrlDecodeText("YQ==")).toBe("a");
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => base64UrlDecodeText("a+b/")).toThrow();
  });
});

describe("timingSafeEqualText", () => {
  it("compares whole strings", () => {
    expect(timingSafeEqualText("abc", "abc")).toBe(true);
    expect(timingSafeEqualText("abc", "abd")).toBe(false);
    expect(timingSafeEqualText("abc", "abcd")).toBe(false);
  });
});
