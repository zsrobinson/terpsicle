// Worker-test helpers for synced docs (imported only by *.test.ts): bodies
// sealed and opened the way ./store.ts does, for tests that write or read
// `sync_docs` rows directly.
import {
  openForAccount,
  SealedDataError,
  sealForAccount,
  type UserDataEnv,
  userData,
} from "../security/user-keys";
import { bodyWhere } from "./store";

/** A body sealed as `pushDocs` seals it (making the account's key if it has none). */
export async function sealedBodyFor(
  env: UserDataEnv,
  userId: string,
  kind: string,
  docId: string,
  body: unknown,
): Promise<string> {
  const account = await userData(env, { testMode: false }).accountKey(userId, {
    create: true,
  });
  if (!account) throw new SealedDataError();
  return sealForAccount(account, bodyWhere(kind, docId), JSON.stringify(body));
}

/** A body as `pullDocs` opens it; throws if it won't. */
export async function openedBodyFor(
  env: UserDataEnv,
  userId: string,
  kind: string,
  docId: string,
  sealed: string,
): Promise<unknown> {
  const account = await userData(env, { testMode: false }).accountKey(userId);
  if (!account) throw new SealedDataError();
  return JSON.parse(
    await openForAccount(account, bodyWhere(kind, docId), sealed),
  );
}
