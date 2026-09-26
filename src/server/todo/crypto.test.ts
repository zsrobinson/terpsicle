// The feed link at rest (docs/V3.md §3.3): AES-GCM under TODO_FEED_KEY,
// bound to its row, with rotation.
import { describe, expect, it } from "vitest";
import {
  type FeedOwner,
  loadFeedKeys,
  openFeedLink,
  sealedKeyId,
  sealFeedLink,
  TEST_FEED_KEY_VARS,
} from "./crypto";
import { FEED_TOKEN, FEED_URL, TEST_KEYS } from "./testing";

const owner: FeedOwner = { userId: "tstudent", source: "elms" };

async function keys(vars: Parameters<typeof loadFeedKeys>[0]) {
  const loaded = await loadFeedKeys(vars);
  if (!loaded) throw new Error("keys didn't load");
  return loaded;
}

describe("sealing the feed link", () => {
  it("round-trips, names its key, and never shows the link", async () => {
    const k = await keys({
      TODO_FEED_KEY: TEST_KEYS.k1,
      TODO_FEED_KEY_ID: "k1",
    });
    const sealed = await sealFeedLink(k, owner, FEED_URL);
    expect(sealed).toMatch(/^v1\.k1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain(FEED_TOKEN);
    expect(sealedKeyId(sealed)).toBe("k1");
    expect(await openFeedLink(k, owner, sealed)).toBe(FEED_URL);
  });

  it("uses a fresh IV every time", async () => {
    const k = await keys({
      TODO_FEED_KEY: TEST_KEYS.k1,
      TODO_FEED_KEY_ID: "k1",
    });
    const a = await sealFeedLink(k, owner, FEED_URL);
    const b = await sealFeedLink(k, owner, FEED_URL);
    expect(a.split(".")[2]).not.toBe(b.split(".")[2]);
  });

  it("won't open on another person's row, or once tampered with", async () => {
    const k = await keys({
      TODO_FEED_KEY: TEST_KEYS.k1,
      TODO_FEED_KEY_ID: "k1",
    });
    const sealed = await sealFeedLink(k, owner, FEED_URL);
    expect(
      await openFeedLink(k, { userId: "tadmin", source: "elms" }, sealed),
    ).toBeNull();
    const [v, id, iv, data = ""] = sealed.split(".");
    const flipped = `${data.slice(0, -2)}${data.endsWith("A") ? "B" : "A"}${data.slice(-1)}`;
    expect(
      await openFeedLink(k, owner, [v, id, iv, flipped].join(".")),
    ).toBeNull();
    expect(await openFeedLink(k, owner, "v2.k1.x.y")).toBeNull();
    expect(await openFeedLink(k, owner, `${sealed}.extra`)).toBeNull();
  });

  it("opens a row sealed under the previous key during a rotation", async () => {
    const before = await keys({
      TODO_FEED_KEY: TEST_KEYS.k1,
      TODO_FEED_KEY_ID: "k1",
    });
    const sealed = await sealFeedLink(before, owner, FEED_URL);
    const during = await keys({
      TODO_FEED_KEY: TEST_KEYS.k2,
      TODO_FEED_KEY_ID: "k2",
      TODO_FEED_KEY_PREVIOUS: TEST_KEYS.k1,
      TODO_FEED_KEY_PREVIOUS_ID: "k1",
    });
    expect(await openFeedLink(during, owner, sealed)).toBe(FEED_URL);
    expect(sealedKeyId(await sealFeedLink(during, owner, FEED_URL))).toBe("k2");
    // Once the previous key is removed, rows still on it can't be opened.
    const after = await keys({
      TODO_FEED_KEY: TEST_KEYS.k2,
      TODO_FEED_KEY_ID: "k2",
    });
    expect(await openFeedLink(after, owner, sealed)).toBeNull();
  });

  it("refuses a missing or malformed key", async () => {
    expect(await loadFeedKeys({})).toBeNull();
    expect(
      await loadFeedKeys({ TODO_FEED_KEY: "c2hvcnQ", TODO_FEED_KEY_ID: "k1" }),
    ).toBeNull();
    expect(
      await loadFeedKeys({
        TODO_FEED_KEY: TEST_KEYS.k1,
        TODO_FEED_KEY_ID: "k.1",
      }),
    ).toBeNull();
    expect(await loadFeedKeys({ TODO_FEED_KEY: TEST_KEYS.k1 })).toBeNull();
    // A bad previous key is left out, not fatal.
    const k = await keys({
      TODO_FEED_KEY: TEST_KEYS.k1,
      TODO_FEED_KEY_ID: "k1",
      TODO_FEED_KEY_PREVIOUS: "nope",
      TODO_FEED_KEY_PREVIOUS_ID: "k0",
    });
    expect(k.previous).toBeNull();
  });

  it("has a test-mode key that loads under its own id", async () => {
    const k = await keys(TEST_FEED_KEY_VARS);
    expect(k.current.id).toBe("test");
  });
});
