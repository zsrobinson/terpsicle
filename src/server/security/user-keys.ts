// Each account's data key (docs/DATA.md §7.7): 32 random bytes made on the
// account's first sync, wrapped (sealed) by the Worker secret USER_DATA_KEY
// and kept as one object, `keys/<userId>`, in the private R2 bucket
// USER_KEYS. Synced docs and Todo's own tasks are sealed with it, each bound
// to its row. Deleting the account deletes the object (src/server/auth/
// purge.ts), and without it nothing of theirs opens.
//
// Why R2 and not D1, beside what it seals: D1's Time Travel can put the
// whole database back as it was at any minute of the last 30 days, and R2
// keeps no earlier versions of an object, so a deleted key stays deleted
// even when the rows it sealed come back (docs/decisions.md, "Account keys
// live in R2, apart from what they seal").
//
// The server can still open what it stores (Chat reads your main plan, the
// calendar feed your plans), so this is never "end-to-end" encryption.
//
// No plaintext fallback: without the secret or the bucket every read and
// write throws UserDataKeyMissing, which the API answers as "unavailable".
// Nothing here logs a key or anything it opens.
import { z } from "zod";
import {
  DirectoryIdSchema,
  type UserDataKeyVars,
  UserDataKeyVarsSchema,
} from "~/core/schema";
import { isTestMode } from "../auth/config";
import {
  importSealKey,
  loadSealKeys,
  openBytes,
  openText,
  SEAL_KEY_ID,
  type SealKeys,
  type SealSecrets,
  sealBytes,
  sealedKeyId,
  sealText,
} from "./seal";

/** The private bucket that holds every account's wrapped key. */
export interface AccountKeyBucket {
  USER_KEYS?: R2Bucket;
}

export interface UserDataEnv extends UserDataKeyVars, AccountKeyBucket {
  DB: D1Database;
}

/**
 * Test mode's fixed key (previews, `pnpm dev:mock`, e2e): public, and its id
 * `test` never names a production key. Like Todo's test feed key, it's what
 * test mode always uses, so previews (unreviewed code, test sign-ins, their
 * own D1 and bucket) never touch USER_DATA_KEY even if they could read it.
 * Test mode on a request needs a preview or localhost host (V2.md §4.6), so
 * terpsicle.com never gets it whatever its vars say.
 */
export const TEST_USER_DATA_KEY: SealSecrets = {
  key: "dGVycHNpY2xlLXN5bmNlZC1kYXRhLXRlc3Qta2V5ISE",
  id: "test",
};

/**
 * USER_DATA_KEY is missing or malformed, or the USER_KEYS bucket isn't
 * bound: synced data can't be read or written.
 */
export class UserDataKeyMissing extends Error {
  override name = "UserDataKeyMissing";
  constructor(what = "USER_DATA_KEY isn't set") {
    super(what);
  }
}

/** A sealed value didn't open: its key is gone, or it was moved or changed. */
export class SealedDataError extends Error {
  override name = "SealedDataError";
  constructor() {
    super("a sealed value didn't open");
  }
}

const warned = { missing: false, previous: false, bucket: false };

/** Logs a misconfigured var once per isolate: names only, never a value. */
function warnOnce(which: keyof typeof warned, message: string): void {
  if (warned[which]) return;
  warned[which] = true;
  console.error({ userData: message });
}

/**
 * The keys that wrap every account's key: in test mode always the fixed
 * test key, so a preview never wraps anything with the secret even if it
 * has one; otherwise the secret, or nothing at all.
 */
export async function userDataKeys(
  env: UserDataKeyVars,
  testMode: boolean,
): Promise<SealKeys> {
  if (testMode) {
    const keys = await loadSealKeys(TEST_USER_DATA_KEY);
    // The fixed key always loads; null would mean the constant was edited.
    if (!keys) throw new UserDataKeyMissing();
    return keys;
  }
  const vars = UserDataKeyVarsSchema.parse(env);
  const keys = await loadSealKeys({
    key: vars.USER_DATA_KEY,
    id: vars.USER_DATA_KEY_ID,
    previousKey: vars.USER_DATA_KEY_PREVIOUS,
    previousId: vars.USER_DATA_KEY_PREVIOUS_ID,
  });
  if (!keys) {
    warnOnce(
      "missing",
      "USER_DATA_KEY must be 32 bytes of base64url, with USER_DATA_KEY_ID set",
    );
    throw new UserDataKeyMissing();
  }
  // A malformed previous key is left out, so what it wrapped won't open
  // until it's fixed: say so.
  if (vars.USER_DATA_KEY_PREVIOUS !== undefined && !keys.previous)
    warnOnce(
      "previous",
      "USER_DATA_KEY_PREVIOUS must be 32 bytes of base64url, with a USER_DATA_KEY_PREVIOUS_ID other than USER_DATA_KEY_ID",
    );
  return keys;
}

