import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import {
  COURSE_COLORS,
  type CourseCode,
  type CourseColor,
  DAYS,
  type Day,
  parseSectionKey,
  SHARE_PAYLOAD_VERSION,
  type SharePayload,
  SharePayloadSchema,
} from "../schema";

// Share links: `/?plan=<base64url(deflate-raw(json))>` (DATA §8).
//
// To keep links short, the JSON inside is a compact array rather than the
// `SharePayload` object, and it is expanded and validated with
// `SharePayloadSchema` on the way out:
//
//   [v, termId, name | 0, sections, saved, blocks, colors]
//
// - sections: section keys joined with spaces ("CMSC351-0101 ENGL393-0312");
// - saved: course codes joined with spaces;
// - blocks: [[label, "MWF", start, end], …];
// - colors: one palette index per course, in sections-then-saved order, as a
//   string of base-36 digits ("-" for none).
//
// Empty lists are "" or [] and an absent name is 0. `v` is first so any
// future layout can still be told apart.

export const SHARE_PARAM = "plan";

/** Longest `plan` value we try to decode; far above any real plan (40 courses). */
export const MAX_SHARE_PARAM_LENGTH = 4096;

export type ShareDecodeError =
  | { readonly kind: "malformed"; readonly message: string }
  | { readonly kind: "newer-version"; readonly message: string };

export type ShareDecodeResult =
  | { readonly ok: true; readonly payload: SharePayload }
  | { readonly ok: false; readonly error: ShareDecodeError };

const MALFORMED: ShareDecodeError = {
  kind: "malformed",
  message: "This share link is incomplete or damaged. Ask for the link again.",
};
const NEWER: ShareDecodeError = {
  kind: "newer-version",
  message:
    "This link was made by a newer version of Terpsicle. Reload to open it.",
};

// ---------- base64url ----------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    const chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63];
    const keep = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let k = 0; k < keep; k++) out += B64[chars[k] ?? 0];
  }
  return out;
}

/** null when the text has characters outside base64url or an impossible length. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const values: number[] = [];
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v === -1) return null;
    values.push(v);
  }
  const out = new Uint8Array(Math.floor((values.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < values.length; i += 4) {
    const n =
      ((values[i] ?? 0) << 18) |
      ((values[i + 1] ?? 0) << 12) |
      ((values[i + 2] ?? 0) << 6) |
      (values[i + 3] ?? 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ---------- compact form ----------

type Wire = [
  number,
  string,
  string | 0,
  string,
  string,
  [string, string, number, number][],
  string,
];

function courseOrder(p: SharePayload): CourseCode[] {
  return [
    ...p.sections.map((k) => parseSectionKey(k)?.courseCode ?? k),
    ...(p.saved ?? []),
  ];
}

/**
 * The payload as the link carries it: empty lists and colors for courses
 * outside the plan are dropped. `decodeShare(encodeShare(p))` equals this.
 */
export function normalizeSharePayload(p: SharePayload): SharePayload {
  const courses = courseOrder(p);
  const colors: Record<CourseCode, CourseColor> = {};
  for (const c of courses) {
    const color = p.colors?.[c];
    if (color) colors[c] = color;
  }
  return {
    v: p.v,
    termId: p.termId,
    ...(p.name !== undefined ? { name: p.name } : {}),
    sections: [...p.sections],
    ...(p.saved?.length ? { saved: [...p.saved] } : {}),
    ...(p.blocks?.length
      ? { blocks: p.blocks.map((b) => ({ ...b, days: [...b.days] })) }
      : {}),
    ...(Object.keys(colors).length ? { colors } : {}),
  };
}

function toWire(p: SharePayload): Wire {
  const colors = courseOrder(p)
    .map((c) => {
      const color = p.colors?.[c];
      return color ? COURSE_COLORS.indexOf(color).toString(36) : "-";
    })
    .join("")
    .replace(/-+$/, "");
  return [
    p.v,
    p.termId,
    p.name ?? 0,
    p.sections.join(" "),
    (p.saved ?? []).join(" "),
    (p.blocks ?? []).map((b) => [b.label, b.days.join(""), b.start, b.end]),
    colors,
  ];
}

const DAY_TOKEN = new RegExp(
  `^(${[...DAYS].sort((a, b) => b.length - a.length).join("|")})`,
);

function parseDays(text: string): Day[] | null {
  const days: Day[] = [];
  let rest = text;
  while (rest) {
    const m = DAY_TOKEN.exec(rest);
    if (!m) return null;
    days.push(m[1] as Day);
    rest = rest.slice(m[1]?.length ?? 1);
  }
  return days;
}

function fromWire(wire: unknown): unknown {
  if (!Array.isArray(wire) || wire.length !== 7) return null;
  const [v, termId, name, sections, saved, blocks, colors] = wire as unknown[];
  if (
    typeof sections !== "string" ||
    typeof saved !== "string" ||
    typeof colors !== "string" ||
    !Array.isArray(blocks)
  )
    return null;
  const sectionList = sections ? sections.split(" ") : [];
  const savedList = saved ? saved.split(" ") : [];
  const courses = [
    ...sectionList.map((k) => parseSectionKey(k)?.courseCode ?? k),
    ...savedList,
  ];
  const colorMap: Record<string, CourseColor> = {};
  for (let i = 0; i < colors.length; i++) {
    const ch = colors[i] ?? "-";
    if (ch === "-") continue;
    const color = COURSE_COLORS[Number.parseInt(ch, 36)];
    const course = courses[i];
    if (!color || !course) return null;
    colorMap[course] = color;
  }
  const blockList = [];
  for (const b of blocks) {
    if (!Array.isArray(b) || b.length !== 4 || typeof b[1] !== "string")
      return null;
    blockList.push({
      label: b[0],
      days: parseDays(b[1]),
      start: b[2],
      end: b[3],
    });
  }
  return {
    v,
    termId,
    ...(name !== 0 ? { name } : {}),
    sections: sectionList,
    ...(savedList.length ? { saved: savedList } : {}),
    ...(blockList.length ? { blocks: blockList } : {}),
    ...(Object.keys(colorMap).length ? { colors: colorMap } : {}),
  };
}

// ---------- codec ----------

/** The `plan` query value for a payload. */
export function encodeShare(payload: SharePayload): string {
  const json = JSON.stringify(toWire(normalizeSharePayload(payload)));
  return toBase64Url(deflateSync(strToU8(json), { level: 9 }));
}

/** Reads a `plan` query value; a typed error the UI can show when it isn't a valid link. */
export function decodeShare(param: string): ShareDecodeResult {
  if (param.length === 0 || param.length > MAX_SHARE_PARAM_LENGTH)
    return { ok: false, error: MALFORMED };
  const bytes = fromBase64Url(param);
  if (!bytes) return { ok: false, error: MALFORMED };
  let wire: unknown;
  try {
    wire = JSON.parse(strFromU8(inflateSync(bytes)));
  } catch {
    return { ok: false, error: MALFORMED };
  }
  const version = Array.isArray(wire) ? wire[0] : undefined;
  if (typeof version === "number" && version > SHARE_PAYLOAD_VERSION)
    return { ok: false, error: NEWER };
  const parsed = SharePayloadSchema.safeParse(fromWire(wire));
  return parsed.success
    ? { ok: true, payload: parsed.data }
    : { ok: false, error: MALFORMED };
}

/** `https://terpsicle.com/?plan=…` for the given origin. */
export function shareUrl(origin: string, payload: SharePayload): string {
  return `${origin.replace(/\/+$/, "")}/?${SHARE_PARAM}=${encodeShare(payload)}`;
}
