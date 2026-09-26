// Identity end to end through the real router and D1 (docs/AUTH.md): the
// Google flow with a mocked token endpoint, sessions, pictures, admin,
// deletion and test mode. Google itself is the only thing faked.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAdmins, SESSION_REFRESH_AFTER_MS } from "~/core/auth";
import { type MeResult, MeResultSchema } from "~/core/schema";
import { anIdToken, FIXTURE_CLIENT_ID, ID_TOKEN_PAYLOADS } from "~/fixtures";
import { runDailyJob } from "~/jobs/daily";
import { type ApiEnv, handleApi } from "../api/router";
import { testBindings } from "../test-bindings";
import { ADMINS_FILE, isAdmin } from "./admin";
import { isTestMode, signInMode } from "./config";
import { GOOGLE_TOKEN_URL } from "./google";
import { requireAdmin, requireUser } from "./guard";
import { s256 } from "./pkce";
import { getUser, userIdentities } from "./store";

const ORIGIN = "https://terpsicle.com";
const AUTH_SECRET = "test-auth-secret-0123456789abcdefghijklmnopq";

const googleEnv = (overrides: Partial<ApiEnv> = {}): ApiEnv => ({
  ...env,
  SIGN_IN_ENABLED: "true",
  GOOGLE_CLIENT_ID: FIXTURE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: "fixture-client-secret",
  GOOGLE_REDIRECT_ORIGINS: ORIGIN,
  AUTH_SECRET,
  ...overrides,
});

let clock = Date.parse("2026-10-01T15:00:00.000Z");
const now = () => new Date(clock);
const tick = (ms: number) => {
  clock += ms;
};

/** A browser: a cookie jar over the router, plus what Google would do. */
class Browser {
  cookies = new Map<string, string>();

  constructor(
    readonly testEnv: ApiEnv,
    readonly origin = ORIGIN,
    readonly fetcher: typeof fetch = googleFetch,
  ) {}

  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  keep(response: Response): Response {
    for (const line of response.headers.getSetCookie()) {
      const [pair = "", ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const maxAge = attrs.find((a) => a.trim().startsWith("Max-Age="));
      if (maxAge?.trim() === "Max-Age=0") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  async request(
    path: string,
    init: RequestInit & { headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const request = new Request(`${this.origin}${path}`, {
      ...init,
      headers: { Cookie: this.cookieHeader(), ...init.headers },
      redirect: "manual",
    });
    return this.keep(
      await handleApi(request, this.testEnv, { waitUntil: () => {} }, now(), {
        fetch: this.fetcher,
      }),
    );
  }

  /** A same-origin JSON POST, as the app sends. */
  post(path: string, body: unknown = {}, headers: Record<string, string> = {}) {
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Origin: this.origin,
        "Sec-Fetch-Site": "same-origin",
        ...headers,
      },
    });
  }

  async me(): Promise<MeResult> {
    return MeResultSchema.parse(await (await this.post("/api/me")).json());
  }

  /** Start → Google (who signs in as `claims`) → callback. */
  async signInWithGoogle(
    claims: object,
    options: { returnTo?: string; tamper?: (callback: URL) => void } = {},
  ): Promise<Response> {
    const start = await this.request(
      `/api/auth/google?return=${encodeURIComponent(options.returnTo ?? "/settings")}`,
    );
    expect(start.status).toBe(302);
    const authorize = new URL(start.headers.get("Location") ?? "");
    const params = authorize.searchParams;
    pendingGoogle = {
      claims: { ...claims, nonce: params.get("nonce") },
      challenge: params.get("code_challenge") ?? "",
    };
    const callback = new URL(params.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "4/fixture-authorization-code");
    callback.searchParams.set("state", params.get("state") ?? "");
    options.tamper?.(callback);
    return this.request(`${callback.pathname}${callback.search}`);
  }
}

/** What the mocked Google token endpoint hands out next. */
let pendingGoogle: { claims: object; challenge: string } | null = null;
let tokenStatus = 200;
/** Picture bytes by URL, as Google's image server would answer. */
const pictures = new Map<string, Uint8Array>();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

const googleFetch = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === GOOGLE_TOKEN_URL) {
      const form = new URLSearchParams(String(init?.body));
      // Google checks PKCE: the verifier must hash to the challenge.
      const verifier = form.get("code_verifier") ?? "";
      if (
        !pendingGoogle ||
        tokenStatus !== 200 ||
        (await s256(verifier)) !== pendingGoogle.challenge ||
        form.get("client_secret") !== "fixture-client-secret" ||
        form.get("grant_type") !== "authorization_code"
      )
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({
        access_token: "ya29.fixture",
        id_token: anIdToken(pendingGoogle.claims),
        expires_in: 3599,
        token_type: "Bearer",
      });
    }
    const picture = pictures.get(url);
    if (picture)
      return new Response(picture, {
        headers: { "Content-Type": "image/png" },
      });
    return new Response("Not found", { status: 404 });
  },
) as unknown as typeof fetch;