/** The bucket, or UserDataKeyMissing: never a key kept anywhere else. */
function keyBucket(env: AccountKeyBucket): R2Bucket {
  if (env.USER_KEYS) return env.USER_KEYS;
  warnOnce("bucket", "the R2 bucket USER_KEYS isn't bound");
  throw new UserDataKeyMissing("USER_KEYS isn't bound");
}

/**
 * Throws UserDataKeyMissing unless the bucket is bound: the purge checks
 * before it deletes anything, so it never deletes the rows and leaves a key.
 */
export function assertAccountKeyBucket(env: AccountKeyBucket): void {
  keyBucket(env);
}

/** Where every account's key lives in the bucket. */
const KEY_PREFIX = "keys/";

/**
 * The object an account's wrapped key is: `keys/<directory ID>`. An id that
 * isn't a directory ID throws, so no key lands outside `keys/` or beside
 * another's.
 */
export function accountKeyPath(userId: string): string {
  return `${KEY_PREFIX}${DirectoryIdSchema.parse(userId)}`;
}

/** One account's data key, unwrapped for this request only. */
export interface AccountKey {
  readonly userId: string;
  readonly keys: SealKeys;
}

/**
 * Synced data's keys for one request or one job run: each account's key is
 * read and unwrapped once, however many reads need it, and forgotten with
 * the request. Made by `userDataForRequest` or `userDataForJob`.
 */
export interface UserData {
  readonly db: D1Database;
  /**
   * The account's key, or null when it has none yet. With `create`, the
   * first call makes one; two first saves at once both end up with the
   * one stored.
   */
  accountKey(
    userId: string,
    options?: { create?: boolean },
  ): Promise<AccountKey | null>;
}

/** Account keys never rotate on their own: their one id. */
const ACCOUNT_KEY_ID = "acct";

/** Additional data: the parts that say where a value lives, unambiguously. */
const context = (parts: readonly string[]) => JSON.stringify(parts);
const wrapContext = (userId: string) => context(["user-key", userId]);

/** A wrapped key as stored: the sealed text, and its version's etag. */
interface StoredKey {
  wrapped: string;
  etag: string;
}

async function readStoredKey(
  bucket: R2Bucket,
  userId: string,
): Promise<StoredKey | null> {
  const object = await bucket.get(accountKeyPath(userId));
  if (!object) return null;
  return { wrapped: await object.text(), etag: object.etag };
}

/**
 * Stores a wrapped key only where the account has none, so a key is never
 * replaced by another: true when this one was. `onlyIf` takes conditional
 * request headers as well as an R2Conditional, and `If-None-Match: *` holds
 * only when no object is there
 * (https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations;
 * sealed.test.ts races two first saves through workerd's R2).
 */
async function storeIfAbsent(
  bucket: R2Bucket,
  userId: string,
  wrapped: string,
): Promise<boolean> {
  const put = await bucket.put(accountKeyPath(userId), wrapped, {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    customMetadata: masterKeyMetadata(wrapped),
  });
  return put !== null;
}

/** The wrapping key's id, kept beside the object for listing. */
const masterKeyMetadata = (wrapped: string) => ({
  masterKeyId: sealedKeyId(wrapped) ?? "",
});

// ---------- Keys kept in D1 before 2026-10-05 ----------
// Builds before then kept wrapped keys in D1's `user_keys`. A key still
// there is moved into the bucket the first time it's needed, and the daily
// job moves the rest (`moveLegacyAccountKeys`). Once no row is left, a
// migration drops the table and this goes with it.

const LegacyRowSchema = z.object({
  user_id: z.string(),
  wrapped_key: z.string().min(1),
});

/**
 * Moves one account's key from `user_keys` into the bucket, verbatim (it
 * stays wrapped the same way). The row goes only once the bucket holds that
 * same key; if the bucket already has another, the row stays and is
 * counted, never lost. What the bucket holds after is the account's key.
 *
 * If the purge deleted the row while this was storing it, and the account
 * isn't active (it's being deleted, or gone), the copy just made is deleted
 * again: a move never brings back a purged key.
 */
async function moveLegacyKey(
  bucket: R2Bucket,
  db: D1Database,
  row: z.infer<typeof LegacyRowSchema>,
): Promise<{ stored: StoredKey | null; moved: boolean }> {
  if (await storeIfAbsent(bucket, row.user_id, row.wrapped_key)) {
    const [still, active] = await db.batch([
      db
        .prepare(
          "SELECT 1 FROM user_keys WHERE user_id = ?1 AND wrapped_key = ?2",
        )
        .bind(row.user_id, row.wrapped_key),
      db
        .prepare("SELECT 1 FROM users WHERE id = ?1 AND status = 'active'")
        .bind(row.user_id),
    ]);
    // Gone from D1 and the account isn't active: the purge took the row
    // while this stored it. (Gone but active: another move got there.)
    if (!still?.results.length && !active?.results.length) {
      await bucket.delete(accountKeyPath(row.user_id));
      return { stored: null, moved: false };
    }
  }
  const stored = await readStoredKey(bucket, row.user_id);
  if (stored?.wrapped !== row.wrapped_key) return { stored, moved: false };
  await db
    .prepare("DELETE FROM user_keys WHERE user_id = ?1 AND wrapped_key = ?2")
    .bind(row.user_id, row.wrapped_key)
    .run();
  return { stored, moved: true };
}

