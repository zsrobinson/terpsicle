import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";
import type { BlobStore } from "~/ingest/blob-store";

// Production R2 from Node (`--target r2`) through R2's S3 API. Credentials:
// R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY if set; otherwise derived from
// CLOUDFLARE_API_TOKEN (access key = the token's id, secret = SHA-256 of the
// token), which works when that token has R2 write permission.

export const DATA_BUCKET = "terpsicle-data";

async function credentials(): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CLOUDFLARE_API_TOKEN } = process.env;
  if (R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    return { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY };
  }
  if (!CLOUDFLARE_API_TOKEN) {
    throw new Error("Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY, or CLOUDFLARE_API_TOKEN, to write to R2");
  }
  const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` },
  });
  const body = (await response.json()) as { result?: { id?: string } };
  const id = body.result?.id;
  if (!response.ok || !id) {
    throw new Error(`CLOUDFLARE_API_TOKEN didn't verify (HTTP ${response.status})`);
  }
  return {
    accessKeyId: id,
    secretAccessKey: createHash("sha256").update(CLOUDFLARE_API_TOKEN).digest("hex"),
  };
}

export async function createR2S3BlobStore(bucket = DATA_BUCKET): Promise<BlobStore> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!account) throw new Error("Set CLOUDFLARE_ACCOUNT_ID to write to R2");
  const client = new AwsClient({ ...(await credentials()), service: "s3", region: "auto" });
  const base = `https://${account}.r2.cloudflarestorage.com/${bucket}`;
  const url = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const send = async (input: string, init: RequestInit = {}, attempt = 0): Promise<Response> => {
    try {
      const response = await client.fetch(input, init);
      if (response.status >= 500 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        return send(input, init, attempt + 1);
      }
      return response;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return send(input, init, attempt + 1);
    }
  };
  const fail = async (what: string, response: Response): Promise<never> => {
    throw new Error(`R2 ${what} failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  };

  const get = async (key: string) => {
    const response = await send(url(key));
    if (response.status === 404) return null;
    if (!response.ok) await fail(`GET ${key}`, response);
    return { body: new Uint8Array(await response.arrayBuffer()), etag: response.headers.get("etag") ?? "" };
  };
  const put = async (key: string, body: Uint8Array | string, headers: Record<string, string>) =>
    send(url(key), { method: "PUT", body, headers });

  return {
    async get(key) {
      return (await get(key))?.body ?? null;
    },
    getVersioned: get,
    async put(key, body, options) {
      const response = await put(key, body, options?.contentType ? { "Content-Type": options.contentType } : {});
      if (!response.ok) await fail(`PUT ${key}`, response);
    },
    async putIfMatch(key, body, etag, options) {
      const headers: Record<string, string> = etag === null ? { "If-None-Match": "*" } : { "If-Match": etag };
      if (options?.contentType) headers["Content-Type"] = options.contentType;
      const response = await put(key, body, headers);
      if (response.status === 412) return false;
      if (!response.ok) await fail(`conditional PUT ${key}`, response);
      return true;
    },
    async delete(key) {
      const response = await send(url(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404) await fail(`DELETE ${key}`, response);
    },
    async list(prefix) {
      const keys: string[] = [];
      let token: string | null = null;
      do {
        const params = new URLSearchParams({ "list-type": "2", prefix });
        if (token) params.set("continuation-token", token);
        const response = await send(`${base}?${params}`);
        if (!response.ok) await fail(`LIST ${prefix}`, response);
        const xml = await response.text();
        for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(decodeXml(m[1] ?? ""));
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? decodeXml(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "")
          : null;
      } while (token);
      return keys.sort();
    },
  };
}

function decodeXml(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
