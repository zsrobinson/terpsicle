// Small helpers for the JSON API under /api/*.
import type { z } from "zod";
import type { ApiError } from "~/core/schema";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Answers depend on tokens and D1 state: never cache them anywhere.
  "Cache-Control": "no-store",
};

export function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const STATUS: Record<ApiError["error"], number> = {
  "invalid-input": 400,
  "not-found": 404,
  "method-not-allowed": 405,
  "rate-limited": 429,
  unavailable: 503,
  unauthorized: 401,
  forbidden: 403,
};

export function apiError(
  error: ApiError["error"],
  retryAfterSeconds?: number,
): Response {
  const body: ApiError = retryAfterSeconds
    ? { error, retryAfterSeconds }
    : { error };
  const response = json(body, STATUS[error]);
  if (retryAfterSeconds)
    response.headers.set("Retry-After", String(retryAfterSeconds));
  if (error === "method-not-allowed") response.headers.set("Allow", "POST");
  return response;
}

/** Parses the JSON body with `schema`, or returns null (bad JSON, too big, or invalid). */
export async function readInput<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S> | null> {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > 16_384) return null;
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 16_384) return null;
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/** The caller's IP as Cloudflare saw it; "unknown" in tests and local dev. */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