const location = (response: Response) =>
  new URL(response.headers.get("Location") ?? "", ORIGIN);

beforeEach(async () => {
  pendingGoogle = null;
  tokenStatus = 200;
  pictures.clear();
  pictures.set(
    `${ID_TOKEN_PAYLOADS.terpmail.picture?.replace(/=s96-c$/, "")}=s96-c`,
    PNG,
  );
  await env.DB.exec(
    "DELETE FROM sessions; DELETE FROM user_identities; DELETE FROM users; DELETE FROM counters;",
  );
  const listed = await env.USER_CONTENT.list();
  if (listed.objects.length > 0)
    await env.USER_CONTENT.delete(listed.objects.map((o) => o.key));
});

describe("configuration", () => {
  const url = (host: string) => new URL(`https://${host}/`);

  it("uses Google only with every piece set, on a listed origin", () => {
    expect(signInMode(googleEnv(), url("terpsicle.com")).kind).toBe("google");
    for (const missing of [
      "SIGN_IN_ENABLED",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "AUTH_SECRET",
      "GOOGLE_REDIRECT_ORIGINS",
    ] as const) {
      expect(
        signInMode(googleEnv({ [missing]: "" }), url("terpsicle.com")).kind,
      ).toBe("off");
    }
    expect(
      signInMode(googleEnv({ SIGN_IN_ENABLED: "false" }), url("terpsicle.com"))
        .kind,
    ).toBe("off");
    expect(signInMode(googleEnv(), url("evil.example")).kind).toBe("off");
  });

  it("allows test mode on previews and localhost, never on terpsicle.com", () => {
    const testEnv = googleEnv({ AUTH_TEST_MODE: "true" });
    expect(
      isTestMode(testEnv, url("pr-12-terpsicle.zsrobinson.workers.dev")),
    ).toBe(true);
    expect(isTestMode(testEnv, new URL("http://localhost:3000/"))).toBe(true);
    for (const host of [
      "terpsicle.com",
      "www.terpsicle.com",
      "evil.example",
      "pr-12-terpsicle.someone.workers.dev",
    ]) {
      expect(isTestMode(testEnv, url(host))).toBe(false);
    }
    expect(signInMode(testEnv, url("terpsicle.com")).kind).toBe("google");
    expect(isTestMode(googleEnv(), new URL("http://localhost:3000/"))).toBe(
      false,
    );
  });

  it("never sets AUTH_TEST_MODE in production's vars", () => {
    const { production, previews } = testBindings().varNames;
    expect(production).not.toContain("AUTH_TEST_MODE");
    expect(previews).toContain("AUTH_TEST_MODE");
  });
});

describe("config/admins.txt", () => {
  it("parses, every entry is a directory ID, and the owner is first", () => {
    const ids = parseAdmins(ADMINS_FILE);
    expect([...ids][0]).toBe("robinson");
  });

  it("is what isAdmin reads; tadmin counts only in test mode", () => {
    expect(isAdmin("robinson", { authTestMode: false })).toBe(true);
    expect(isAdmin("testudo", { authTestMode: false })).toBe(false);
    expect(isAdmin("tadmin", { authTestMode: false })).toBe(false);
    expect(isAdmin("tadmin", { authTestMode: true })).toBe(true);
  });
});

