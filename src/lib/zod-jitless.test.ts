import { INLINE_SCRIPTS } from "virtual:terpsicle/inline-scripts";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ZOD_GLOBAL_CONFIG } from "./zod-jitless";

const globals = globalThis as unknown as Record<
  string,
  { jitless?: boolean } | undefined
>;
const before = { ...globals[ZOD_GLOBAL_CONFIG] };

afterEach(() => {
  z.config({ jitless: before.jitless });
});

describe("the zodJitless head script", () => {
  // If a Zod upgrade renames its global, this fails instead of the CSP
  // quietly filling with eval reports.
  it("sets the object Zod reads its config from", () => {
    expect(z.config()).toBe(globals[ZOD_GLOBAL_CONFIG]);
    new Function(INLINE_SCRIPTS.zodJitless)();
    expect(z.config().jitless).toBe(true);
  });

  it("keeps whatever else was configured", () => {
    const g = globals as Record<string, { jitless?: boolean; x?: number }>;
    g[ZOD_GLOBAL_CONFIG] = { x: 1 };
    try {
      new Function(INLINE_SCRIPTS.zodJitless)();
      expect(g[ZOD_GLOBAL_CONFIG]).toEqual({ x: 1, jitless: true });
    } finally {
      g[ZOD_GLOBAL_CONFIG] = z.config();
    }
  });
});
