import { z } from "zod";
import { DirectoryIdSchema, IsoDateTimeSchema } from "./primitives";

// Identity: Sign in with Google, UMD accounts only (docs/V2.md §4,
// docs/AUTH.md). The claim checks are in ~/core/auth; this file is the data
// contract: what crosses the network, the cookies, D1 and the Worker's vars.

/** The two Google Workspace tenants UMD runs. `hd` must be exactly one. */
export const UMD_DOMAINS = ["terpmail.umd.edu", "umd.edu"] as const;
export const UmdDomainSchema = z.enum(UMD_DOMAINS);
export type UmdDomain = z.infer<typeof UmdDomainSchema>;

/**
 * `terp@terpmail.umd.edu` or `terp@umd.edu` → `{email, directoryId, domain}`.
 * Trimmed and lowercased first; anything else fails.
 */
export const UmdEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((email, ctx) => {
    const at = email.lastIndexOf("@");
    const domain = UmdDomainSchema.safeParse(email.slice(at + 1));
    const directoryId = DirectoryIdSchema.safeParse(email.slice(0, at));
    if (at <= 0 || !domain.success || !directoryId.success) {
      ctx.addIssue({ code: "custom", message: "Expected a UMD address" });
      return z.NEVER;
    }
    return { email, directoryId: directoryId.data, domain: domain.data };
  });
export type UmdEmail = z.output<typeof UmdEmailSchema>;

/**
 * The claims we read from a Google ID token. Loose on purpose (Google adds
 * claims over time); every check that matters is `checkGoogleClaims`.
 */
export const GoogleIdClaimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  azp: z.string().optional(),
  sub: z.string().min(1).max(255),
  exp: z.number(),
  iat: z.number(),
  nonce: z.string().optional(),
  hd: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  at_hash: z.string().optional(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  picture: z.string().optional(),
});
export type GoogleIdClaims = z.infer<typeof GoogleIdClaimsSchema>;

/** Google profile pictures only (`lh3.googleusercontent.com` and kin). */
export const PictureUrlSchema = z
  .url({ protocol: /^https$/, hostname: /\.googleusercontent\.com$/ })
  .max(2048);

/** A person's display name, as Google gives it (never blank). */
export const DisplayNameSchema = z.string().trim().min(1).max(200);

/** Who signed in, once the claims pass: what we store about a person. */
export const IdentitySchema = z.strictObject({
  directoryId: DirectoryIdSchema,
  email: z.string().max(254),
  hd: UmdDomainSchema,
  name: DisplayNameSchema,
  pictureUrl: PictureUrlSchema.nullable(),
  /** Google's subject; null for test-mode users (V2.md §4.6). */
  sub: z.string().min(1).max(255).nullable(),
});
export type Identity = z.infer<typeof IdentitySchema>;

/**
 * Why a sign-in didn't finish: `/signin?error=<code>`. The words are
 * `signInErrorMessage` in ~/core/auth.
 */
export const SignInErrorSchema = z.enum([
  /** A personal Google account (no `hd`). */
  "personal-account",
  /** Another Workspace, or a UMD address that isn't a directory ID. */
  "other-domain",
  /** Google says the address isn't verified. */
  "unverified-email",
  /** They chose Cancel at Google. */
  "cancelled",
  /** The sign-in took too long, or came back to another browser. */
  "expired",
  /** Google answered with an error, or a token that failed our checks. */
  "google-error",
  /** Signing in is off or not set up here. */
  "unavailable",
  /** Too many sign-ins from this network. */
  "rate-limited",
]);
export type SignInError = z.infer<typeof SignInErrorSchema>;

/** `/signin?error=…&return=…`, and `?signed-in=1` after a sign-in. */
export const SIGNIN_PATH = "/signin";
export const SIGNIN_ERROR_PARAM = "error";
export const RETURN_PARAM = "return";
export const SIGNED_IN_PARAM = "signed-in";

