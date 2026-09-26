import { INLINE_SCRIPT_HASHES } from "virtual:terpsicle/inline-script-hashes";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, cspNonce } from "./headers";

const directives = (policy: string) =>
  new Map(
    policy.split("; ").map((d) => {
      const [name = "", ...values] = d.split(" ");
      return [name, values] as const;
    }),
  );

describe("contentSecurityPolicy", () => {
  const options = {
    nonce: "abc123==",
    scriptHashes: ["'sha256-one='", "'sha256-two='"],
    reportOnly: true,
    reportUrl: "https://terpsicle.com/api/csp-report",
  };

  it("allows scripts from our files, TanStack's by nonce and ours by hash", () => {
    const policy = directives(contentSecurityPolicy(options));
    expect(policy.get("script-src")).toEqual([
      "'self'",
      "'nonce-abc123=='",
      "'sha256-one='",
      "'sha256-two='",
    ]);
    expect(policy.get("default-src")).toEqual(["'self'"]);
  });

  it("is V2.md §12's policy, with somewhere to report", () => {
    expect(directives(contentSecurityPolicy(options))).toEqual(
      new Map([
        ["default-src", ["'self'"]],
        ["script-src", expect.any(Array)],
        ["style-src", ["'self'", "'unsafe-inline'"]],
        ["img-src", ["'self'", "data:", "blob:"]],
        ["font-src", ["'self'"]],
        [
          "connect-src",
          ["'self'", "https://terpsicle.com", "wss://terpsicle.com"],
        ],
        ["worker-src", ["'self'", "blob:"]],
        ["manifest-src", ["'self'"]],
        ["object-src", ["'none'"]],
        ["base-uri", ["'none'"]],
        ["form-action", ["'self'"]],
        ["frame-ancestors", ["'none'"]],
        ["report-uri", ["https://terpsicle.com/api/csp-report"]],
        ["report-to", ["csp"]],
      ]),
    );
  });

  it("upgrades insecure requests only once enforced", () => {
    const enforced = directives(
      contentSecurityPolicy({ ...options, reportOnly: false }),
    );
    expect(enforced.get("upgrade-insecure-requests")).toEqual([]);
  });

  it("leaves the nonce out for pages the app didn't render", () => {
    const policy = contentSecurityPolicy({ ...options, nonce: null });
    expect(policy).not.toContain("nonce");
  });
});

describe("the inline scripts' hashes", () => {
  it("are built from src/app/inline-scripts.ts, one per script", () => {
    expect(INLINE_SCRIPT_HASHES.length).toBeGreaterThanOrEqual(4);
    for (const hash of INLINE_SCRIPT_HASHES)
      expect(hash).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
  });
});

describe("cspNonce", () => {
  it("is 128 fresh random bits each time", () => {
    const a = cspNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(cspNonce()).not.toBe(a);
  });
});
