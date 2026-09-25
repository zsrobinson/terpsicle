import { describe, expect, it } from "vitest";
import type { SharePayload } from "~/core/schema";
import { aBlock, aSharePayload } from "~/fixtures";
import { decodeSharePayload, encodeSharePayload } from "./share-codec";

const PAYLOAD = aSharePayload({
  sections: ["CMSC351-0101", "CMSC330-0101"],
  saved: ["ENGL101"],
  blocks: [aBlock()].map(({ label, days, start, end }) => ({
    label,
    days,
    start,
    end,
  })),
  colors: { CMSC351: "violet" },
});

async function encodeRaw(value: unknown): Promise<string> {
  // Reuse the encoder's framing for arbitrary JSON.
  return encodeSharePayload(value as SharePayload);
}

describe("share codec (local seam until core/share lands)", () => {
  it("round-trips a payload through a URL-safe string", async () => {
    const text = await encodeSharePayload(PAYLOAD);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeSharePayload(text)).toEqual({
      ok: true,
      payload: PAYLOAD,
    });
  });

  it("says plainly when a link is from a newer version", async () => {
    const result = await decodeSharePayload(
      await encodeRaw({ ...PAYLOAD, v: 2 }),
    );
    expect(result).toMatchObject({ ok: false, reason: "newer-version" });
    if (!result.ok) expect(result.message).toMatch(/newer version/);
  });

  it.each([
    ["garbage", "not a real link"],
    ["empty", ""],
  ])("rejects %s", async (_, text) => {
    expect(await decodeSharePayload(text)).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects a payload that breaks the schema", async () => {
    const twice = { ...PAYLOAD, saved: ["CMSC351"] };
    expect(await decodeSharePayload(await encodeRaw(twice))).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });
});
