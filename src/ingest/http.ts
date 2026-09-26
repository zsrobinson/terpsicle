// Polite HTTP for every source: a descriptive User-Agent, gzip, retries with
// backoff on network errors and 429/5xx, and a concurrency cap (RESEARCH.md §5).

/** Identifies us to every source. Never add personal contact details. */
export const USER_AGENT = "Terpsicle/2 (+https://terpsicle.com)";

/** Crawls never run more than this many requests at once. */
export const MAX_CONCURRENCY = 4;

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface HttpOptions {
  fetch: Fetch;
  /** Attempts per request, including the first. */
  attempts?: number;
  /** Base backoff; doubles per retry. */
  backoffMs?: number;
  /** Injectable so tests don't wait. */
  sleep?: (ms: number) => Promise<void>;
}

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    /** The start of the response body, for telling one 400 from another. */
    readonly detail: string,
  ) {
    super(
      `GET ${url} failed with HTTP ${status}${detail ? `: ${detail}` : ""}`,
    );
    this.name = "HttpError";
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);

export interface HttpClient {
  /** A successful response (2xx), after retries. Throws `HttpError` otherwise. */
  get(url: string, init?: RequestInit): Promise<Response>;
  text(url: string, init?: RequestInit): Promise<string>;
  json(url: string, init?: RequestInit): Promise<unknown>;
  /** Requests made, including retries. */
  readonly stats: { requests: number; retries: number };
}

export function createHttpClient(options: HttpOptions): HttpClient {
  const {
    fetch,
    attempts = 4,
    backoffMs = 500,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;
  const stats = { requests: 0, retries: 0 };

  async function get(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", USER_AGENT);
    if (!headers.has("Accept-Encoding")) headers.set("Accept-Encoding", "gzip");
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        stats.retries++;
        await sleep(backoffMs * 2 ** (attempt - 1));
      }
      stats.requests++;
      let response: Response;
      try {
        response = await fetch(url, { ...init, headers });
      } catch (error) {
        lastError = error;
        continue;
      }
      if (response.ok) return response;
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      lastError = new HttpError(url, response.status, detail.trim());
      if (!RETRYABLE.has(response.status)) break;
    }
    if (lastError instanceof HttpError) throw lastError;
    throw new Error(
      `GET ${url} failed after ${attempts} attempts: ${describe(lastError)}`,
    );
  }

  return {
    stats,
    get,
    async text(url, init) {
      return (await get(url, init)).text();
    },
    async json(url, init) {
      const response = await get(url, init);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(
          `GET ${url} returned invalid JSON: ${text.slice(0, 120)}`,
        );
      }
    },
  };
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    return cause ? `${error.message} (${cause})` : error.message;
  }
  return String(error);
}

/**
 * Runs `fn` over `items` with at most `limit` in flight, in input order for
 * results. The first rejection rejects the whole run after in-flight work ends.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (failure === null && next < items.length) {
      const index = next++;
      // biome-ignore lint/style/noNonNullAssertion: index < items.length was just checked.
      const item = items[index]!;
      try {
        results[index] = await fn(item, index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  if (failure !== null) throw (failure as { error: unknown }).error;
  return results;
}

/**
 * Feeds a response body to `write` as decoded text chunks, so parsers never
 * hold a whole page. Works with Workers and Node fetch alike.
 */
export async function streamText(
  response: Response,
  write: (chunk: string) => void,
): Promise<number> {
  if (!response.body) {
    const text = await response.text();
    write(text);
    return text.length;
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    write(value);
  }
  return length;
}