async function legacyKey(
  bucket: R2Bucket,
  db: D1Database,
  userId: string,
): Promise<StoredKey | null> {
  const row = await db
    .prepare("SELECT user_id, wrapped_key FROM user_keys WHERE user_id = ?1")
    .bind(userId)
    .first();
  if (!row) return null;
  return (await moveLegacyKey(bucket, db, LegacyRowSchema.parse(row))).stored;
}

/**
 * The daily job's move of keys still in `user_keys` into the bucket, up to
 * `limit` a run. `left` counts the rows still there after it.
 */
export async function moveLegacyAccountKeys(
  env: UserDataEnv,
  limit = 1_000,
): Promise<{ moved: number; left: number }> {
  const bucket = keyBucket(env);
  const { results } = await env.DB.prepare(
    "SELECT user_id, wrapped_key FROM user_keys ORDER BY user_id LIMIT ?1",
  )
    .bind(limit)
    .all();
  let moved = 0;
  for (const r of results) {
    const result = await moveLegacyKey(
      bucket,
      env.DB,
      LegacyRowSchema.parse(r),
    );
    if (result.moved) moved += 1;
  }
  const left = z
    .number()
    .int()
    .parse(
      await env.DB.prepare("SELECT count(*) AS n FROM user_keys").first("n"),
    );
  return { moved, left };
}

// ---------- Reading and making keys ----------

async function loadAccountKey(
  env: UserDataEnv,
  master: SealKeys,
  userId: string,
  create: boolean,
): Promise<AccountKey | null> {
  const bucket = keyBucket(env);
  let stored =
    (await readStoredKey(bucket, userId)) ??
    (await legacyKey(bucket, env.DB, userId));
  if (!stored && create) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await sealBytes(master, wrapContext(userId), raw);
    raw.fill(0);
    // A first save racing this one may store its key between the read
    // above and this put: the put then stores nothing, and theirs is read
    // back, so both seal with the one key.
    stored = (await storeIfAbsent(bucket, userId, wrapped))
      ? { wrapped, etag: "" }
      : await readStoredKey(bucket, userId);
  }
  if (!stored) return null;
  const raw = await openBytes(master, wrapContext(userId), stored.wrapped);
  if (raw?.length !== 32) throw new SealedDataError();
  const key = await importSealKey(raw);
  raw.fill(0);
  return {
    userId,
    keys: { current: { id: ACCOUNT_KEY_ID, key }, previous: null },
  };
}

/** Synced data's keys, with test mode decided by the caller. */
export function userData(
  env: UserDataEnv,
  { testMode }: { testMode: boolean },
): UserData {
  let master: Promise<SealKeys> | null = null;
  // One read of the bucket per account per request or run, once it has a
  // key.
  const known = new Map<string, Promise<AccountKey | null>>();
  const load = (userId: string, create: boolean) => {
    master ??= userDataKeys(env, testMode);
    const loading = master.then((m) => loadAccountKey(env, m, userId, create));
    known.set(userId, loading);
    // No key yet, or a failure: ask the bucket again next time.
    loading.then(
      (key) => key ?? known.delete(userId),
      () => known.delete(userId),
    );
    return loading;
  };
  return {
    db: env.DB,
    async accountKey(userId, { create = false } = {}) {
      const key = await (known.get(userId) ?? load(userId, false));
      return key || !create ? key : load(userId, true);
    },
  };
}

/**
 * Deletes the account's key for good: R2 keeps no earlier version, so from
 * here on nothing it sealed opens, wherever a copy of the rows turns up.
 * Only the purge calls this, after the rows it sealed are gone
 * (src/server/auth/purge.ts).
 */
export async function deleteAccountKey(
  env: AccountKeyBucket,
  userId: string,
): Promise<void> {
  await keyBucket(env).delete(accountKeyPath(userId));
}

/** For a request: test mode needs the flag and a preview or localhost host. */
export function userDataForRequest(
  env: UserDataEnv,
  request: Request,
): UserData {
  return userData(env, { testMode: isTestMode(env, new URL(request.url)) });
}