describe("start", () => {
  it("sends the browser to Google with PKCE, state, nonce and the hints", async () => {
    const browser = new Browser(googleEnv());
    browser.cookies.set("__Host-hint", "testudo@umd.edu");
    const response = await browser.request("/api/auth/google?return=/chat");
    expect(response.status).toBe(302);
    const authorize = location(response);
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    const q = Object.fromEntries(authorize.searchParams);
    expect(q).toMatchObject({
      client_id: FIXTURE_CLIENT_ID,
      redirect_uri: "https://terpsicle.com/api/auth/google/callback",
      response_type: "code",
      scope: "openid email profile",
      code_challenge_method: "S256",
      prompt: "select_account",
      hd: "*",
      login_hint: "testudo@umd.edu",
    });
    for (const key of ["state", "nonce", "code_challenge"])
      expect(q[key]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = response.headers.getSetCookie()[0] ?? "";
    expect(cookie).toMatch(
      /^__Host-oauth=[^.;]+\.[^.;]+; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/,
    );
    // The flow cookie never carries the address or the hint.
    expect(cookie).not.toContain("testudo");
  });

  it("sends people to /signin when signing in is off or in test mode", async () => {
    const off = await new Browser(googleEnv({ GOOGLE_CLIENT_ID: "" })).request(
      "/api/auth/google?return=/chat",
    );
    expect(location(off).pathname + location(off).search).toBe(
      "/signin?error=unavailable&return=%2Fchat",
    );
    expect(off.headers.getSetCookie()).toEqual([]);

    const test = await new Browser(
      googleEnv({ AUTH_TEST_MODE: "true" }),
      "http://localhost:3000",
    ).request("/api/auth/google?return=https://evil.example");
    expect(test.headers.get("Location")).toBe(
      "http://localhost:3000/auth/test?return=%2Fschedule",
    );
  });
});

describe("callback", () => {
  it("signs a TERPmail account in and lands on return with ?signed-in=1", async () => {
    const browser = new Browser(googleEnv());
    const response = await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "https://terpsicle.com/settings?signed-in=1",
    );
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toContain(
      "__Host-oauth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    );
    expect(setCookies.find((c) => c.startsWith("__Host-session="))).toMatch(
      /^__Host-session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/,
    );

    const me = await browser.me();
    expect(me).toMatchObject({
      status: "signed-in",
      flags: { signIn: true, authTestMode: false },
      user: {
        id: "testudo",
        name: "Testudo Terrapin",
        email: "testudo@terpmail.umd.edu",
        isAdmin: false,
        createdAt: now().toISOString(),
      },
      pushPublicKey: null,
    });
    // Only the session's hash is stored.
    const token = browser.cookies.get("__Host-session") ?? "";
    const { results } = await env.DB.prepare(
      "SELECT id_hash FROM sessions",
    ).all();
    expect(JSON.stringify(results)).not.toContain(token);
  });

  it.each([
    ["personalGmail", "personal-account"],
    ["missingHd", "personal-account"],
    ["otherDomain", "other-domain"],
    ["wrongAud", "google-error"],
    ["expired", "expired"],
    ["unverified", "unverified-email"],
    ["aliasAddress", "other-domain"],
  ] as const)("refuses %s with /signin?error=%s", async (name, error) => {
    const browser = new Browser(googleEnv());
    const claims = ID_TOKEN_PAYLOADS[name];
    // Golden tokens are from 2026-10-01 15:00; the clock stays there.
    const response = await browser.signInWithGoogle(claims, {
      returnTo: "/chat",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `https://terpsicle.com/signin?error=${error}&return=%2Fchat`,
    );
    expect(browser.cookies.has("__Host-session")).toBe(false);
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM users").first("n"),
    ).toBe(0);
  });

  it("refuses a bad nonce (a token from another sign-in)", async () => {
    const browser = new Browser(googleEnv());
    await browser.request("/api/auth/google");
    const start = await browser.request("/api/auth/google");
    const params = location(start).searchParams;
    pendingGoogle = {
      claims: { ...ID_TOKEN_PAYLOADS.badNonce },
      challenge: params.get("code_challenge") ?? "",
    };
    const response = await browser.request(
      `/api/auth/google/callback?code=x&state=${params.get("state")}`,
    );
    expect(location(response).searchParams.get("error")).toBe("expired");
  });

  it("refuses a state that doesn't match, a forged or missing flow cookie", async () => {
    const wrongState = new Browser(googleEnv());
    const r1 = await wrongState.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail, {
      tamper: (url) => url.searchParams.set("state", "x".repeat(43)),
    });
    expect(location(r1).searchParams.get("error")).toBe("expired");

    const forged = new Browser(googleEnv());
    const r2 = await forged.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail, {
      tamper: () => {
        const [payload] = (forged.cookies.get("__Host-oauth") ?? "").split(".");
        forged.cookies.set("__Host-oauth", `${payload}.forgedsignature`);
      },
    });
    expect(location(r2).searchParams.get("error")).toBe("expired");

    const otherBrowser = new Browser(googleEnv());
    const r3 = await otherBrowser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail, {
      tamper: () => otherBrowser.cookies.delete("__Host-oauth"),
    });
    expect(location(r3).searchParams.get("error")).toBe("expired");
  });

  it("refuses a flow cookie older than 10 minutes", async () => {
    const browser = new Browser(googleEnv());
    const response = await browser.signInWithGoogle(
      ID_TOKEN_PAYLOADS.terpmail,
      {
        tamper: () => tick(10 * 60_000 + 1000),
      },
    );
    expect(location(response).searchParams.get("error")).toBe("expired");
    tick(-(10 * 60_000 + 1000));
  });

  it("says cancelled when they chose Cancel, and google-error when Google fails", async () => {
    const cancelled = await new Browser(googleEnv()).signInWithGoogle(
      ID_TOKEN_PAYLOADS.terpmail,
      {
        tamper: (url) => {
          url.searchParams.delete("code");
          url.searchParams.set("error", "access_denied");
        },
      },
    );
    expect(location(cancelled).searchParams.get("error")).toBe("cancelled");

    tokenStatus = 400;
    const failed = await new Browser(googleEnv()).signInWithGoogle(
      ID_TOKEN_PAYLOADS.terpmail,
    );
    expect(location(failed).searchParams.get("error")).toBe("google-error");
  });

  it("lands the TERPmail and umd.edu accounts on the same user", async () => {
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    tick(60_000);
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.umdEdu);
    const user = await getUser(env.DB, "testudo");
    expect(user).toMatchObject({ email: "testudo@umd.edu", hd: "umd.edu" });
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM users").first("n"),
    ).toBe(1);
    const identities = await userIdentities(env.DB, "testudo");
    // Both addresses are kept, one per Google identity.
    expect(identities.map((i) => [i.hd, i.sub, i.email])).toEqual([
      [
        "terpmail.umd.edu",
        ID_TOKEN_PAYLOADS.terpmail.sub,
        "testudo@terpmail.umd.edu",
      ],
      ["umd.edu", ID_TOKEN_PAYLOADS.umdEdu.sub, "testudo@umd.edu"],
    ]);
    tick(-60_000);
  });

  it("refuses a Google account already tied to another directory ID", async () => {
    await new Browser(googleEnv()).signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    const response = await new Browser(googleEnv()).signInWithGoogle({
      ...ID_TOKEN_PAYLOADS.terpmail,
      email: "someoneelse@terpmail.umd.edu",
    });
    expect(location(response).searchParams.get("error")).toBe("google-error");
  });

  it("refreshes the name and picture from Google at every sign-in", async () => {
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    const first = await browser.me();
    if (first.status !== "signed-in") throw new Error("not signed in");
    expect(first.user.avatarUrl).toMatch(
      /^\/avatars\/testudo\/[0-9a-f]{16}\.png$/,
    );

    const newPicture =
      "https://lh3.googleusercontent.com/a/ACg8ocNEWPICTURE=s96-c";
    pictures.set(newPicture, new Uint8Array([...PNG, 2, 3]));
    await browser.signInWithGoogle({
      ...ID_TOKEN_PAYLOADS.terpmail,
      name: "Testudo T. Terrapin",
      picture: newPicture,
    });
    const second = await browser.me();
    if (second.status !== "signed-in") throw new Error("not signed in");
    expect(second.user.name).toBe("Testudo T. Terrapin");
    expect(second.user.avatarUrl).not.toBe(first.user.avatarUrl);
    // Only the new copy is kept.
    const objects = await env.USER_CONTENT.list({ prefix: "avatars/testudo/" });
    expect(objects.objects.map((o) => `/${o.key}`)).toEqual([
      second.user.avatarUrl,
    ]);
    expect((await getUser(env.DB, "testudo"))?.picture_url).toBe(newPicture);
  });
});

