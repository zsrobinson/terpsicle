import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { IsoDateTime, LocalId, TermId } from "../schema";
import type {
  FourYearDoc,
  FourYearEntry,
  FourYearTerm,
} from "../schema/four-year";
import {
  type FourYearShareEntryV1,
  type FourYearShareV1,
  FourYearShareV1Schema,
} from "../schema/four-year-share";
import { FOUR_YEAR_SHARE_VERSION } from "../schema/versions";
import {
  fromBase64Url,
  MALFORMED,
  NEWER,
  type ShareDecodeError,
  toBase64Url,
} from "./share";

// Four-year share links (DATA.md §8.2): `/plan/shared?plan=<v>.<data>`, where
// `<v>` is the link's version and `<data>` is base64url(deflate-raw(JSON)) of
// that version's wire schema (~/core/schema/four-year-share). The version is
// outside the compressed part, so a link from a newer build is recognized
// without being read, and each version keeps its own decoder: a v2 would add
// a schema and an upgrade from v1, and v1 links still open.
//
// A link never carries grades, entry ids or timestamps: opening one makes a
// read-only doc with fresh ids, and "Save a copy" keeps it.

/** The route a four-year share link opens (src/routes/plan_.shared.tsx). */
export const FOUR_YEAR_SHARED_PATH = "/plan/shared";

/** Longest `plan` value we try to decode; a full 150-entry doc is well under it. */
export const MAX_FOUR_YEAR_SHARE_LENGTH = 12_000;

/** What a link holds, in the doc's own shape: no ids, grades or times. */
export type FourYearShare = {
  readonly name: string;
  readonly firstTermId: TermId;
  readonly template: FourYearDoc["template"];
  /** In column order (term, then position), without ids. */
  readonly entries: readonly SharedEntry[];
};

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
export type SharedEntry = WithoutId<FourYearEntry>;

export type FourYearShareDecodeResult =
  | { readonly ok: true; readonly share: FourYearShare }
  | { readonly ok: false; readonly error: ShareDecodeError };

// ---------- doc → link ----------

/** What a doc shares: everything but ids, times and grades. */
export function fourYearShareOf(doc: FourYearDoc): FourYearShare {
  return {
    name: doc.name,
    firstTermId: doc.firstTermId,
    template: doc.template,
    entries: doc.entries.map(({ id: _, ...entry }) => entry),
  };
}

function entryToV1(entry: SharedEntry): FourYearShareEntryV1 {
  switch (entry.kind) {
    case "course":
      return {
        c: entry.code,
        ...(entry.credits !== null ? { cr: entry.credits } : {}),
        ...(Object.keys(entry.genEdChoices).length > 0
          ? { g: { ...entry.genEdChoices } }
          : {}),
        ...(entry.details ? { d: entry.details } : {}),
        ...(entry.transcript
          ? { x: { t: entry.transcript.title, v: entry.transcript.via } }
          : {}),
        ...(entry.source === "transcript"
          ? { s: "x" as const }
          : entry.source === "template"
            ? { s: "p" as const }
            : {}),
      };
    case "wildcard":
      return {
        w: entry.wildcard,
        cr: entry.credits,
        ...(entry.source === "template" ? { s: "p" as const } : {}),
      };
    case "credit":
      return { a: entry.title, cr: entry.credits, g: [...entry.genEds] };
  }
}

function toV1(share: FourYearShare): FourYearShareV1 {
  const t: Record<string, FourYearShareEntryV1[]> = {};
  for (const entry of share.entries) {
    const list = t[entry.term] ?? [];
    list.push(entryToV1(entry));
    t[entry.term] = list;
  }
  return {
    n: share.name,
    f: share.firstTermId,
    ...(share.template ? { p: share.template } : {}),
    t,
  };
}

/** The `plan` value of a doc's share link. Grades are never read. */
export function encodeFourYearShare(doc: FourYearDoc): string {
  const json = JSON.stringify(toV1(fourYearShareOf(doc)));
  return `${FOUR_YEAR_SHARE_VERSION}.${toBase64Url(deflateSync(strToU8(json), { level: 9 }))}`;
}

