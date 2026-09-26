// Google's side of the authorization-code flow: two URLs and one fetch
// (developers.google.com/identity/openid-connect/openid-connect). No OAuth
// library: arctic, oslo and @oslojs are deprecated (docs/AUTH.md).
import { decodeJwtPayload } from "~/core/auth";
import { GoogleTokenResponseSchema } from "~/core/schema";

export const GOOGLE_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** openid for the ID token, email for the address, profile for name and picture. */
export const GOOGLE_SCOPES = "openid email profile";

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  /** The address this browser last signed in with, if we know it. */
  loginHint?: string | undefined;
}

/**
 * Where the browser goes to sign in. The account chooser gets hints only;
 * the claim checks are what count ("client-side requests can be modified"):
 * - `hd=*` shows only Workspace (school or work) accounts, hiding personal
 *   Gmail. `hd` takes one domain or `*`, and we accept two, so `*` it is;
 * - `prompt=select_account` always shows the chooser, so someone signed in
 *   to a personal account can pick their UMD one;
 * - `login_hint` preselects the UMD address this browser last used.
 */
export function googleAuthorizeUrl(
  params: AuthorizeParams,
  base = GOOGLE_AUTHORIZE_URL,
): string {
  const url = new URL(base);
  url.search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    hd: "*",
    ...(params.loginHint ? { login_hint: params.loginHint } : {}),
  }).toString();
  return url.toString();
}

export interface TokenExchange {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export type ExchangeResult =
  | { ok: true; claims: unknown }
  | { ok: false; status: number | "network" | "bad-response" };

/**
 * Trades the code for tokens and returns the ID token's claims (unchecked:
 * that's `checkIdTokenClaims`). The access token is dropped unused.
 */
export async function exchangeCode(
  exchange: TokenExchange,
  fetcher: typeof fetch,
): Promise<ExchangeResult> {
  let response: Response;
  try {
    response = await fetcher(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: exchange.code,
        code_verifier: exchange.codeVerifier,
        client_id: exchange.clientId,
        client_secret: exchange.clientSecret,
        redirect_uri: exchange.redirectUri,
      }).toString(),
    });
  } catch {
    return { ok: false, status: "network" };
  }
  if (!response.ok) return { ok: false, status: response.status };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: "bad-response" };
  }
  const parsed = GoogleTokenResponseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: "bad-response" };
  const claims = decodeJwtPayload(parsed.data.id_token);
  return claims === null
    ? { ok: false, status: "bad-response" }
    : { ok: true, claims };
}
