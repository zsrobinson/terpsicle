import { describe, expect, it } from "vitest";
import { alertsHarnessPort, checkoutId, e2ePort } from "./e2e-checkout";

describe("e2e checkout isolation", () => {
  it("gives each checkout its own stable id and pair of ports", () => {
    const a = "/home/user/terpsicle";
    const b = "/home/user/terpsicle/.claude/worktrees/agent-1";
    expect(checkoutId(a)).toBe(checkoutId(`${a}/`));
    expect(checkoutId(a)).not.toBe(checkoutId(b));
    for (const root of [a, b]) {
      const port = e2ePort(root, undefined);
      expect(port).toBeGreaterThanOrEqual(3100);
      expect(port).toBeLessThan(3900);
      // Even, so no checkout's app port is another's harness port.
      expect(port % 2).toBe(0);
      expect(e2ePort(root, undefined)).toBe(port);
      expect(alertsHarnessPort(root, undefined)).toBe(port + 1);
    }
  });

  it("lets E2E_PORT pick the ports", () => {
    expect(e2ePort("/anywhere", "4320")).toBe(4320);
    expect(alertsHarnessPort("/anywhere", "4320")).toBe(4321);
  });
});
