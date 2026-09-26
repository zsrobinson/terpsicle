import { describe, expect, it } from "vitest";
import { REPLAY_EVENT, TANGLE_ATTR, tangleScript } from "./tangle-script";

// The inline script is the page's text; the browser runs it before the
// app's code. It has to stand on its own.

describe("the tangle script", () => {
  it("is self-contained: one call, its geometry passed in as text", () => {
    expect(tangleScript.startsWith("(function playTangle(")).toBe(true);
    expect(tangleScript).toContain(JSON.stringify(TANGLE_ATTR));
    expect(tangleScript).toContain(JSON.stringify(REPLAY_EVENT));
    // The pure functions ride along as source, not as references.
    expect(tangleScript).toContain("function lineOffset(");
    expect(tangleScript).toContain("function progressAt(");
    expect(tangleScript).toContain("function smoothPath(");
    // Nothing reaches back into a module.
    expect(tangleScript).not.toMatch(/\bimport\b|\brequire\(|\bexports?\b/);
    expect(tangleScript).not.toContain("</script");
  });

  it("waits for reduced motion, and marks the drawing while it plays", () => {
    expect(tangleScript).toContain("prefers-reduced-motion: reduce");
    expect(tangleScript).toContain('"playing"');
    expect(tangleScript).toContain('"done"');
  });
});
