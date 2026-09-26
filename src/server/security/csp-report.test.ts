import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCspReport } from "./csp-report";

const REPORT_URL = "https://terpsicle.com/api/csp-report";
const always = () => 0;
const never = () => 0.99;

const report = {
  "csp-report": {
    "document-uri": "https://terpsicle.com/alerts/confirm?token=SECRET",
    "effective-directive": "script-src-elem",
    "blocked-uri": "inline",
    "script-sample": "alert('terp@umd.edu')",
    disposition: "report",
  },
};

const post = (body: string, type = "application/csp-report") =>
  new Request(REPORT_URL, {
    method: "POST",
    body,
    headers: { "Content-Type": type, "User-Agent": "Mozilla/5.0 (Terp)" },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleCspReport", () => {
  it("logs a sampled report without its query, sample or user agent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await handleCspReport(
      post(JSON.stringify(report)),
      always,
    );
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toEqual({
      csp: "violation",
      directive: "script-src-elem",
      blocked: "inline",
      page: "/alerts/confirm",
      source: null,
      line: null,
      column: null,
      disposition: "report",
    });
    const logged = JSON.stringify(warn.mock.calls);
    for (const secret of ["SECRET", "umd.edu", "Terp"])
      expect(logged).not.toContain(secret);
  });

  it("reads Reporting API batches", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const batch = [
      {
        type: "csp-violation",
        body: {
          documentURL: "https://terpsicle.com/",
          effectiveDirective: "img-src",
          blockedURL: "https://tiles.example/1.png",
        },
      },
    ];
    const response = await handleCspReport(
      post(JSON.stringify(batch), "application/reports+json"),
      always,
    );
    expect(response.status).toBe(204);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      directive: "img-src",
      blocked: "https://tiles.example",
      page: "/",
    });
  });

  it("logs nothing outside the sample", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await handleCspReport(post(JSON.stringify(report)), never);
    expect(response.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("takes only report POSTs, and nothing huge", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      (await handleCspReport(new Request(REPORT_URL), always)).status,
    ).toBe(405);
    expect(
      (await handleCspReport(post("{}", "text/plain"), always)).status,
    ).toBe(415);
    expect((await handleCspReport(post("{not json"), always)).status).toBe(400);
    const huge = JSON.stringify({ "csp-report": { x: "a".repeat(70_000) } });
    expect((await handleCspReport(post(huge), always)).status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });
});
