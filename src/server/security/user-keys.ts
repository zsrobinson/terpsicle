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
 * `test` never names a production row, since production never sets
 * AUTH_TEST_MODE (src/server/auth/auth.test.ts checks its vars).
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

let warned = false;

/**
 * The keys that wrap every account's key. Test mode always uses the fixed
 * test key, so a preview never holds the production secret's output.
 */
export async function userDataKeys(env: UserDataKeyVars): Promise<SealKeys> {
  const vars = UserDataKeyVarsSchema.parse(env);
  const keys = await loadSealKeys(
    vars.AUTH_TEST_MODE === "true"
      ? TEST_USER_DATA_KEY
      : {
          key: vars.USER_DATA_KEY,
          id: vars.USER_DATA_KEY_ID,
          previousKey: vars.USER_DATA_KEY_PREVIOUS,
          previousId: vars.USER_DATA_KEY_PREVIOUS_ID,
        },
  );
  if (!keys) {
    if (!warned) {
      warned = true;
      // Names only: never a value.
      console.error({
        userData:
          "USER_DATA_KEY must be 32 bytes of base64url, with USER_DATA_KEY_ID set",
      });
    }
    throw new UserDataKeyMissing();
  }
  return keys;
}

/** One account's data key, unwrapped for this request only. */
export interface AccountKey {
  readonly userId: string;
  readonly keys: SealKeys;
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

/**
 * The account's key, or null when it has none yet. With `create`, the first
 * call makes one; two first syncs at once both end up with the one stored.
 */
export async function accountKey(
  env: UserDataEnv,
  userId: string,
  { create = false }: { create?: boolean } = {},
): Promise<AccountKey | null> {
  const master = await userDataKeys(env);
  const select = env.DB.prepare(
    "SELECT wrapped_key, master_key_id FROM user_keys WHERE user_id = ?1",
  ).bind(userId);
  let row: unknown = await select.first();
  if (!row && create) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await sealBytes(master, wrapContext(userId), raw);
    raw.fill(0);
    const [, stored] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_keys (user_id, wrapped_key, master_key_id)
         VALUES (?1, ?2, ?3) ON CONFLICT (user_id) DO NOTHING`,
      ).bind(userId, wrapped, master.current.id),
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

/**
 * The daily job's half of a rotation: account keys still wrapped by the
 * previous USER_DATA_KEY wrapped again by the current one, so the previous
 * can be removed once none name it. Returns how many moved.
 */
export async function rewrapAccountKeys(
  env: UserDataEnv,
  limit = 1_000,
): Promise<number> {
  const master = await userDataKeys(env);
  const { results } = await env.DB.prepare(
    "SELECT user_id, wrapped_key FROM user_keys WHERE master_key_id != ?1 LIMIT ?2",
  )
    .bind(master.current.id, limit)
    .all();
  let moved = 0;
  for (const r of results) {
    const row = RewrapRowSchema.parse(r);
    const raw = await openBytes(
      master,
      wrapContext(row.user_id),
      row.wrapped_key,
    );
    // Its key is gone from the env: nothing to do until it's back.
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
  return moved;
}
