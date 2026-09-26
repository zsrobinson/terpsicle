import { describe, expect, it, vi } from "vitest";
import { ChunkLoadError, lazyModule } from "./lazy-panel";

describe("lazyModule", () => {
  it("imports once, however often it's asked, and keeps the module", async () => {
    const importer = vi.fn(async () => ({ answer: 42 }));
    const module = lazyModule(importer);
    expect(module.current).toBeUndefined();
    await Promise.all([module.load(), module.load()]);
    await module.load();
    expect(importer).toHaveBeenCalledTimes(1);
    expect(module.current).toEqual({ answer: 42 });
  });

  it("marks a failed load as a chunk that didn't arrive, and tries again next time", async () => {
    const importer = vi
      .fn<() => Promise<{ answer: number }>>()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce({ answer: 42 });
    const module = lazyModule(importer);
    const failed = await module.load().catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(ChunkLoadError);
    expect((failed as ChunkLoadError).cause).toEqual(
      new Error("Failed to fetch"),
    );
    expect(module.current).toBeUndefined();
    await expect(module.load()).resolves.toEqual({ answer: 42 });
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
