// `/mcp`: Terpsicle's public MCP server (docs/MCP.md), over Streamable
// HTTP, stateless. The SDK's `createMcpHandler` serves the 2026-07-28
// protocol and, statelessly, 2025-era clients; it builds a fresh server
// per request, so any isolate answers any call and nothing is kept between
// them but the published files' cache (./data.ts).
//
// No sign-in and no cookies: it serves only what /data already serves to
// anyone. So any origin may call it (CORS `*`, like /data), and the
// spec's Origin check, which guards local servers from DNS rebinding,
// has nothing to protect here. What it does guard is cost: a per-IP limit
// from Cloudflare's rate-limiting binding, and a small body cap.
import { createMcpHandler } from "@modelcontextprotocol/server";
import { mcpData } from "./data";
import {
  buildMcpServer,
  MCP_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "./server";

export const MCP_PATH = "/mcp";
export const MCP_SERVER_CARD_PATH = `${MCP_PATH}/server-card`;

/** A tool call's arguments are small; nothing an agent sends needs more. */
const MAX_BODY_BYTES = 64 * 1024;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(CORS_HEADERS))
    out.headers.set(name, value);
  // Answers depend on the request body: no shared cache keeps them.
  if (!out.headers.has("Cache-Control"))
    out.headers.set("Cache-Control", "no-store");
  return out;
}

/** What a registry or client reads to find the server (SEP-2127, Server Cards). */
export function serverCard(origin: string) {
  return {
    name: `com.terpsicle/${MCP_SERVER_NAME}`,
    title: "Terpsicle",
    version: MCP_SERVER_VERSION,
    description:
      "University of Maryland courses for agents: search, sections and live seats, prerequisites, offering patterns across past terms, instructors with PlanetTerp ratings and grades, and a schedule checker and generator. Public data, no sign-in.",
    websiteUrl: origin,
    remotes: [{ type: "streamable-http", url: `${origin}${MCP_PATH}` }],
    instructions: MCP_INSTRUCTIONS,
  };
}

function json(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

/** Rate-limit bindings are absent where wrangler doesn't set one up (tests, some previews). */
type Limiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type McpEnv = Pick<Env, "DATA"> & { MCP_RATE_LIMIT?: Limiter };

export async function handleMcp(
  request: Request,
  env: McpEnv,
  now: () => Date = () => new Date(),
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS")
    return withCors(new Response(null, { status: 204 }));

  if (url.pathname === MCP_SERVER_CARD_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD")
      return withCors(
        new Response(null, { status: 405, headers: { Allow: "GET" } }),
      );
    return withCors(
      json(serverCard(url.origin), {
        headers: {
          "Content-Type": "application/mcp-server-card+json",
          "Cache-Control": "public, max-age=3600",
        },
      }),
    );
  }
  if (url.pathname !== MCP_PATH)
    return withCors(
      json({ error: "Not found. The MCP endpoint is /mcp." }, { status: 404 }),
    );

  if (
    request.method === "GET" &&
    !request.headers.get("Accept")?.includes("text/event-stream")
  )
    // A person opening the URL: say what it is.
    return withCors(
      new Response(
        `Terpsicle's MCP server: University of Maryland course data for AI agents.\n\nAdd ${url.origin}${MCP_PATH} to your MCP client as a Streamable HTTP server. No sign-in.\nMore: ${url.origin}${MCP_SERVER_CARD_PATH}\n`,
        {
          status: 405,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            Allow: "POST",
          },
        },
      ),
    );

  const limiter = env.MCP_RATE_LIMIT;
  if (limiter && request.method === "POST") {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await limiter.limit({ key: `mcp:${ip}` });
    if (!success)
      return withCors(
        json(
          {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32000,
              message:
                "Too many requests: Terpsicle's MCP server allows 600 calls a minute per address. Wait a minute and try again.",
            },
          },
          { status: 429, headers: { "Retry-After": "60" } },
        ),
      );
  }

  const data = mcpData(env.DATA);
  const handler = createMcpHandler(() => buildMcpServer(data, now), {
    maxRequestBodySize: MAX_BODY_BYTES,
  });
  return withCors(await handler.fetch(request));
}
