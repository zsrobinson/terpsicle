import { cspViolations } from "~/core/security";

// POST /api/csp-report: where browsers send CSP violations (headers.ts).
// It logs a sample, cut down by `cspViolations` to the directive, what was
// blocked (a keyword or an origin) and the page's path: no query strings,
// script samples, IPs or user agents. Nothing is stored, and no counter is
// written: a report-only policy can fire on every page view, and one D1
// write per view would cost more than the reports are worth.

/** The share of reports logged: one in ten is enough to see a pattern. */
export const CSP_REPORT_SAMPLE_RATE = 0.1;
/** Reports bigger than this are dropped unread. */
const MAX_BODY_BYTES = 64 * 1024;
/** The types browsers send reports with. */
const REPORT_TYPES = [
  "application/csp-report",
  "application/reports+json",
  "application/json",
];

export async function handleCspReport(
  request: Request,
  /** Math.random; tests pass their own. */
  random: () => number = Math.random,
): Promise<Response> {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const type = request.headers.get("Content-Type") ?? "";
  if (!REPORT_TYPES.some((t) => type.startsWith(t)))
    return new Response(null, { status: 415 });
  // Sampled before reading, so most reports cost nothing but the request.
  if (random() >= CSP_REPORT_SAMPLE_RATE)
    return new Response(null, { status: 204 });
  if (Number(request.headers.get("Content-Length") ?? "0") > MAX_BODY_BYTES)
    return new Response(null, { status: 413 });
  let body: unknown;
  try {
    // Bytes, not .text(): workerd warns about .text() on these types.
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BODY_BYTES)
      return new Response(null, { status: 413 });
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new Response(null, { status: 400 });
  }
  const origin = new URL(request.url).origin;
  for (const violation of cspViolations(body, origin))
    console.warn({ csp: "violation", ...violation });
  return new Response(null, { status: 204 });
}