/** The browser-side start of a sign-in: a navigation, never fetched. */
export const SIGN_IN_START_PATH = "/api/auth/google";
/** Google's redirect URI path (the owner registered exactly this). */
export const SIGN_IN_CALLBACK_PATH = "/api/auth/google/callback";
/** Test mode's stand-in for Google: pick a TEST_USERS person (V2.md §4.6). */
export const TEST_SIGN_IN_PATH = "/auth/test";

// ---------- POST /api/me ----------

/** A product's switch: hidden, read-only, or fully on (V2.md §13). */
export const FeatureLevelSchema = z.enum(["off", "read", "on"]);
export type FeatureLevel = z.infer<typeof FeatureLevelSchema>;

/** What's on here, so the app shows only what works (V2.md §4.9). */
export const FlagsSchema = z.object({
  /** Signing in is available (Google configured, or test mode). */
  signIn: z.boolean(),
  chat: FeatureLevelSchema,
  reviews: FeatureLevelSchema,
  seatAlerts: z.boolean(),
  push: z.boolean(),
  /** Terpsicle Todo works here (TODO_ENABLED, and the feed key or test mode). */
  todo: z.boolean(),
  /** Test mode: Sign in goes to /auth/test's fixture people, not Google. */
  authTestMode: z.boolean(),
});
export type Flags = z.infer<typeof FlagsSchema>;

/** The product switches' vars (V2.md §13); each PR that adds one sets it. */
export const FeatureVarsSchema = z.object({
  CHAT_ENABLED: FeatureLevelSchema.catch("off"),
  REVIEWS_ENABLED: FeatureLevelSchema.catch("off"),
  PUSH_ENABLED: z
    .string()
    .optional()
    .catch(undefined)
    .transform((value) => value === "true"),
});

/**
 * Our cached copy of someone's Google picture: same-origin, named by its
 * content, served only to signed-in people (docs/AUTH.md, "Pictures").
 */
export const AvatarUrlSchema = z
  .string()
  .regex(/^\/avatars\/[a-z0-9]{2,16}\/[0-9a-f]{16}\.(jpg|png|webp)$/);

export const MeUserSchema = z.object({
  /** The directory ID. */
  id: DirectoryIdSchema,
  name: DisplayNameSchema,
  email: z.string(),
  /** Our cached copy of the Google picture; null shows initials. */
  avatarUrl: AvatarUrlSchema.nullable(),
  isAdmin: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type MeUser = z.infer<typeof MeUserSchema>;

export const MeInputSchema = z.strictObject({});

export const MeResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("signed-out"), flags: FlagsSchema }),
  z.object({
    status: z.literal("signed-in"),
    flags: FlagsSchema,
    user: MeUserSchema,
    /** The VAPID public key, once push lands (V2.md §6.4). */
    pushPublicKey: z.string().nullable(),
  }),
]);
export type MeResult = z.infer<typeof MeResultSchema>;

// ---------- POST /api/auth/sign-out ----------

export const SignOutInputSchema = z.strictObject({
  /** "Sign out and remove plans from this device" (the app does the removing). */
  removeLocal: z.boolean().optional(),
});
export const SignOutResultSchema = z.object({
  status: z.literal("signed-out"),
});

// ---------- POST /api/account/delete ----------

export const AccountDeleteInputSchema = z.strictObject({});
export const AccountDeleteResultSchema = z.object({
  status: z.literal("deleting"),
  /** Signing in before this keeps the account. */
  deleteAfter: IsoDateTimeSchema,
});
export type AccountDeleteResult = z.infer<typeof AccountDeleteResultSchema>;

// ---------- POST /api/auth/test-sign-in (test mode only) ----------

export const TestSignInInputSchema = z.strictObject({
  userId: DirectoryIdSchema,
  return: z.string().max(512).optional(),
});
export const TestSignInResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("signed-in"), return: z.string() }),
  z.object({ status: z.literal("unknown-user") }),
]);
export type TestSignInResult = z.infer<typeof TestSignInResultSchema>;

// ---------- Cookies ----------

