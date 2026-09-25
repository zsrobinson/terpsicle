// TODO(core): replace with ~/core/share once M1 core lands. A minimal codec
// for `/?plan=<base64url(deflate-raw(UTF-8 JSON))>` (DATA.md §8), so the
// shared-link view works before core's version (with its tests) arrives.
import {
  SHARE_PAYLOAD_VERSION,
  type SharePayload,
  SharePayloadSchema,
} from "~/core/schema";

export type ShareDecodeResult =
  | { ok: true; payload: SharePayload }
  | { ok: false; reason: "newer-version" | "invalid"; message: string };

const INVALID: ShareDecodeResult = {
  ok: false,
  reason: "invalid",
  message: "This share link is incomplete or damaged. Ask for a new one.",
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeSharePayload(
  payload: SharePayload,
): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeSharePayload(
  param: string,
): Promise<ShareDecodeResult> {
  let raw: unknown;
  try {
    const bytes = await pipe(
      fromBase64Url(param),
      new DecompressionStream("deflate-raw"),
    );
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return INVALID;
  }
  const version =
    typeof raw === "object" && raw !== null && "v" in raw ? raw.v : undefined;
  if (typeof version === "number" && version > SHARE_PAYLOAD_VERSION) {
    return {
      ok: false,
      reason: "newer-version",
      message:
        "This link was made by a newer version of Terpsicle. Reload to open it.",
    };
  }
  const parsed = SharePayloadSchema.safeParse(raw);
  return parsed.success ? { ok: true, payload: parsed.data } : INVALID;
}
