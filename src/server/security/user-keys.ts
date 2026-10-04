// Each account's data key (docs/DATA.md §7.7): 32 random bytes made on the
// account's first sync, kept in `user_keys` wrapped (sealed) by the Worker
// secret USER_DATA_KEY. Synced docs and Todo's own tasks are sealed with it,
// each bound to its row. Deleting the account deletes the key first
// (src/server/auth/purge.ts), and without it nothing of theirs opens.
//
// The server can still open what it stores (Chat reads your main plan, the
// calendar feed your plans), so this is never "end-to-end" encryption.
//
// No plaintext fallback: without the secret every read and write throws
// UserDataKeyMissing, which the API answers as "unavailable". Nothing here
// logs a key or anything it opens.
import { z } from "zod";
import { type UserDataKeyVars, UserDataKeyVarsSchema } from "~/core/schema";
import { isTestMode } from "../auth/config";
import {
  importSealKey,
  loadSealKeys,
  openBytes,
  openText,
  type SealKeys,
  type SealSecrets,
  sealBytes,
  sealText,
} from "./seal";

export interface UserDataEnv extends UserDataKeyVars {
  DB: D1Database;
}

/**
 * Test mode's fixed key (previews, `pnpm dev:mock`, e2e): public, and its id
 * `test` never names a production row. It's used only in test mode (V2.md
 * §4.6) and only while USER_DATA_KEY isn't set, so production, which sets
 * the secret, never falls back to it whatever its vars say.
 */
export const TEST_USER_DATA_KEY: SealSecrets = {
  key: "dGVycHNpY2xlLXN5bmNlZC1kYXRhLXRlc3Qta2V5ISE",
  id: "test",
};

/** USER_DATA_KEY is missing or malformed: synced data can't be read or written. */
export class UserDataKeyMissing extends Error {
  override name = "UserDataKeyMissing";
  constructor() {
    super("USER_DATA_KEY isn't set");
  }
}

/** A sealed value didn't open: its key is gone, or it was moved or changed. */
export class SealedDataError extends Error {
  override name = "SealedDataError";
  constructor() {
    super("a sealed value didn't open");
  }
}

const warned = { missing: false, previous: false };

/** Logs a misconfigured var once per isolate: names only, never a value. */
function warnOnce(which: keyof typeof warned, message: string): void {
  if (warned[which]) return;
  warned[which] = true;
  console.error({ userData: message });
}

/**
 * The keys that wrap every account's key: the fixed test key only in test
 * mode with no USER_DATA_KEY set; otherwise the secret, or nothing at all.
 */