/** `https://terpsicle.com/plan/shared?plan=1.…` for the given origin. */
export function fourYearShareUrl(origin: string, doc: FourYearDoc): string {
  return `${origin.replace(/\/+$/, "")}${FOUR_YEAR_SHARED_PATH}?plan=${encodeFourYearShare(doc)}`;
}

// ---------- link → doc ----------

function entryFromV1(term: FourYearTerm, e: FourYearShareEntryV1): SharedEntry {
  if ("c" in e)
    return {
      kind: "course",
      term,
      code: e.c,
      credits: e.cr ?? null,
      genEdChoices: e.g ?? {},
      source: e.s === "x" ? "transcript" : e.s === "p" ? "template" : "typed",
      transcript: e.x ? { title: e.x.t, via: e.x.v } : null,
      ...(e.d ? { details: e.d } : {}),
    };
  if ("w" in e)
    return {
      kind: "wildcard",
      term,
      wildcard: e.w,
      credits: e.cr,
      source: e.s === "p" ? "template" : "typed",
    };
  return {
    kind: "credit",
    term: "before",
    title: e.a,
    credits: e.cr,
    genEds: e.g,
    source: "transcript",
  };
}

/** Terms in column order: "before", then by term id. */
function compareTerms(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "before") return -1;
  if (b === "before") return 1;
  return a < b ? -1 : 1;
}

function fromV1(v1: FourYearShareV1): FourYearShare {
  const terms = Object.keys(v1.t).sort(compareTerms) as FourYearTerm[];
  return {
    name: v1.n,
    firstTermId: v1.f,
    template: v1.p ?? null,
    entries: terms.flatMap((term) =>
      (v1.t[term] ?? []).map((e) => entryFromV1(term, e)),
    ),
  };
}

/**
 * One decoder per version this build reads, each turning its wire JSON into
 * today's `FourYearShare`. Never remove one: links live in advisors' inboxes.
 */
const DECODERS: Readonly<
  Record<number, (json: unknown) => FourYearShare | null>
> = {
  1: (json) => {
    const parsed = FourYearShareV1Schema.safeParse(json);
    return parsed.success ? fromV1(parsed.data) : null;
  },
};

/** Reads a four-year link's `plan` value; a typed error the page can show when it isn't one. */
export function decodeFourYearShare(param: string): FourYearShareDecodeResult {
  const fail = (error: ShareDecodeError) => ({ ok: false, error }) as const;
  if (param.length === 0 || param.length > MAX_FOUR_YEAR_SHARE_LENGTH)
    return fail(MALFORMED);
  const match = /^(\d{1,4})\.([A-Za-z0-9_-]+)$/.exec(param);
  if (!match) return fail(MALFORMED);
  const version = Number(match[1]);
  if (version > FOUR_YEAR_SHARE_VERSION) return fail(NEWER);
  const decode = DECODERS[version];
  const bytes = fromBase64Url(match[2] ?? "");
  if (!decode || !bytes) return fail(MALFORMED);
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(inflateSync(bytes)));
  } catch {
    return fail(MALFORMED);
  }
  const share = decode(json);
  return share ? { ok: true, share } : fail(MALFORMED);
}

/**
 * The doc a link shows, and what "Save a copy" keeps: fresh ids from
 * `newId`, no grades, and the link's name.
 */
export function fourYearDocFromShare(
  share: FourYearShare,
  { id, newId, now }: { id: LocalId; newId: () => LocalId; now: IsoDateTime },
): FourYearDoc {
  return {
    id,
    name: share.name,
    firstTermId: share.firstTermId,
    entries: share.entries.map(
      (entry): FourYearEntry => ({
        ...entry,
        id: newId(),
      }),
    ),
    grades: {},
    template: share.template,
    createdAt: now,
    updatedAt: now,
  };
}
