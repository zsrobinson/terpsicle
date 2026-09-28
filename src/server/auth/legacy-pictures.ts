// Profile pictures are gone (the owner, 2026-09-28; docs/decisions.md "No
// profile pictures"). Until then, sign-in copied each Google picture into
// R2 `USER_CONTENT` under `avatars/<userId>/`. The daily job deletes what's
// left there, a page at a time, so nothing of them stays stored.
//
// Follow-up: once `avatars/` is empty in production and preview, delete this
// file and its call in src/jobs/daily.ts. (The `users` columns that pointed
// at these copies are gone: migration 0022_drop_unused_columns.)

/** Where the pictures lived in `USER_CONTENT`. */
export const LEGACY_PICTURES_PREFIX = "avatars/";

/** R2 lists and deletes at most 1,000 keys at a time. */
const PAGE = 1000;

/** Deletes up to `pages` pages of old pictures; returns how many objects went. */
export async function sweepLegacyPictures(
  bucket: R2Bucket,
  pages = 5,
): Promise<number> {
  let deleted = 0;
  for (let page = 0; page < pages; page++) {
    const listed = await bucket.list({
      prefix: LEGACY_PICTURES_PREFIX,
      limit: PAGE,
    });
    const keys = listed.objects.map((o) => o.key);
    if (keys.length === 0) break;
    await bucket.delete(keys);
    deleted += keys.length;
    if (!listed.truncated) break;
  }
  return deleted;
}