export async function userDataKeys(
  env: UserDataKeyVars,
  testMode: boolean,
): Promise<SealKeys> {
  const vars = UserDataKeyVarsSchema.parse(env);
  const keys = await loadSealKeys(
    testMode && vars.USER_DATA_KEY === undefined
      ? TEST_USER_DATA_KEY
      : {
          key: vars.USER_DATA_KEY,
          id: vars.USER_DATA_KEY_ID,
          previousKey: vars.USER_DATA_KEY_PREVIOUS,
          previousId: vars.USER_DATA_KEY_PREVIOUS_ID,
        },
  );
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

const KeyRowSchema = z.object({
  wrapped_key: z.string().min(1),
  master_key_id: z.string(),
});

async function loadAccountKey(
  db: D1Database,
  master: SealKeys,
  userId: string,
  create: boolean,
): Promise<AccountKey | null> {
  const select = db
    .prepare(
      "SELECT wrapped_key, master_key_id FROM user_keys WHERE user_id = ?1",
    )
    .bind(userId);
  let row: unknown = await select.first();
  if (!row && create) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await sealBytes(master, wrapContext(userId), raw);
    raw.fill(0);
    // A first save racing this one may insert between the read above and
    // this batch: DO NOTHING keeps theirs, and the select reads it back.
    const [, stored] = await db.batch([
      db
        .prepare(
          `INSERT INTO user_keys (user_id, wrapped_key, master_key_id)
           VALUES (?1, ?2, ?3) ON CONFLICT (user_id) DO NOTHING`,
        )
        .bind(userId, wrapped, master.current.id),
      select,
    ]);
    row = stored?.results[0] ?? null;
  }
  if (!row) return null;
  const raw = await openBytes(
    master,
    wrapContext(userId),
    KeyRowSchema.parse(row).wrapped_key,
  );
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
  const known = new Map<string, Promise<AccountKey | null>>();
  const load = (userId: string, create: boolean) => {
    master ??= userDataKeys(env, testMode);
    const loading = master.then((m) =>
      loadAccountKey(env.DB, m, userId, create),
    );
    known.set(userId, loading);
    // No key yet, or a failure: ask D1 again next time.
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

/** For a request: test mode needs the flag and a preview or localhost host. */
export function userDataForRequest(
  env: UserDataEnv,
  request: Request,
): UserData {
  return userData(env, { testMode: isTestMode(env, new URL(request.url)) });
}

/**
 * For a cron or a Durable Object, which have no host: test mode is the flag
 * alone, as Todo's cron reads it. Production never sets it
 * (src/server/auth/auth.test.ts), and its USER_DATA_KEY wins anyway.
 */
export function userDataForJob(env: UserDataEnv): UserData {
  return userData(env, { testMode: env.AUTH_TEST_MODE === "true" });
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

const RewrapRowSchema = z.object({
  user_id: z.string(),
  wrapped_key: z.string(),
});
const CountSchema = z.object({ n: z.number().int().min(0) });

export interface RewrapResult {
  /** Wrapped again under the current key this run. */
  moved: number;
  /** Still under the previous key: the next run goes on, or they didn't open. */
  left: number;
  /** Under a key that's neither the current nor the previous: they can't open. */
  stuck: number;
}

/**
 * The daily job's half of a rotation: account keys still wrapped by
 * USER_DATA_KEY_PREVIOUS wrapped again by USER_DATA_KEY, so the previous
 * can be removed once `left` is 0.
 */
export async function rewrapAccountKeys(
  env: UserDataEnv,
  limit = 1_000,
): Promise<RewrapResult> {
  const master = await userDataKeys(env, env.AUTH_TEST_MODE === "true");
  const count = async (where: string, ...ids: (string | null)[]) =>
    CountSchema.parse(
      await env.DB.prepare(`SELECT count(*) AS n FROM user_keys WHERE ${where}`)
        .bind(...ids)
        .first(),
    ).n;
  const stuck = await count(
    "master_key_id != ?1 AND master_key_id IS NOT ?2",
    master.current.id,
    master.previous?.id ?? null,
  );
  if (!master.previous) return { moved: 0, left: 0, stuck };
  const { results } = await env.DB.prepare(
    "SELECT user_id, wrapped_key FROM user_keys WHERE master_key_id = ?1 LIMIT ?2",
  )
    .bind(master.previous.id, limit)
    .all();
  let moved = 0;
  for (const r of results) {
    const row = RewrapRowSchema.parse(r);
    const raw = await openBytes(
      master,
      wrapContext(row.user_id),
      row.wrapped_key,
    );
    // Doesn't open under the key it names: left as it is, and counted.
    if (raw?.length !== 32) continue;
    const wrapped = await sealBytes(master, wrapContext(row.user_id), raw);
    raw.fill(0);
    const result = await env.DB.prepare(
      `UPDATE user_keys SET wrapped_key = ?2, master_key_id = ?3
       WHERE user_id = ?1 AND wrapped_key = ?4`,
    )
      .bind(row.user_id, wrapped, master.current.id, row.wrapped_key)
      .run();
    moved += result.meta.changes ?? 0;
  }
  const left = await count("master_key_id = ?1", master.previous.id);
  return { moved, left, stuck };
}
