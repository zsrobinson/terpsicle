import { describe, expect, it } from "vitest";
import {
  blockedSummary,
  cspViolations,
  pagePath,
  sourceSummary,
} from "./csp-report";

const ORIGIN = "https://terpsicle.com";

// Shapes as browsers send them (trimmed): Firefox's report-uri body and
// Chrome's Reporting API batch.
const legacyReport = {
  "csp-report": {
    "document-uri": "https://terpsicle.com/alerts/confirm?token=SECRET#frag",
    referrer: "https://mail.example.com/?user=terp@umd.edu",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "original-policy": "default-src 'self'",
    disposition: "report",
    "blocked-uri": "inline",
    "line-number": 1,
    "column-number": "12",
    "source-file": "https://terpsicle.com/alerts/confirm?token=SECRET",
    "script-sample": "alert('terp@umd.edu')",
    "status-code": 200,
  },
};

const reportingApiBatch = [
  {
    type: "csp-violation",
    age: 10,
    url: "https://terpsicle.com/?plan=abc",
    user_agent: "Mozilla/5.0 …",
    body: {
      documentURL: "https://terpsicle.com/?plan=abc",
      blockedURL: "https://evil.example/x.js?who=terp",
      effectiveDirective: "script-src-elem",
      originalPolicy: "…",
      sourceFile: "chrome-extension://abcdef/content.js",
      sample: "",
      disposition: "report",
      statusCode: 200,
      lineNumber: 3,
      columnNumber: 9,
    },
  },
  { type: "deprecation", body: { id: "x" } },
];

describe("cspViolations", () => {
  it("keeps only what's safe to log from a report-uri report", () => {
    const [violation, ...rest] = cspViolations(legacyReport, ORIGIN);
    expect(rest).toEqual([]);
    expect(violation).toEqual({
      directive: "script-src-elem",
      blocked: "inline",
      page: "/alerts/confirm",
      source: "self/alerts/confirm",
      line: 1,
      column: 12,
      disposition: "report",
    });
    const logged = JSON.stringify(violation);
    expect(logged).not.toContain("SECRET");
    expect(logged).not.toContain("umd.edu");
  });

  it("reads Reporting API batches and skips other report types", () => {
    const violations = cspViolations(reportingApiBatch, ORIGIN);
    expect(violations).toEqual([
      {
        directive: "script-src-elem",
        blocked: "https://evil.example",
        page: "/",
        source: "chrome-extension://abcdef",
        line: 3,
        column: 9,
        disposition: "report",
      },
    ]);
    expect(JSON.stringify(violations)).not.toContain("terp");
  });

  it("caps how many one request can log", () => {
    const batch = Array.from({ length: 50 }, () => reportingApiBatch[0]);
    expect(cspViolations(batch, ORIGIN, 5)).toHaveLength(5);
  });

  it("ignores bodies that aren't reports", () => {
    expect(cspViolations(null, ORIGIN)).toEqual([]);
    expect(cspViolations("nope", ORIGIN)).toEqual([]);
    expect(cspViolations({ "csp-report": "x" }, ORIGIN)).toEqual([]);
    expect(cspViolations([{ type: "csp-violation" }], ORIGIN)).toEqual([]);
  });

  it("falls back to the violated directive's name, and refuses odd ones", () => {
    const [a] = cspViolations(
      { "csp-report": { "violated-directive": "img-src 'self' data:" } },
      ORIGIN,
    );
    expect(a?.directive).toBe("img-src");
    const [b] = cspViolations(
      { "csp-report": { "effective-directive": "<script>" } },
      ORIGIN,
    );
    expect(b?.directive).toBe("unknown");
    expect(b?.line).toBeNull();
    expect(b?.disposition).toBeNull();
  });
});

describe("blockedSummary", () => {
  it.each([
    ["eval", "eval"],
    ["data", "data"],
    ["data:image/png;base64,AAAA", "data"],
    ["blob:https://terpsicle.com/1234", "blob"],
    ["https://terpsicle.com/avatars/terp/abc.jpg", "self"],
    ["https://tiles.example/0/0/0.pbf?key=1", "https://tiles.example"],
    ["", "unknown"],
    [undefined, "unknown"],
  ])("%s → %s", (value, expected) => {
    expect(blockedSummary(value, ORIGIN)).toBe(expected);
  });
});

describe("pagePath and sourceSummary", () => {
  it("never keep another origin's path or any query", () => {
    expect(pagePath("https://other.example/x", ORIGIN)).toBe("unknown");
    expect(pagePath(undefined, ORIGIN)).toBe("unknown");
    expect(
      pagePath(`https://terpsicle.com/${"a".repeat(500)}`, ORIGIN),
    ).toHaveLength(120);
    expect(sourceSummary("https://cdn.example/lib.js?v=1", ORIGIN)).toBe(
      "https://cdn.example",
    );
    expect(sourceSummary("/assets/index-abc.js?x=1", ORIGIN)).toBe(
      "self/assets/index-abc.js",
    );
    expect(sourceSummary("", ORIGIN)).toBeNull();
    expect(sourceSummary("eval", ORIGIN)).toBe("eval");
  });
});
