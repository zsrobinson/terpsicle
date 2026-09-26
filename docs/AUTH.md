# Accounts: Sign in with Google, UMD accounts only

How Terpsicle knows who someone is. The plan is `docs/V2.md` §4; this is how the code does it, how to set it up, and how other routes use it. Tables and cookies are in `DATA.md` §7.6.

- **Google only**, and **UMD accounts only**: the ID token's `hd` must be exactly `terpmail.umd.edu` or `umd.edu`, and `email_verified` must be `true`. No passwords, no magic links, no other providers.
- **People are their directory ID** (the email's local part): `terp@terpmail.umd.edu` and `terp@umd.edu` are one account, `users.id = 'terp'`, and both addresses are kept.
- **Names and pictures always come from Google**, refreshed at every sign-in. Nothing edits them in Terpsicle.
- **The scheduler works fully signed out.** Terpsicle sets no cookie until someone signs in.
- **No OAuth library** (`arctic`, `oslo` and `@oslojs/*` are deprecated): two `fetch`es and WebCrypto.

## Where things are

| What | Where |
|---|---|
| Claim checks, return paths, session timing, `parseAdmins`, `TEST_USERS` (pure) | `src/core/auth/` |
| Schemas: claims, `/api/me`, cookies, rows, vars | `src/core/schema/auth.ts` |
| The Google flow (`GET /api/auth/google`, `…/callback`) | `src/server/auth/flow.ts`, `google.ts`, `pkce.ts`, `cookies.ts` |
| Sessions, `getSession` | `src/server/auth/session.ts` |
| `requireUser`, `requireAdmin`, the origin check | `src/server/auth/guard.ts` |
| `me`, `auth/sign-out`, `account/delete`, `auth/test-sign-in` | `src/server/auth/api.ts`, registered in `src/server/api/router.ts` |
| Pictures (`/avatars/*`) | `src/server/auth/pictures.ts` |
| Admins | `config/admins.txt`, read by `src/server/auth/admin.ts` |
| The account purge | `src/jobs/daily.ts` (`7 13 * * *`) |
| Top bar button and menu, `/settings`, `/signin`, `/auth/test` | `src/features/auth/`, `src/routes/{settings,signin}.tsx`, `src/routes/auth/test.tsx`. On phones one top-bar button holds both the account (or Sign in) and the theme, so the plan's name keeps a tappable width. |
| Tests | `src/core/auth/*.test.ts` (golden ID-token payloads in `src/fixtures/users.ts`), `src/server/auth/auth.test.ts` (the whole flow against D1 and R2, Google's token endpoint mocked), `src/features/auth/account.test.tsx`, `e2e/auth.spec.ts` |

## Configuration

Sign-in with Google is on only when **all** of these are set. Until then `POST /api/me` says `flags.signIn: false`, the app hides every account control, and `GET /api/auth/google` lands on `/signin?error=unavailable` ("Signing in is turned off right now."). So it ships dark until the last piece is in.

| Name | Kind | Value |
|---|---|---|
| `SIGN_IN_ENABLED` | var | `"true"`; `"false"` is the off switch |
| `GOOGLE_CLIENT_ID` | var | The OAuth client's id (public) |
| `GOOGLE_REDIRECT_ORIGINS` | var | `https://terpsicle.com`; each origin's `/api/auth/google/callback` must be a registered redirect URI. A request from any other origin gets no Google sign-in. |
| `GOOGLE_CLIENT_SECRET` | secret | The OAuth client's secret |
| `AUTH_SECRET` | secret | 32 random bytes, base64url. Signs the `__Host-oauth` cookie. |
| `USER_CONTENT` | R2 binding | `terpsicle-user-content` (previews: `terpsicle-user-content-preview`) |
| `AUTH_TEST_MODE` | var, previews only | `"true"` (see "Test mode") |

Admins are not configuration: see "Admins".

## Google Cloud setup (the owner)

Done once, in the [Google Cloud console](https://console.cloud.google.com/), in a project named "Terpsicle" (STATUS.md records what's done):

1. **Google Auth Platform → Branding.** App name "Terpsicle"; a user support email; the logo; home page `https://terpsicle.com`; privacy policy `https://terpsicle.com/privacy`; authorized domain `terpsicle.com` (verify it in [Search Console](https://search.google.com/search-console) first); a developer contact email.
2. **Audience.** User type **External**, then **Publish app** (In production). While it's in Testing, only 100 listed test users can sign in.
3. **Data access.** Add the scopes `openid`, `email` and `profile`. All three are non-sensitive, so there's no scope review.
4. **Clients → Create client → Web application**, named "Terpsicle":
   - Authorized JavaScript origins: `https://terpsicle.com` and `http://localhost:3000`;
   - Authorized redirect URIs, exactly: `https://terpsicle.com/api/auth/google/callback` and `http://localhost:3000/api/auth/google/callback`;
   - no preview URIs: Google allows no wildcards, and previews use test mode.
5. **Hand over the client id** (it goes in `wrangler.jsonc`, `vars.GOOGLE_CLIENT_ID`) and set the secrets yourself:
   ```sh
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' | pnpm exec wrangler secret put AUTH_SECRET
   ```
6. **Brand verification** (Google Auth Platform → Verification Center), so the consent screen shows the name and logo. It needs `/privacy` live. Google says the automated review usually takes minutes and a manual one 2–3 business days.
7. **Try it** with a `@terpmail.umd.edu` and a `@umd.edu` account. Both should land on the same account (Settings shows one directory ID). This also confirms the real `hd` values, which the research couldn't check for TERPmail.
8. If UMD's Workspace blocks the app for someone (for example users designated under 18), ask DIT to mark "Terpsicle" as a trusted or limited (sign-in only) app. Google shows its own error before our callback in that case; `/signin` says "If Google says your organization blocked Terpsicle, UMD's Google settings stopped it."

**Local dev with real Google:** put the secrets in `.dev.vars` (git-ignored) and run `pnpm dev` on port 3000:
```sh
GOOGLE_CLIENT_SECRET=…
AUTH_SECRET=…
GOOGLE_REDIRECT_ORIGINS=http://localhost:3000
```
`GOOGLE_CLIENT_ID` comes from `wrangler.jsonc`. Browsers accept `Secure` and `__Host-` cookies on `http://localhost`, so everything is the same as production.

## The flow

**`GET /api/auth/google?return=<path>`** (a navigation, never fetched):
1. `return` must be a same-origin path (starts with `/`, not `//`, no backslash or control characters, at most 512 characters, not `/api` or `/avatars`); otherwise `/schedule`. So it's never an open redirect.
2. Rate limit: 30 per IP per hour (keyed HMAC of the IP).
3. `state`, `nonce` and the PKCE `code_verifier` are 32 random bytes each; `code_challenge = base64url(SHA-256(verifier))`.
4. They go in `__Host-oauth` = `base64url(JSON {state, nonce, verifier, return, exp})` + `.` + `base64url(HMAC-SHA-256(AUTH_SECRET, payload))`, for 10 minutes. `SameSite=Lax`, because the callback is a top-level GET from accounts.google.com.
5. `302` to `https://accounts.google.com/o/oauth2/v2/auth` with `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256`, and the account chooser's hints:
   - **`hd=*`** shows only Workspace (school or work) accounts, hiding personal Gmail. `hd` takes one domain or `*`, and we accept two, so it's `*`;
   - **`prompt=select_account`** always shows the chooser, so someone signed in to a personal account can pick their UMD one;
   - **`login_hint`**, when this browser signed in before: the address in the `__Host-hint` cookie. A cookie, not a URL parameter, so the address never lands in a URL or a request log; it's removed at sign-out.

   These are hints only ("client-side requests can be modified"). The claim checks are what count.

**`GET /api/auth/google/callback?code&state`** (or `?error=…`):
1. Read, verify (signature and `exp`) and clear `__Host-oauth`. Missing or bad → `/signin?error=expired`. `error=access_denied` → `/signin?error=cancelled`; any other error → `google-error`.
2. `state` must equal the cookie's (constant-time).
3. `POST https://oauth2.googleapis.com/token` with `code`, `client_id`, `client_secret`, `redirect_uri`, `grant_type=authorization_code` and `code_verifier`. Non-2xx → `google-error`. Only the status is logged, never the body (it can echo the code).
4. Decode the `id_token`'s payload. No signature or JWKS check: the token came straight from Google's token endpoint over TLS, authenticated with our client secret, which [Google documents](https://developers.google.com/identity/openid-connect/openid-connect) as enough.
5. The claim checks (`checkGoogleClaims` in `src/core/auth/claims.ts`):

   | Claim | Rule | Error |
   |---|---|---|
   | `iss` | `https://accounts.google.com` or `accounts.google.com` | `google-error` |
   | `aud` | exactly `GOOGLE_CLIENT_ID` (a one-item array is fine) | `google-error` |
   | `exp`, `iat` | `exp > now − 60 s`, `iat < now + 300 s` | `expired` |
   | `nonce` | equals the flow cookie's | `expired` |
   | `hd` | present, and exactly `terpmail.umd.edu` or `umd.edu` | missing: `personal-account`; other: `other-domain` |
   | `email_verified` | `=== true` | `unverified-email` |
   | `email` | lowercased, and its domain is `hd` | `other-domain` |
   | local part | `^[a-z0-9]{2,16}$`: the directory ID | `other-domain` |
   | `name`, `picture` | optional; the name falls back to `given_name family_name`, then the directory ID; only `https://…googleusercontent.com` pictures | — |

   **Why `hd`, not the email's suffix:** Google is authoritative for a non-Gmail address only "when email_verified is true and hd is set"; otherwise "ownership of the third party email account may have since changed" ([Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)). Someone can make a consumer Google account with a UMD address as its login; that token has no `hd` and is refused as a personal account.
6. Upsert the user by directory ID and the identity by `sub`, refreshing the name, picture URL and email. A `sub` already tied to another directory ID is refused (`google-error`). Signing in cancels a pending deletion.
7. Refresh the picture (see "Pictures"), end any session this browser already had (no fixation), mint a new one, set `__Host-session` and `__Host-hint`, and `303` to `return` with `?signed-in=1`. The app strips that and counts the sign-in.

**Errors land on `/signin?error=<code>&return=<path>`** with plain words (`signInErrorMessage`), another "Sign in with Google" and "Back to Terpsicle":
- `personal-account`: "That's a personal Google account. Choose your @terpmail.umd.edu or @umd.edu account."
- `other-domain`: "Terpsicle is for UMD accounts. Choose your @terpmail.umd.edu or @umd.edu account."
- `unverified-email`: "Google hasn't verified that email address yet. Try again once it's verified."
- `cancelled`: "You cancelled signing in. Your plans are still here."
- `expired`: "That sign-in took too long. Try again."
- `google-error`: "Google didn't finish signing you in. Try again in a minute."
- `unavailable`: "Signing in is turned off right now."
- `rate-limited`: "Too many sign-ins from this network. Wait a few minutes, then try again."

## Sessions

- `__Host-session=<32 random bytes, base64url>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`. D1 keeps only its SHA-256.
- **30 days after the last refresh.** A session last seen more than a day ago is refreshed by `POST /api/me` (every app load) or any route with `auth`: a new token and 30 more days. The old token keeps working for one more minute, so a second tab that sent it a moment earlier isn't signed out, and a compare-and-swap on `last_seen_at` means only one request refreshes. At most one write a day per session.
- A deleted account's sessions stop working at once (`getSession` joins `users` with `status = 'active'`).
- Sign-out deletes the row and clears the cookie. The daily job deletes expired rows.

## Using identity in other routes

Chat, reviews, sync and admin build on this. **Only the route table's `auth` field and `src/server/auth` read the session cookie** (CLAUDE.md).

**JSON routes** (`POST /api/<name>` in `src/server/api/router.ts`): declare `auth`, and the router does the rest.

```ts
"sync/push": route({
  input: SyncPushInputSchema,
  perIpPerHour: 1_200,
  alerts: false,
  auth: "user", // or "admin"
  handle: async (env, input, ctx) => {
    // The router guarantees a session for "user" and "admin" routes.
    const user = ctx.session?.user;
    if (!user) return apiError("unauthorized");
    // user.id is the directory ID: users.id.
  },
}),
```

For `auth: "user"` and `"admin"`, the router refuses a request whose `Origin` isn't its own origin (or whose `Sec-Fetch-Site` isn't `same-origin`) with `403 forbidden`, one without a session with `401 unauthorized`, and a non-admin on an admin route with `403 forbidden`. It refreshes the session and sends the new cookie with your response. A handler may return a plain value (sent as JSON) or a `Response` (to set its own headers).

**Anything else** (a WebSocket upgrade, a Worker route outside the table):

```ts
import { requireAdmin, requireUser } from "~/server/auth/guard";

const auth = await requireUser(request, env, now);
if (!auth.ok) return auth.response; // 403 wrong origin, 401 signed out
const { user } = auth.session;        // requireAdmin: also 403 for non-admins
```

These never refresh sessions or set cookies. For a GET that only reads (like `/avatars/*`, which an `<img>` loads without an `Origin` header), call `getSession(request, env, now)` from `src/server/auth/session.ts`.

**What you get** (`AuthUser`): `id` (the directory ID), `email` and `hd` (the address used last), `name`, `avatarUrl` (our cached copy, or null), `isAdmin`, `createdAt`, `chatBlockedUntil`, `reviewsBlockedUntil`.

**Rules for your tables and code:**
- Reference `users (id) ON DELETE CASCADE`, so the purge takes your rows with it. If your data can't just go (reviews stay up without a name), add your step to the purge in `src/jobs/daily.ts`.
- Show the stored name and picture, never your own copy: they change when the person signs in again.
- Never log, track or put in an event a name, email, directory ID, token, cookie or `sub`. Log check names and statuses only.
- A reviewer's identity never reaches readers, moderation or the admin view (V2.md §7.5).

## Admins

`config/admins.txt`, tracked in git: one directory ID per line, blank lines and `#` comments allowed, trimmed and lowercased. The owner, `robinson`, is first. It's bundled into the Worker (`~/config/admins.txt?raw`) and parsed by `parseAdmins`, which throws on a line that isn't a directory ID, so a typo fails the tests (`src/server/auth/auth.test.ts` parses the real file) and the Worker's startup instead of quietly leaving someone out. Changing admins is a reviewed commit and a deploy.

`isAdmin(userId, {authTestMode})` in `src/server/auth/admin.ts` is the only check: the id is in the file, or, in test mode only, the user is the fixture `tadmin`. `/api/me` tells the app (`user.isAdmin`), and the account menu shows "Admin" (`/admin`) to admins.

## Pictures

Our own copy, never a hot link to Google:
- Hot-linking `lh3.googleusercontent.com` would let Google see every viewer's IP each time a picture shows (Chat shows many), and breaks when Google's URL changes.
- A same-origin copy keeps the CSP at `img-src 'self'` (V2.md §12) with no Google host.

At sign-in, when Google's picture URL changed (or there's no copy yet), the Worker fetches it at 96 px (`=s96-c`), checks it's JPEG, PNG or WebP under 200 KB, and puts it in R2 `USER_CONTENT` at `avatars/<userId>/<hash16>.<ext>`; `users.picture_key` points at it and the old object is deleted. A failure keeps the last copy, or none; the app shows initials then. `/avatars/<userId>/<hash16>.<ext>` serves it only to signed-in people, `private, max-age=86400, immutable`. Account deletion removes the objects.

## Test mode (PR previews, `pnpm dev:mock`, e2e)

Google forbids wildcard redirect URIs, and previews live at `pr-<n>-terpsicle.zsrobinson.workers.dev`, so **previews never use Google.** They use a fixed test mode:
- `AUTH_TEST_MODE: "true"` is in `wrangler.jsonc`'s `previews.vars`, and `vite.config.ts` sets it for `pnpm dev:mock` (so e2e). A worker test checks production's `vars` never set it.
- It's on only with the flag **and** a preview or localhost host. On `terpsicle.com` it's off whatever the vars say, and `auth/test-sign-in` answers 404 there.
- "Sign in" says "Sign in (test mode)" and leads to `/auth/test`, which lists `TEST_USERS` (`tstudent` "Test Student", `tclassmate` "Test Classmate", `tadmin` "Test Admin", the admin). Choosing one calls `POST /api/auth/test-sign-in {userId, return}`, which signs in through the same `signIn` as Google: sessions, `/api/me` and everything after are the real code.
- What test mode skips (Google's redirect and token exchange) is covered by `src/server/auth/auth.test.ts`, which runs the whole callback against a mocked token endpoint, and by trying it on localhost and production.

**Why not a broker on terpsicle.com** (the callback on terpsicle.com hands a one-time code to the preview): previews run unreviewed PR code, so a broker would hand real Google identities (names, emails, pictures) to any PR, and add a production endpoint that trusts `*.workers.dev`; previews have their own D1, so it would also need a server-to-server redemption API; and CI needs a deterministic sign-in anyway (V2.md §4.6).

**Why not Cloudflare's version preview URLs** (`wrangler versions upload --preview-alias`), whose versions share the Worker's secrets: a version runs with the Worker's own bindings, so a preview would read and write **production D1** (and the production `USER_CONTENT` bucket), which previews must never touch. And sharing `GOOGLE_CLIENT_SECRET` wouldn't help: Google still only redirects to registered URIs, and every alias host would need registering by hand. Workers Previews (`wrangler preview`, their own D1 and bucket) plus test mode keep production data out of reach.

## Signing out and deleting an account

- **Sign out** (`POST /api/auth/sign-out`) deletes this device's session and clears `__Host-session` and `__Host-hint`. Plans stay on the device. It needs our own origin, not a live session, so a stale cookie can always be cleared. "Sign out and remove plans from this device" arrives with plan sync.
- **Delete account** (`POST /api/account/delete`, `/settings`): no confirmation dialog (DESIGN §5). It sets `status = 'deleting'` and `delete_after` a week out, ends every session, and signs out. Settings says "Your account will be deleted on Saturday, October 3. Sign in before then to keep it." The toast's **Undo** signs back in, which cancels the deletion. The daily job purges accounts past `delete_after`: their pictures, then `users` (identities and sessions go with it). Later PRs add their own data to the purge (V2.md §4.7).

## Analytics and privacy

PostHog stays anonymous (`docs/ANALYTICS.md`): never `identify()`, and no user id, directory ID, name, email or `sub` in any event. Client events: `signin_started {from}`, `signin_completed {firstOnDevice}`, `signin_failed {reason}`, `signed_out {removedLocal}`, `account_deletion_requested`. Server: `signin_result {outcome, hd}`. Names, emails and avatars in the UI carry `data-private`, so session recordings mask them.