describe("pictures", () => {
  it("serves our copy to signed-in people only", async () => {
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    const me = await browser.me();
    const avatarUrl = me.status === "signed-in" ? me.user.avatarUrl : null;
    if (!avatarUrl) throw new Error("no picture");
    const { createWorker } = await import("../worker");
    const worker = createWorker({ fetch: () => new Response("app") });
    const get = (cookie: string) =>
      worker.fetch(
        new Request(`${ORIGIN}${avatarUrl}`, { headers: { Cookie: cookie } }),
        browser.testEnv as Env,
        { waitUntil: () => {} } as unknown as ExecutionContext,
      );
    const signedIn = await get(browser.cookieHeader());
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get("Content-Type")).toBe("image/png");
    expect(signedIn.headers.get("Cache-Control")).toContain("private");
    expect(new Uint8Array(await signedIn.arrayBuffer())).toEqual(PNG);
    expect((await get("")).status).toBe(401);
  });

  it("keeps the sign-in when the picture can't be fetched", async () => {
    pictures.clear();
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    const me = await browser.me();
    expect(me).toMatchObject({
      status: "signed-in",
      user: { avatarUrl: null },
    });
  });
});

describe("sessions", () => {
  it("answers signed-out without setting a cookie", async () => {
    const browser = new Browser(googleEnv());
    const response = await browser.post("/api/me");
    expect(await response.json()).toEqual({
      status: "signed-out",
      flags: {
        signIn: true,
        chat: "off",
        reviews: "off",
        seatAlerts: false,
        push: false,
        authTestMode: false,
      },
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("refreshes daily with a new token; the old one works for a minute", async () => {
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    const first = browser.cookies.get("__Host-session");
    tick(SESSION_REFRESH_AFTER_MS);
    const refreshed = await browser.post("/api/me");
    const second = browser.cookies.get("__Host-session");
    expect(refreshed.headers.getSetCookie()).toHaveLength(1);
    expect(second).not.toBe(first);

    // A tab that still sends the old token.
    const racing = new Browser(googleEnv());
    racing.cookies.set("__Host-session", first ?? "");
    expect((await racing.me()).status).toBe("signed-in");
    tick(61_000);
    expect((await racing.me()).status).toBe("signed-out");
    expect(racing.cookies.has("__Host-session")).toBe(false);
    expect((await browser.me()).status).toBe("signed-in");
    tick(-(SESSION_REFRESH_AFTER_MS + 61_000));
  });

  it("expires 30 days after the last refresh", async () => {
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    tick(30 * 24 * 3600 * 1000);
    expect((await browser.me()).status).toBe("signed-out");
    tick(-30 * 24 * 3600 * 1000);
  });

  it("signs out: the row goes, and the session and hint cookies are cleared", async () => {
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    expect(browser.cookies.get("__Host-hint")).toBe("testudo@terpmail.umd.edu");
    const token = browser.cookies.get("__Host-session") ?? "";
    const response = await browser.post("/api/auth/sign-out", {});
    expect(await response.json()).toEqual({ status: "signed-out" });
    expect(browser.cookies.size).toBe(0);
    const reused = new Browser(googleEnv());
    reused.cookies.set("__Host-session", token);
    expect((await reused.me()).status).toBe("signed-out");
  });

  it("refuses a sign-out from another origin", async () => {
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    const response = await browser.post(
      "/api/auth/sign-out",
      {},
      { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    );
    expect(response.status).toBe(403);
    expect((await browser.me()).status).toBe("signed-in");
  });

  it("ends a browser's old session when it signs in again", async () => {
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    const old = browser.cookies.get("__Host-session") ?? "";
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    const stale = new Browser(googleEnv());
    stale.cookies.set("__Host-session", old);
    expect((await stale.me()).status).toBe("signed-out");
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM sessions").first("n"),
    ).toBe(1);
  });
});

describe("account deletion", () => {
  const WEEK = 7 * 24 * 3600 * 1000;

  it("signs out everywhere, then purges after a week", async () => {
    const laptop = new Browser(googleEnv());
    const phone = new Browser(googleEnv());
    await laptop.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    await phone.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);

    const response = await laptop.post("/api/account/delete");
    expect(await response.json()).toEqual({
      status: "deleting",
      deleteAfter: new Date(clock + WEEK).toISOString(),
    });
    expect(laptop.cookies.size).toBe(0);
    expect((await phone.me()).status).toBe("signed-out");

    const job = { env: env as Env, now: new Date(clock + WEEK - 1000) };
    await runDailyJob(job);
    expect(await getUser(env.DB, "testudo")).not.toBeNull();
    await runDailyJob({ ...job, now: new Date(clock + WEEK) });
    expect(await getUser(env.DB, "testudo")).toBeNull();
    expect(
      (await env.USER_CONTENT.list({ prefix: "avatars/testudo/" })).objects,
    ).toEqual([]);
    for (const table of ["user_identities", "sessions"])
      expect(
        await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first("n"),
      ).toBe(0);
  });

  it("is undone by signing in again within the week", async () => {
    const browser = new Browser(googleEnv());
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    await browser.post("/api/account/delete");
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    expect(await getUser(env.DB, "testudo")).toMatchObject({
      status: "active",
      delete_after: null,
    });
    await runDailyJob({ env: env as Env, now: new Date(clock + WEEK) });
    expect((await browser.me()).status).toBe("signed-in");
  });

  it("needs a session and our own origin", async () => {
    const browser = new Browser(googleEnv());
    expect((await browser.post("/api/account/delete")).status).toBe(401);
    await browser.signInWithGoogle(ID_TOKEN_PAYLOADS.terpmail);
    const crossSite = await browser.post(
      "/api/account/delete",
      {},
      { Origin: "https://evil.example" },
    );
    expect(crossSite.status).toBe(403);
    expect((await getUser(env.DB, "testudo"))?.status).toBe("active");
  });
});

describe("test mode", () => {
  const local = "http://localhost:3000";
  const testEnv = () => googleEnv({ AUTH_TEST_MODE: "true" });

  it("signs in as a fixture user with a real session", async () => {
    const browser = new Browser(testEnv(), local);
    const response = await browser.post("/api/auth/test-sign-in", {
      userId: "tadmin",
      return: "/settings",
    });
    expect(await response.json()).toEqual({
      status: "signed-in",
      return: "/settings?signed-in=1",
    });
    expect(await browser.me()).toMatchObject({
      status: "signed-in",
      flags: { signIn: true, authTestMode: true },
      user: { id: "tadmin", name: "Test Admin", isAdmin: true },
    });
  });

  it("knows only the fixture users", async () => {
    const browser = new Browser(testEnv(), local);
    const response = await browser.post("/api/auth/test-sign-in", {
      userId: "robinson",
    });
    expect(await response.json()).toEqual({ status: "unknown-user" });
  });

  it("doesn't exist on terpsicle.com, whatever the vars say", async () => {
    const browser = new Browser(testEnv());
    const response = await browser.post("/api/auth/test-sign-in", {
      userId: "tstudent",
    });
    expect(response.status).toBe(404);
    expect(browser.cookies.size).toBe(0);
  });
});

describe("requireUser and requireAdmin", () => {
  const local = "http://localhost:3000";
  const request = (browser: Browser, origin = browser.origin) =>
    new Request(`${browser.origin}/api/anything`, {
      method: "POST",
      headers: { Cookie: browser.cookieHeader(), Origin: origin },
    });

  it("401 signed out, 403 cross-origin or not an admin, the user otherwise", async () => {
    const testEnv = googleEnv({ AUTH_TEST_MODE: "true" });
    const student = new Browser(testEnv, local);
    const signedOut = await requireUser(request(student), testEnv, now());
    expect(!signedOut.ok && signedOut.response.status).toBe(401);

    await student.post("/api/auth/test-sign-in", { userId: "tstudent" });
    const user = await requireUser(request(student), testEnv, now());
    expect(user.ok && user.session.user.id).toBe("tstudent");
    const crossOrigin = await requireUser(
      request(student, "https://evil.example"),
      testEnv,
      now(),
    );
    expect(!crossOrigin.ok && crossOrigin.response.status).toBe(403);
    const notAdmin = await requireAdmin(request(student), testEnv, now());
    expect(!notAdmin.ok && notAdmin.response.status).toBe(403);

    const admin = new Browser(testEnv, local);
    await admin.post("/api/auth/test-sign-in", { userId: "tadmin" });
    const ok = await requireAdmin(request(admin), testEnv, now());
    expect(ok.ok && ok.session.user.isAdmin).toBe(true);
  });
});