/**
 * For a cron or the Chat Durable Object, which have no host to check: test
 * mode is the flag, as Todo's cron reads it, and also no USER_DATA_KEY.
 * Crons never run on previews and production never sets the flag
 * (src/server/auth/auth.test.ts); the guard is for a production Worker
 * with the flag set by mistake, which has the secret (the deploy checks)
 * and so keeps using it. `pnpm dev:mock` has the flag and no secret.
 */
export function userDataForJob(env: UserDataEnv): UserData {
  return userData(env, { testMode: jobTestMode(env) });
}

function jobTestMode(env: UserDataEnv): boolean {
  return (
    env.AUTH_TEST_MODE === "true" &&
    UserDataKeyVarsSchema.parse(env).USER_DATA_KEY === undefined
  );
}

/**
 * Seals `text` with the account's key, bound to `where` (the row's other
 * key columns, after the account's id).
 */
export function sealForAccount(
  account: AccountKey,
  where: readonly string[],
  text: string,
): Promise<string> {
  return sealText(account.keys, context([account.userId, ...where]), text);
}

/** Opens what `sealForAccount` sealed for the same `where`; throws otherwise. */
export async function openForAccount(
  account: AccountKey,
  where: readonly string[],
  sealed: string,
): Promise<string> {
  const text = await openText(
    account.keys,
    context([account.userId, ...where]),
    sealed,
  );
  if (text === null) throw new SealedDataError();
  return text;
}

const KeyMetadataSchema = z.object({ masterKeyId: z.string() });

export interface RewrapResult {
  /** Wrapped again under the current key this run. */
  moved: number;
  /** Still under the previous key: the next run goes on, or they didn't open. */
  left: number;
  /** Under a key that's neither the current nor the previous: they can't open. */
  stuck: number;
}

/** Every key object in the bucket, a page at a time, with its metadata. */
async function* keyObjects(bucket: R2Bucket): AsyncGenerator<R2Object> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix: KEY_PREFIX,
      include: ["customMetadata"],
      ...(cursor ? { cursor } : {}),
    });
    yield* page.objects;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/** The id of the key that wrapped an object, from its metadata or its text. */
async function wrappedUnder(
  bucket: R2Bucket,
  object: R2Object,
): Promise<string | null> {
  const meta = KeyMetadataSchema.safeParse(object.customMetadata);
  if (meta.success && SEAL_KEY_ID.test(meta.data.masterKeyId))
    return meta.data.masterKeyId;
  const stored = await bucket.get(object.key);
  return stored ? sealedKeyId(await stored.text()) : null;
}

/**
 * Wraps one account's key again under the current key. The put holds only
 * while the object is the version read (`If-Match`), so a key the purge
 * deleted meanwhile is never put back.
 */
async function rewrapOne(
  bucket: R2Bucket,
  master: SealKeys,
  userId: string,
): Promise<"moved" | "left" | "gone"> {
  const stored = await readStoredKey(bucket, userId);
  if (!stored) return "gone";
  const raw = await openBytes(master, wrapContext(userId), stored.wrapped);
  // Doesn't open under the key it names: left as it is, and counted.
  if (raw?.length !== 32) return "left";
  const wrapped = await sealBytes(master, wrapContext(userId), raw);
  raw.fill(0);
  const put = await bucket.put(accountKeyPath(userId), wrapped, {
    onlyIf: { etagMatches: stored.etag },
    customMetadata: masterKeyMetadata(wrapped),
  });
  if (put) return "moved";
  // Changed or deleted since the read: count it only if it's still there.
  return (await bucket.head(accountKeyPath(userId))) ? "left" : "gone";
}

/**
 * The daily job's half of a rotation: account keys still wrapped by
 * USER_DATA_KEY_PREVIOUS wrapped again by USER_DATA_KEY, up to `limit` a
 * run, so the previous can be removed once `left` is 0. It reads the whole
 * bucket's listing to count.
 */
export async function rewrapAccountKeys(
  env: UserDataEnv,
  limit = 1_000,
): Promise<RewrapResult> {
  const master = await userDataKeys(env, jobTestMode(env));
  const bucket = keyBucket(env);
  const result: RewrapResult = { moved: 0, left: 0, stuck: 0 };
  for await (const object of keyObjects(bucket)) {
    // An object whose name isn't an account's can't be a key we made.
    const userId = DirectoryIdSchema.safeParse(
      object.key.slice(KEY_PREFIX.length),
    );
    const under = userId.success ? await wrappedUnder(bucket, object) : null;
    if (under === master.current.id) continue;
    if (!userId.success || !master.previous || under !== master.previous.id) {
      result.stuck += 1;
      continue;
    }
    if (result.moved >= limit) {
      result.left += 1;
      continue;
    }
    const outcome = await rewrapOne(bucket, master, userId.data);
    if (outcome === "moved") result.moved += 1;
    else if (outcome === "left") result.left += 1;
  }
  return result;
}