/**
 * The `__Host-oauth` cookie between the start and the callback: base64url
 * JSON, then `.` and its HMAC under AUTH_SECRET (V2.md §4.2).
 */
export const OAuthFlowSchema = z.strictObject({
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  return: z.string().max(512),
  /** Seconds since the epoch. */
  exp: z.number().int(),
});
export type OAuthFlow = z.infer<typeof OAuthFlowSchema>;

// ---------- D1 rows (migrations/0003_identity.sql) ----------

export const UserStatusSchema = z.enum(["active", "deleting"]);

export const UserRowSchema = z.object({
  id: DirectoryIdSchema,
  email: z.string(),
  hd: UmdDomainSchema,
  name: DisplayNameSchema,
  picture_url: z.string().nullable(),
  picture_key: z.string().nullable(),
  status: UserStatusSchema,
  delete_after: IsoDateTimeSchema.nullable(),
  chat_blocked_until: IsoDateTimeSchema.nullable(),
  reviews_blocked_until: IsoDateTimeSchema.nullable(),
  created_at: IsoDateTimeSchema,
  last_sign_in_at: IsoDateTimeSchema,
});
export type UserRow = z.infer<typeof UserRowSchema>;

export const UserIdentityRowSchema = z.object({
  provider: z.literal("google"),
  sub: z.string(),
  hd: UmdDomainSchema,
  email: z.string(),
  user_id: DirectoryIdSchema,
  created_at: IsoDateTimeSchema,
});
export type UserIdentityRow = z.infer<typeof UserIdentityRowSchema>;

export const SessionRowSchema = z.object({
  id_hash: z.string().regex(/^[0-9a-f]{64}$/),
  user_id: DirectoryIdSchema,
  created_at: IsoDateTimeSchema,
  last_seen_at: IsoDateTimeSchema,
  expires_at: IsoDateTimeSchema,
});
export type SessionRow = z.infer<typeof SessionRowSchema>;

/** Picture types we cache and serve, with their extensions (never SVG). */
export const AVATAR_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export const AvatarContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export type AvatarContentType = z.infer<typeof AvatarContentTypeSchema>;

/** `avatars/<userId>/<hash16>.<ext>`: an R2 USER_CONTENT key, and its URL. */
export const AvatarKeySchema = z
  .string()
  .regex(/^avatars\/[a-z0-9]{2,16}\/[0-9a-f]{16}\.(jpg|png|webp)$/);

// ---------- Worker configuration ----------

/** Blank means unset, so `"GOOGLE_CLIENT_ID": ""` in wrangler.jsonc ships dark. */
const optionalVar = z
  .string()
  .optional()
  .catch(undefined)
  .transform((value) => value?.trim() || undefined);

/**
 * The Worker's identity settings (docs/AUTH.md, "Configuration"), read from
 * its `env`; other bindings are ignored.
 */
export const AuthVarsSchema = z.object({
  /** "true" allows real Google sign-in (with everything below set). */
  SIGN_IN_ENABLED: optionalVar,
  /** The OAuth client's id (a var). */
  GOOGLE_CLIENT_ID: optionalVar,
  /** The OAuth client's secret (a secret). */
  GOOGLE_CLIENT_SECRET: optionalVar,
  /** Comma-separated origins Google may redirect to: our callback's hosts. */
  GOOGLE_REDIRECT_ORIGINS: optionalVar,
  /** Signs the `__Host-oauth` cookie (a secret: 32 random bytes, base64url). */
  AUTH_SECRET: optionalVar,
  /** Comma-separated directory IDs that get isAdmin (a secret in production). */
  ADMIN_DIRECTORY_IDS: optionalVar,
  /** "true" turns on test mode, on previews and localhost only (V2.md §4.6). */
  AUTH_TEST_MODE: optionalVar,
});
export type AuthVars = z.infer<typeof AuthVarsSchema>;

/** Google's token endpoint answer: we only need the ID token. */
export const GoogleTokenResponseSchema = z.object({
  id_token: z.string().min(1).max(8192),
});
